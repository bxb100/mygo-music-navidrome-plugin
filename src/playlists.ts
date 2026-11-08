import { call, coverURL, pack, rawId, setting } from "./api";
import { toTrack } from "./catalog";
import type { Playlist } from "./types";

export function toPlaylist(playlist: any, withTracks?: boolean): Playlist {
  const out: Playlist = {
    id: pack("pl", playlist.id),
    name: playlist.name,
    trackCount: playlist.songCount || 0,
    mine: playlist.owner === setting("username"),
  };
  if (playlist.comment) out.description = playlist.comment;
  if (playlist.owner) out.owner = playlist.owner;
  const image = coverURL(playlist.coverArt);
  if (image) out.imageUrl = image;
  if (withTracks) out.tracks = (playlist.entry || []).map(toTrack);
  return out;
}

export async function playlists(): Promise<Playlist[]> {
  const data = await call("getPlaylists");
  return ((data.playlists && data.playlists.playlist) || []).map((playlist: any) => toPlaylist(playlist));
}

export async function playlist({ id }: { id: string }): Promise<Playlist> {
  const data = await call("getPlaylist", { id: rawId(id) });
  return toPlaylist(data.playlist, true);
}

export async function createPlaylist({ name }: { name: string }): Promise<Playlist> {
  const data = await call("createPlaylist", { name });
  return toPlaylist(data.playlist, true);
}

export async function renamePlaylist({ id, name }: { id: string; name: string }): Promise<void> {
  await call("updatePlaylist", { playlistId: rawId(id), name });
}

export async function deletePlaylist({ id }: { id: string }): Promise<void> {
  await call("deletePlaylist", { id: rawId(id) });
}

export async function addToPlaylist({ id, trackIds }: { id: string; trackIds: string[] }): Promise<void> {
  await call("updatePlaylist", {
    playlistId: rawId(id),
    songIdToAdd: trackIds.map((trackId) => rawId(trackId)),
  });
}

export async function removeFromPlaylist({ id, trackIds }: { id: string; trackIds: string[] }): Promise<void> {
  const data = await call("getPlaylist", { id: rawId(id) });
  const remove = new Set(trackIds.map((trackId) => rawId(trackId)));
  const indexes: number[] = [];
  const songs = (data.playlist && data.playlist.entry) || [];
  for (let i = 0; i < songs.length; i++) {
    if (remove.has(songs[i].id)) indexes.push(i);
  }
  if (!indexes.length) return;
  await call("updatePlaylist", { playlistId: rawId(id), songIndexToRemove: indexes });
}

export async function movePlaylistTrack({ id, from, to }: { id: string; from: number; to: number }): Promise<void> {
  const data = await call("getPlaylist", { id: rawId(id) });
  const songs: string[] = ((data.playlist && data.playlist.entry) || []).map((song: any) => song.id);
  if (from === to || from < 0 || to < 0 || from >= songs.length || to >= songs.length) return;
  const moved = songs.splice(from, 1)[0];
  songs.splice(to, 0, moved);
  await call("updatePlaylist", {
    playlistId: rawId(id),
    songIndexToRemove: songs.map((_, index) => index),
    songIdToAdd: songs,
  });
}
