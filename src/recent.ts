import { call, rawId } from "./api";
import { toAlbum, toTrack } from "./catalog";
import { PAGE_SIZE, RADIO_RECENT_MAX } from "./constants";
import { albumList } from "./discovery";
import type { Album, Track } from "./types";

export async function recent(): Promise<Track[]> {
  const data = await call("getAlbumList2", { type: "recent", size: 3 });
  const albums = albumList(data);
  const pages = await Promise.all(albums.map((album: any) => call("getAlbum", { id: album.id })));
  const tracks: Track[] = [];
  for (const page of pages) {
    for (const song of (page.album && page.album.song) || []) {
      tracks.push(toTrack(song));
      if (tracks.length === PAGE_SIZE) return tracks;
    }
  }
  return tracks;
}

export async function played({ id }: { id: string }): Promise<void> {
  const songId = rawId(id);
  const pending = host.storage.get("radioPending") || [];
  host.storage.set(
    "radioPending",
    pending.filter((item: string) => item !== songId),
  );
  const recent = host.storage.get("radioRecent") || [];
  host.storage.set(
    "radioRecent",
    [songId, ...recent.filter((item: string) => item !== songId)].slice(0, RADIO_RECENT_MAX),
  );
  await call("scrobble", { id: songId, submission: "true", time: Date.now() });
}

export async function liked({ offset }: { offset?: number }): Promise<{ tracks: Track[]; more: boolean }> {
  const data = await call("getStarred2");
  const songs = (data.starred2 && data.starred2.song) || [];
  const at = Number(offset || 0);
  return { tracks: songs.slice(at, at + 100).map(toTrack), more: songs.length > at + 100 };
}

export async function isLiked({ ids }: { ids: string[] }): Promise<Record<string, boolean>> {
  const data = await call("getStarred2");
  const songs = (data.starred2 && data.starred2.song) || [];
  const starred = new Set(songs.map((song: any) => song.id));
  const result: Record<string, boolean> = {};
  for (const id of ids) result[id] = starred.has(rawId(id));
  return result;
}

export async function like({ id, on }: { id: string; on: boolean }): Promise<void> {
  await call(on ? "star" : "unstar", { id: rawId(id) });
}

export async function saveAlbum({ id, on }: { id: string; on: boolean }): Promise<void> {
  await call(on ? "star" : "unstar", { albumId: rawId(id) });
}

export async function savedAlbums({ offset }: { offset?: number }): Promise<{ albums: Album[]; more: boolean }> {
  const at = Number(offset || 0);
  const data = await call("getAlbumList2", { type: "starred", size: 100, offset: at });
  const albums = albumList(data).map(toAlbum);
  return { albums, more: albums.length === 100 };
}
