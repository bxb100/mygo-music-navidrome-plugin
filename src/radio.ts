import { call, pack, rawId, tr } from "./api";
import { toTrack } from "./catalog";
import { ENDLESS_RADIO, RADIO_BATCH, RADIO_FETCH } from "./constants";
import type { Station, Track } from "./types";
import { fail } from "./utils";

export async function radioStations() {
  const data = await call("getInternetRadioStations");
  return (data.internetRadioStations && data.internetRadioStations.internetRadioStation) || [];
}

export function clearRadio() {
  host.storage.remove("radioPending");
  host.storage.remove("radioRecent");
}

export function pickRadioSongs(songs: any[], skip: string[]) {
  const seen = new Set(skip);
  const picked = [];
  for (const song of songs) {
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    picked.push(song);
    if (picked.length === RADIO_BATCH) break;
  }
  return picked;
}

export async function endlessNext(): Promise<Track[]> {
  const pending = host.storage.get("radioPending") || [];
  const recent = host.storage.get("radioRecent") || [];
  const randomSongs = async () => {
    const data = await call("getRandomSongs", { size: RADIO_FETCH });
    return (data.randomSongs && data.randomSongs.song) || [];
  };

  let picked = pickRadioSongs(await randomSongs(), recent.concat(pending));
  if (!picked.length && recent.length) {
    host.storage.remove("radioRecent");
    picked = pickRadioSongs(await randomSongs(), pending);
  }
  host.storage.set("radioPending", pending.concat(picked.map((song: any) => song.id)));
  return picked.map(toTrack);
}

export async function stations(): Promise<Station[]> {
  const radios = await radioStations();
  return [
    {
      id: pack("rd", ENDLESS_RADIO),
      name: tr("Endless Radio"),
      description: tr("Plays your library at random, skipping what you've heard recently."),
    },
    ...radios.map((radio: any) => ({
      id: pack("rd", radio.id),
      name: radio.name,
      description: radio.homePageUrl,
    })),
  ];
}

export async function stationNext({ id }: { id: string }): Promise<Track[]> {
  const wanted = rawId(id);
  if (wanted === ENDLESS_RADIO) return endlessNext();
  const radio = (await radioStations()).find((station: any) => station.id === wanted);
  if (!radio) throw fail("unavailable", tr("That radio station is gone."));
  return [
    {
      id: pack("rd", radio.id),
      name: radio.name,
      artists: [],
      album: { id: pack("rd", radio.id), name: tr("Radio") },
      duration: 0,
    },
  ];
}
