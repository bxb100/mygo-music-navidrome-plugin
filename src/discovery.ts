import { call, tr } from "./api";
import { toAlbum, toTrack } from "./catalog";
import type { BrowseResult, BrowseSection, Track } from "./types";

export function albumList(data: any): any[] {
  return (data.albumList2 && data.albumList2.album) || [];
}

export function topGenre(albums: any[]): string {
  const counts: Record<string, number> = {};
  let best = "";
  let bestCount = 0;
  for (const album of albums) {
    const genre = album.genre;
    if (!genre) continue;
    counts[genre] = (counts[genre] || 0) + 1;
    if (counts[genre] > bestCount) {
      best = genre;
      bestCount = counts[genre];
    }
  }
  return best;
}

export async function forYou(frequent: any, starred: any): Promise<Track[]> {
  const genre = topGenre(albumList(frequent).concat(albumList(starred)));
  const params: Record<string, any> = { size: 12 };
  if (genre) params.genre = genre;
  const data = await call("getRandomSongs", params);
  let songs = (data.randomSongs && data.randomSongs.song) || [];
  if (genre && songs.length < 6) {
    const extra = await call("getRandomSongs", { size: 12 - songs.length });
    const have = new Set(songs.map((song: any) => song.id));
    songs = songs.concat(
      ((extra.randomSongs && extra.randomSongs.song) || []).filter((song: any) => !have.has(song.id)),
    );
  }
  return songs.slice(0, 12).map(toTrack);
}

export async function home(): Promise<BrowseResult> {
  const lists = await Promise.all([
    call("getAlbumList2", { type: "newest", size: 12 }),
    call("getAlbumList2", { type: "recent", size: 12 }),
    call("getAlbumList2", { type: "frequent", size: 12 }),
    call("getAlbumList2", { type: "starred", size: 12 }),
  ]);
  const recommendations = await forYou(lists[2], lists[3]);
  const specs = [
    ["Recently added", "newest"],
    ["Recently played", "recent"],
    ["Most played", "frequent"],
    ["Starred albums", "starred"],
  ];
  const sections: BrowseSection[] = [];
  if (recommendations.length) sections.push({ title: tr("For you"), tracks: recommendations });
  for (let i = 0; i < lists.length; i++) {
    const albums = albumList(lists[i]);
    if (!albums.length) continue;
    sections.push({
      title: tr(specs[i][0]),
      albums: albums.map(toAlbum),
      morePage: "albums:" + specs[i][1] + ":12",
    });
  }
  return { title: tr("Home"), sections };
}
