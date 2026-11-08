export interface HostProcess {
  closeStdin(): void;
  readLine(): Promise<string | null>;
  wait(): Promise<number>;
  errorOutput(): string;
  kill(): void;
}

export interface HostStorage {
  get(key: string): any;
  set(key: string, value: any): void;
  remove(key: string): void;
}

export interface HostCrypto {
  md5(text: string): string;
}

export interface Host {
  platform: string;
  arch: string;
  dir: string;
  dataDir: string;
  setting(key: string): unknown;
  storage: HostStorage;
  crypto: HostCrypto;
  t(text: string): string;
  language(): string;
  spawn(command: string, args: string[]): HostProcess;
  webSignIn?(url: string): Promise<any>;
}

declare global {
  const host: Host;
}

export interface Account {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface ArtistRef {
  id: string;
  name: string;
}

export interface AlbumRef {
  id: string;
  name: string;
  imageUrl?: string;
  artists?: ArtistRef[];
}

export interface Track {
  id: string;
  name: string;
  artists: ArtistRef[];
  album: AlbumRef;
  duration: number;
}

export interface Album {
  id: string;
  name: string;
  saved?: boolean;
  imageUrl?: string;
  artists?: ArtistRef[];
  released?: string;
}

export interface Artist {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface Playlist {
  id: string;
  name: string;
  trackCount: number;
  mine: boolean;
  description?: string;
  owner?: string;
  imageUrl?: string;
  tracks?: Track[];
}

export interface Station {
  id: string;
  name: string;
  description?: string;
}

export interface StreamResult {
  url: string;
  type: string;
  quality?: string;
  size?: number;
  bitRate?: number;
}

export interface LyricsWord {
  start: number;
  end: number;
  text: string;
}

export interface LyricsLine {
  start: number;
  end?: number;
  text: string;
  words?: LyricsWord[];
  translation?: string;
}

export interface LyricsResult {
  lines?: LyricsLine[];
  lrc?: string;
  translation?: string;
}

export interface BrowseSection {
  title?: string;
  albums?: Album[];
  tracks?: Track[];
  artists?: Artist[];
  links?: { title: string; page: string }[];
  morePage?: string;
}

export interface BrowseResult {
  title: string;
  sections: BrowseSection[];
}

export interface SearchResult {
  tracks?: Track[];
  albums?: Album[];
  artists?: Artist[];
  playlists?: Playlist[];
  more: boolean;
}
