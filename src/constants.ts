export const API_VERSION = "1.16.1";
export const CLIENT_NAME = "MyGo Music";
export const MEDIA_SALT = "mygo-music";
export const PAGE_SIZE = 50;
export const ALBUM_PAGE = 30;
export const RAW_TYPES = ["mp3", "flac", "ogg", "oga", "wav", "m4a", "aac"];
export const SERVING_AT_MOST = 3;
export const SERVED_WITHIN = 10 * 60 * 1000;
export const DEFAULT_IMAGE = "https://www.navidrome.org/favicons/apple-icon-114x114.png";
export const ENDLESS_RADIO = "__endless__";
export const RADIO_BATCH = 50;
export const RADIO_FETCH = 500;
export const RADIO_RECENT_MAX = 200;

export const ALBUM_TITLES: Record<string, string> = {
  newest: "Recently added",
  recent: "Recently played",
  frequent: "Most played",
  starred: "Starred albums",
  random: "Random albums",
  alphabeticalByName: "All albums",
  alphabeticalByArtist: "All albums",
};

export const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};
