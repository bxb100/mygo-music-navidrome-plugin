import { XML_ENTITIES } from "./constants";
import type { LyricsLine } from "./types";

export function fail(code: string, message: string) {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

export function pad(value: string | number) {
  const text = String(value);
  return text.length === 1 ? "0" + text : text;
}

export function lrcTime(ms: number) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return pad(minutes) + ":" + pad(seconds) + "." + pad(centis);
}

export function lrcFromLines(lines: { value: string; start?: number }[], offset: number, synced: boolean) {
  if (!synced) return lines.map((line) => line.value).join("\n");
  return lines
    .map((line) => "[" + lrcTime(Math.max(0, Number(line.start || 0) + offset)) + "]" + line.value)
    .join("\n");
}

export function unescapeXML(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, entity) => {
    if (entity[0] !== "#") return XML_ENTITIES[entity] || all;
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return String.fromCodePoint(code);
  });
}

export function clockOf(value?: string | null) {
  if (!value) return null;
  const parts = value.trim().replace(/s$/, "").split(":");
  if (parts.length > 3 || parts.some((part) => part === "" || !(Number(part) >= 0))) return null;
  return Math.round(parts.reduce((sum, part) => sum * 60 + Number(part), 0) * 1000);
}

export function attrOf(attrs: string, name: string) {
  return attrs.match(new RegExp("\\s" + name + '="([^"]*)"'))?.[1];
}

export function linesOfTTML(ttml: string): LyricsLine[] {
  const lines: LyricsLine[] = [];
  for (const [, attrs, body] of ttml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const words: { start: number; end: number; text: string }[] = [];
    let text = "";
    let lead = "";
    let word: { start: number; end: number; text: string } | null = null;
    let depth = 0;
    for (const [, close, name, spanAttrs, chars] of body.matchAll(/<(\/?)([\w:.-]+)([^>]*?)\/?>|([^<]+)/g)) {
      if (chars !== undefined) {
        const value = unescapeXML(chars);
        text += value;
        if (word) word.text += value;
        else if (words.length) words[words.length - 1].text += value;
        else lead += value;
        continue;
      }
      if (name !== "span") continue;
      if (close) {
        if (word && --depth === 0) {
          words.push(word);
          word = null;
        }
      } else if (word) {
        depth++;
      } else {
        const start = clockOf(attrOf(spanAttrs, "begin"));
        if (start === null) continue;
        word = { start, end: clockOf(attrOf(spanAttrs, "end")) ?? start, text: lead.trimStart() };
        lead = "";
        depth = 1;
      }
    }
    const start = clockOf(attrOf(attrs, "begin")) ?? words[0]?.start;
    const end = clockOf(attrOf(attrs, "end")) ?? words[words.length - 1]?.end ?? 0;
    text = text.replace(/\s+/g, " ").trim();
    if (text && start != null) lines.push({ start, end, text, words: words.length ? words : undefined });
  }
  return lines;
}

export function suffixOf(url?: string) {
  const path = String(url || "").split("?")[0];
  const at = path.lastIndexOf(".");
  return at === -1 ? "" : path.slice(at + 1).toLowerCase();
}

export function streamType(suffix: string) {
  if (suffix === "ogg" || suffix === "oga" || suffix === "opus") return "ogg";
  if (["flac", "wav", "m4a", "aac"].indexOf(suffix) !== -1) return suffix;
  return "mp3";
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
