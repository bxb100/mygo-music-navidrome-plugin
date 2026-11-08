import { call } from "./api";
import { toAlbum, toArtist, toTrack } from "./catalog";
import { PAGE_SIZE } from "./constants";
import { toPlaylist } from "./playlists";
import type { SearchResult } from "./types";

export async function search({
  query,
  kind,
  offset,
}: {
  query?: string;
  kind?: string;
  offset?: number;
}): Promise<SearchResult> {
  const text = String(query || "");
  const at = Number(offset || 0);
  if (!text.trim()) return { more: false };
  if (kind === "playlists") {
    const data = await call("getPlaylists");
    const all = ((data.playlists && data.playlists.playlist) || []).filter(
      (playlist: any) => playlist.name.toLowerCase().indexOf(text.toLowerCase()) !== -1,
    );
    return {
      playlists: all.slice(at, at + PAGE_SIZE).map((playlist: any) => toPlaylist(playlist)),
      more: all.length > at + PAGE_SIZE,
    };
  }
  if (kind === "shows") return { more: false };
  const data = await call("search3", {
    query: text,
    artistCount: kind === "artists" ? PAGE_SIZE : 0,
    artistOffset: kind === "artists" ? at : 0,
    albumCount: kind === "albums" ? PAGE_SIZE : 0,
    albumOffset: kind === "albums" ? at : 0,
    songCount: kind === "tracks" ? PAGE_SIZE : 0,
    songOffset: kind === "tracks" ? at : 0,
  });
  const result = data.searchResult3 || {};
  if (kind === "artists") {
    const artists = (result.artist || []).map(toArtist);
    return { artists, more: artists.length === PAGE_SIZE };
  }
  if (kind === "albums") {
    const albums = (result.album || []).map(toAlbum);
    return { albums, more: albums.length === PAGE_SIZE };
  }
  if (kind === "tracks") {
    const tracks = (result.song || []).map(toTrack);
    return { tracks, more: tracks.length === PAGE_SIZE };
  }
  return { more: false };
}

export async function suggest({ query }: { query?: string }): Promise<string[]> {
  if (!query) return [];
  const data = await call("search3", { query, artistCount: 5, albumCount: 5, songCount: 10 });
  const result = data.searchResult3 || {};
  const names: string[] = [];
  for (const song of result.song || []) names.push(song.title);
  for (const album of result.album || []) names.push(album.name);
  for (const artist of result.artist || []) names.push(artist.name);
  return names.filter((name, index) => name && names.indexOf(name) === index).slice(0, 10);
}
