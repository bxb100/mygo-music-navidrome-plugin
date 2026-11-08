import { call, mediaURL, rawId, tr, unpack } from "./api";
import { RAW_TYPES, SERVED_WITHIN, SERVING_AT_MOST } from "./constants";
import { radioStations } from "./radio";
import type { HostProcess, LyricsLine, LyricsResult, StreamResult } from "./types";
import { fail, linesOfTTML, lrcFromLines, sleep, streamType, suffixOf } from "./utils";

let ffmpegPath: string | null = null;
const serving: HostProcess[] = [];

export async function findFfmpeg() {
  if (ffmpegPath) return ffmpegPath;
  const places = ["ffmpeg", "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/local/bin/ffmpeg"];
  for (const place of places) {
    try {
      const proc = host.spawn(place, ["-version"]);
      proc.closeStdin();
      while ((await proc.readLine()) !== null) {}
      if ((await proc.wait()) === 0) {
        ffmpegPath = place;
        return place;
      }
    } catch {}
  }
  throw fail("setup", tr("Install ffmpeg with Homebrew and allow the plugin to start it"));
}

export function stopWaiting() {
  while (serving.length >= SERVING_AT_MOST) serving.shift()?.kill();
}

export async function serve(source: string, bitRate: number) {
  const ffmpeg = await findFfmpeg();
  stopWaiting();
  const port = 20000 + Math.floor(Math.random() * 40000);
  const proc = host.spawn(ffmpeg, [
    "-nostdin",
    "-hide_banner",
    "-nostats",
    "-rw_timeout",
    "15000000",
    "-i",
    source,
    "-vn",
    "-c:a",
    "libmp3lame",
    "-b:a",
    bitRate + "k",
    "-id3v2_version",
    "0",
    "-write_xing",
    "0",
    "-f",
    "mp3",
    "-listen",
    "1",
    "http://127.0.0.1:" + port + "/",
  ]);
  proc.closeStdin();
  serving.push(proc);
  let stopped = false;
  const timer = setTimeout(() => proc.kill(), SERVED_WITHIN);
  proc.wait().then(() => {
    stopped = true;
    clearTimeout(timer);
    const at = serving.indexOf(proc);
    if (at >= 0) serving.splice(at, 1);
  });
  const until = Date.now() + 15000;
  let last = "";
  let quietSince = Date.now();
  while (true) {
    if (stopped) throw new Error("ffmpeg stopped: " + proc.errorOutput().trim().split("\n").pop());
    const output = proc.errorOutput();
    if (output !== last) {
      last = output;
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= 100 && /^\s*Stream #0:\d+[^:]*: Audio:[^\n]*\n/m.test(output)) {
      break;
    }
    if (Date.now() > until) {
      proc.kill();
      throw new Error(tr("the audio didn't start in time"));
    }
    await sleep(30);
  }
  return "http://127.0.0.1:" + port + "/";
}

export async function stream({ id, quality }: { id: string; quality?: string }): Promise<StreamResult> {
  const ref = unpack(id);
  if (ref.kind === "rd") {
    const radio = (await radioStations()).find((station: any) => station.id === ref.id);
    if (!radio) throw fail("unavailable", tr("That radio station is gone."));
    return { url: radio.streamUrl, type: streamType(suffixOf(radio.streamUrl)), quality };
  }
  const data = await call("getSong", { id: ref.id });
  const song = data.song;
  const suffix = String(song.suffix || "").toLowerCase();
  const level = quality || "standard";
  const source = mediaURL("stream", { id: ref.id, format: "raw" });
  if (RAW_TYPES.indexOf(suffix) !== -1) {
    const out: StreamResult = { url: source, type: streamType(suffix), quality: level };
    if (song.size) out.size = song.size;
    return out;
  }
  const bitRate = level === "standard" ? 128 : 320;
  return {
    url: await serve(source, bitRate),
    type: "mp3",
    quality: level,
    bitRate: bitRate * 1000,
  };
}

export function fromStructured(list: any[]): LyricsResult {
  const main = list.find((item) => !item.kind || item.kind === "main") || list[0];
  const offset = Number(main.offset || 0);
  const lines = main.line || [];
  const translation = list.find(
    (item) => item !== main && item.kind === "translation" && (item.line || []).length === lines.length,
  );
  if (Array.isArray(main.cueLine) && main.cueLine.length) {
    return {
      lines: main.cueLine.map((cueLine: any, index: number) => {
        const line: LyricsLine = {
          start: Number(cueLine.start == null ? 0 : cueLine.start) + offset,
          text: cueLine.value,
        };
        if (cueLine.end != null) line.end = Number(cueLine.end) + offset;
        if (Array.isArray(cueLine.cue) && cueLine.cue.length) {
          line.words = cueLine.cue.map((cue: any) => ({
            start: Number(cue.start) + offset,
            end: Number(cue.end == null ? cue.start : cue.end) + offset,
            text: cue.value,
          }));
        }
        if (translation && translation.line[index]) line.translation = translation.line[index].value;
        return line;
      }),
    };
  }
  const out: LyricsResult = { lrc: lrcFromLines(lines, offset, main.synced === true) };
  if (translation) {
    out.translation = lrcFromLines(
      translation.line || [],
      Number(translation.offset || 0),
      translation.synced === true,
    );
  }
  return out;
}

export async function betterLyrics(song: any): Promise<LyricsLine[]> {
  const artist =
    (song.artists || [])
      .map((item: any) => item.name)
      .filter(Boolean)
      .join(", ") ||
    song.artist ||
    "";
  const query = new URLSearchParams({ s: song.title || song.name || "", a: artist });
  if (song.album) query.set("al", song.album);
  if (song.duration) query.set("d", String(Math.round(Number(song.duration))));
  const response = await fetch(`https://api.betterlyrics.org/getLyrics?${query}`, {
    headers: { "user-agent": "MyGo Music (https://github.com/egoist/mygo-music)" },
  });
  if (!response.ok) return [];
  return linesOfTTML(((await response.json()) as any).ttml || "");
}

export async function lyrics({ id }: { id: string }): Promise<LyricsResult> {
  const raw = rawId(id);
  const data = await call("getSong", { id: raw });
  const song = data.song || {};
  try {
    const lines = await betterLyrics(song);
    if (lines.length) return { lines };
  } catch (error: any) {
    console.warn(`Better Lyrics: ${error.message}`);
  }
  let structured = null;
  try {
    const lyricsData = await call("getLyricsBySongId", { id: raw, enhanced: "true" });
    structured = lyricsData.lyricsList && lyricsData.lyricsList.structuredLyrics;
  } catch {
    structured = null;
  }
  if (Array.isArray(structured) && structured.length) return fromStructured(structured);
  const legacy = await call("getLyrics", { artist: song.artist || "", title: song.title || "" });
  const value = legacy.lyrics && legacy.lyrics.value;
  if (!value) throw fail("unavailable", tr("No lyrics for this song."));
  return { lrc: value };
}
