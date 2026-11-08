import { artistRef, call, coverURL, pack, rawId } from "./api";
import { PAGE_SIZE } from "./constants";
import type { Album, AlbumRef, Artist, ArtistRef, Track } from "./types";
import { pad } from "./utils";

export function trackArtists(song: any): ArtistRef[] {
  if (Array.isArray(song.artists) && song.artists.length) {
    return song.artists.map((artist: any) => ({ id: pack("ar", artist.id), name: artist.name }));
  }
  const artist = artistRef(song.artistId, song.artist);
  return artist ? [artist] : [];
}

export function albumRef(song: any): AlbumRef {
  const album: AlbumRef = {
    id: song.albumId ? pack("al", song.albumId) : "",
    name: song.album || "",
  };
  const image = coverURL(song.coverArt);
  if (image) album.imageUrl = image;
  if (Array.isArray(song.albumArtists) && song.albumArtists.length) {
    album.artists = [{ id: pack("ar", song.albumArtists[0].id), name: song.albumArtists[0].name }];
  } else if (song.displayAlbumArtist) {
    album.artists = [{ id: pack("ar", song.displayAlbumArtist), name: song.displayAlbumArtist }];
  }
  return album;
}

export function toTrack(song: any): Track {
  return {
    id: pack("tr", song.id),
    name: song.title || song.name || "",
    artists: trackArtists(song),
    album: albumRef(song),
    duration: Math.round(Number(song.duration || 0) * 1000),
  };
}

export function releaseDate(album: any): string | undefined {
  const date = album.releaseDate;
  if (date && date.year) {
    return date.year + "-" + pad(date.month || 1) + "-" + pad(date.day || 1);
  }
  if (album.created && String(album.created).indexOf("0001-") !== 0) {
    return String(album.created).slice(0, 10);
  }
  if (album.year) return album.year + "-01-01";
  return;
}

export function toAlbum(album: any): Album {
  const out: Album = {
    id: pack("al", album.id),
    name: album.name,
    saved: Boolean(album.starred),
  };
  const image = coverURL(album.coverArt);
  if (image) out.imageUrl = image;
  const artist = artistRef(album.artistId, album.artist);
  if (artist) out.artists = [artist];
  const released = releaseDate(album);
  if (released) out.released = released;
  return out;
}

export function toArtist(artist: any): Artist {
  const out: Artist = {
    id: pack("ar", artist.id),
    name: artist.name,
  };
  const image = coverURL(artist.coverArt) || artist.artistImageUrl;
  if (image) out.imageUrl = image;
  return out;
}

export async function album({ id }: { id: string }) {
  const data = await call("getAlbum", { id: rawId(id) });
  const item = data.album;
  return { album: toAlbum(item), tracks: (item.song || []).map(toTrack) };
}

export async function artist({ id }: { id: string }) {
  const data = await call("getArtist", { id: rawId(id) });
  const item = data.artist;
  const albums = item.album || [];
  const pages = await Promise.all(albums.slice(0, 4).map((entry: any) => call("getAlbum", { id: entry.id })));
  const seen = new Set();
  const tracks: Track[] = [];
  for (const page of pages) {
    for (const song of (page.album && page.album.song) || []) {
      if (seen.has(song.id)) continue;
      seen.add(song.id);
      tracks.push(toTrack(song));
    }
  }
  return { artist: toArtist(item), tracks: tracks.slice(0, PAGE_SIZE), albums: albums.map(toAlbum) };
}
