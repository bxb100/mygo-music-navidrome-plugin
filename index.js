// Navidrome, through its Subsonic API. Sees the library the account can see.

const API_VERSION = "1.16.1";
const CLIENT_NAME = "MyGo Music";
const MEDIA_SALT = "mygo-music";
const PAGE_SIZE = 50;
const ALBUM_PAGE = 30;
const RAW_TYPES = ["mp3", "flac", "ogg"];
const SERVING_AT_MOST = 3;
const SERVED_WITHIN = 10 * 60 * 1000;
const DEFAULT_IMAGE = "https://www.navidrome.org/favicons/apple-icon-114x114.png";
const ENDLESS_RADIO = "__endless__";
const RADIO_BATCH = 50;
const RADIO_FETCH = 500;
const RADIO_RECENT_MAX = 200;

const tr = (text) => host.t(text);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function setting(key) {
  const value = host.setting(key);
  return value == null ? "" : String(value).trim();
}

function password() {
  const value = host.setting("password");
  return value == null ? "" : String(value);
}

function server() {
  const value = setting("serverUrl");
  if (!value) throw fail("setup", tr("Fill in your Navidrome server, username and password in the plugin's settings."));
  const base = value.replace(/\/+$/, "");
  return /^https?:\/\//i.test(base) ? base : "http://" + base;
}

function authPairs() {
  const user = setting("username");
  const pass = password();
  if (!user || !pass) throw fail("setup", tr("Fill in your Navidrome server, username and password in the plugin's settings."));
  const salt = Math.random().toString(36).slice(2, 10);
  return [
    ["u", user],
    ["t", host.crypto.md5(pass + salt)],
    ["s", salt],
    ["v", API_VERSION],
    ["c", CLIENT_NAME],
  ];
}

function mediaAuthPairs() {
  return [
    ["u", setting("username")],
    ["t", host.crypto.md5(password() + MEDIA_SALT)],
    ["s", MEDIA_SALT],
    ["v", API_VERSION],
    ["c", CLIENT_NAME],
  ];
}

function pairsOf(params) {
  const pairs = [];
  for (const key in params) {
    const value = params[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) pairs.push([key, String(item)]);
    } else {
      pairs.push([key, String(value)]);
    }
  }
  return pairs;
}

function urlFor(path, pairs) {
  const query = pairs
    .map((pair) => encodeURIComponent(pair[0]) + "=" + encodeURIComponent(pair[1]))
    .join("&");
  return server() + path + "?" + query;
}

function endpoint(method, params) {
  return urlFor("/rest/" + method + ".view", authPairs().concat(pairsOf(params || {}), [["f", "json"]]));
}

function mediaURL(method, params) {
  return urlFor("/rest/" + method + ".view", mediaAuthPairs().concat(pairsOf(params || {})));
}

async function call(method, params) {
  let response;
  try {
    response = await fetch(endpoint(method, params));
  } catch (error) {
    throw fail("unavailable", tr("Can't reach your Navidrome server.") + " " + error.message);
  }
  if (!response.ok) {
    throw fail("unavailable", tr("Navidrome answered with an error.") + " (" + response.status + ")");
  }
  const body = await response.json();
  const data = body["subsonic-response"];
  if (!data) throw fail("unavailable", tr("Navidrome answered something that isn't a Subsonic response."));
  if (data.status === "failed") {
    const error = data.error || {};
    if (error.code === 40 || error.code === 41) {
      throw fail("setup", tr("Navidrome refused the username or password."));
    }
    if (error.code === 70) throw fail("unavailable", tr("Navidrome couldn't find that."));
    throw new Error(error.message || tr("Navidrome refused the request."));
  }
  return data;
}

const pack = (kind, id) => kind + ":" + id;

function unpack(id) {
  const text = String(id == null ? "" : id);
  const at = text.indexOf(":");
  if (at === -1) return { kind: "tr", id: text };
  return { kind: text.slice(0, at), id: text.slice(at + 1) };
}

const rawId = (id) => unpack(id).id;

function coverURL(id) {
  if (!id) return;
  return mediaURL("getCoverArt", { id, size: "{size}" });
}

function artistRef(id, name) {
  if (!name) return null;
  return { id: pack("ar", id || name), name };
}

function trackArtists(song) {
  if (Array.isArray(song.artists) && song.artists.length) {
    return song.artists.map((artist) => ({ id: pack("ar", artist.id), name: artist.name }));
  }
  const artist = artistRef(song.artistId, song.artist);
  return artist ? [artist] : [];
}

function albumRef(song) {
  const album = {
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

function toTrack(song) {
  return {
    id: pack("tr", song.id),
    name: song.title || song.name || "",
    artists: trackArtists(song),
    album: albumRef(song),
    duration: Math.round(Number(song.duration || 0) * 1000),
  };
}

function releaseDate(album) {
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

function toAlbum(album) {
  const out = {
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

function toArtist(artist) {
  const out = {
    id: pack("ar", artist.id),
    name: artist.name,
  };
  const image = coverURL(artist.coverArt) || artist.artistImageUrl;
  if (image) out.imageUrl = image;
  return out;
}

function toPlaylist(playlist, withTracks) {
  const out = {
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

function albumList(data) {
  return (data.albumList2 && data.albumList2.album) || [];
}

function topGenre(albums) {
  const counts = {};
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

async function forYou(frequent, starred) {
  const genre = topGenre(albumList(frequent).concat(albumList(starred)));
  const params = { size: 12 };
  if (genre) params.genre = genre;
  const data = await call("getRandomSongs", params);
  let songs = (data.randomSongs && data.randomSongs.song) || [];
  if (genre && songs.length < 6) {
    const extra = await call("getRandomSongs", { size: 12 - songs.length });
    const have = new Set(songs.map((song) => song.id));
    songs = songs.concat(
      ((extra.randomSongs && extra.randomSongs.song) || []).filter((song) => !have.has(song.id))
    );
  }
  return songs.slice(0, 12).map(toTrack);
}

function pad(value) {
  const text = String(value);
  return text.length === 1 ? "0" + text : text;
}

const ALBUM_TITLES = {
  newest: "Recently added",
  recent: "Recently played",
  frequent: "Most played",
  starred: "Starred albums",
  random: "Random albums",
  alphabeticalByName: "All albums",
  alphabeticalByArtist: "All albums",
};

function albumTitle(type) {
  return tr(ALBUM_TITLES[type] || "Albums");
}

export async function signIn() {
  await call("ping");
  const me = { id: setting("username"), name: setting("username"), imageUrl: DEFAULT_IMAGE };
  host.storage.set("account", me);
  return me;
}

export function signOut() {
  host.storage.remove("account");
  clearRadio();
}

export function account() {
  const me = host.storage.get("account");
  if (!me) return null;
  return { ...me, imageUrl: me.imageUrl || DEFAULT_IMAGE };
}

export function setSetting({ key }) {
  if (key === "serverUrl" || key === "username" || key === "password") {
    host.storage.remove("account");
    clearRadio();
  }
}

export async function home() {
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
  const sections = [];
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

export async function browse({ page }) {
  const target = String(page || "");
  if (target === "artists") {
    const data = await call("getArtists");
    const indexes = (data.artists && data.artists.index) || [];
    const artists = [];
    for (const index of indexes) {
      for (const artist of index.artist || []) artists.push(toArtist(artist));
    }
    return { title: tr("Artists"), sections: [{ artists }] };
  }
  if (target === "genres") {
    const data = await call("getGenres");
    const genres = (data.genres && data.genres.genre) || [];
    return {
      title: tr("Genres"),
      sections: [{ links: genres.map((genre) => ({ title: genre.value, page: "genre:" + genre.value })) }],
    };
  }
  if (target.indexOf("genre:") === 0) {
    const name = target.slice(6);
    const results = await Promise.all([
      call("getSongsByGenre", { genre: name, count: 100 }),
      call("getAlbumList2", { type: "byGenre", genre: name, size: ALBUM_PAGE }),
    ]);
    const sections = [];
    const albums = albumList(results[1]);
    if (albums.length) sections.push({ title: tr("Albums"), albums: albums.map(toAlbum) });
    const songs = (results[0].songsByGenre && results[0].songsByGenre.song) || [];
    if (songs.length) sections.push({ title: tr("Songs"), tracks: songs.map(toTrack) });
    return { title: name, sections };
  }
  if (target.indexOf("albums:") === 0) {
    const parts = target.split(":");
    const type = parts[1];
    const offset = Number(parts[2] || 0);
    const data = await call("getAlbumList2", { type, size: ALBUM_PAGE, offset });
    const albums = albumList(data).map(toAlbum);
    const section = { albums };
    if (albums.length === ALBUM_PAGE) {
      section.morePage = "albums:" + type + ":" + (offset + ALBUM_PAGE);
    }
    return { title: albumTitle(type), sections: [section] };
  }
  throw fail("unavailable", tr("No such page."));
}

export async function search({ query, kind, offset }) {
  const text = String(query || "");
  const at = Number(offset || 0);
  if (!text.trim()) return { more: false };
  if (kind === "playlists") {
    const data = await call("getPlaylists");
    const all = ((data.playlists && data.playlists.playlist) || []).filter(
      (playlist) => playlist.name.toLowerCase().indexOf(text.toLowerCase()) !== -1
    );
    return {
      playlists: all.slice(at, at + PAGE_SIZE).map((playlist) => toPlaylist(playlist)),
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

export async function suggest({ query }) {
  if (!query) return [];
  const data = await call("search3", { query, artistCount: 5, albumCount: 5, songCount: 10 });
  const result = data.searchResult3 || {};
  const names = [];
  for (const song of result.song || []) names.push(song.title);
  for (const album of result.album || []) names.push(album.name);
  for (const artist of result.artist || []) names.push(artist.name);
  return names.filter((name, index) => name && names.indexOf(name) === index).slice(0, 10);
}

export async function recent() {
  const data = await call("getAlbumList2", { type: "recent", size: 3 });
  const albums = albumList(data);
  const pages = await Promise.all(albums.map((album) => call("getAlbum", { id: album.id })));
  const tracks = [];
  for (const page of pages) {
    for (const song of (page.album && page.album.song) || []) {
      tracks.push(toTrack(song));
      if (tracks.length === PAGE_SIZE) return tracks;
    }
  }
  return tracks;
}

export async function played({ id }) {
  const songId = rawId(id);
  const pending = host.storage.get("radioPending") || [];
  host.storage.set("radioPending", pending.filter((item) => item !== songId));
  const recent = host.storage.get("radioRecent") || [];
  host.storage.set(
    "radioRecent",
    [songId, ...recent.filter((item) => item !== songId)].slice(0, RADIO_RECENT_MAX)
  );
  await call("scrobble", { id: songId, submission: "true", time: Date.now() });
}

export async function liked({ offset }) {
  const data = await call("getStarred2");
  const songs = (data.starred2 && data.starred2.song) || [];
  const at = Number(offset || 0);
  return { tracks: songs.slice(at, at + 100).map(toTrack), more: songs.length > at + 100 };
}

export async function isLiked({ ids }) {
  const data = await call("getStarred2");
  const songs = (data.starred2 && data.starred2.song) || [];
  const starred = new Set(songs.map((song) => song.id));
  const result = {};
  for (const id of ids) result[id] = starred.has(rawId(id));
  return result;
}

export async function like({ id, on }) {
  await call(on ? "star" : "unstar", { id: rawId(id) });
}

export async function album({ id }) {
  const data = await call("getAlbum", { id: rawId(id) });
  const item = data.album;
  return { album: toAlbum(item), tracks: (item.song || []).map(toTrack) };
}

export async function artist({ id }) {
  const data = await call("getArtist", { id: rawId(id) });
  const item = data.artist;
  const albums = item.album || [];
  const pages = await Promise.all(albums.slice(0, 4).map((entry) => call("getAlbum", { id: entry.id })));
  const seen = new Set();
  const tracks = [];
  for (const page of pages) {
    for (const song of (page.album && page.album.song) || []) {
      if (seen.has(song.id)) continue;
      seen.add(song.id);
      tracks.push(toTrack(song));
    }
  }
  return { artist: toArtist(item), tracks: tracks.slice(0, PAGE_SIZE), albums: albums.map(toAlbum) };
}

export async function saveAlbum({ id, on }) {
  await call(on ? "star" : "unstar", { albumId: rawId(id) });
}

export async function savedAlbums({ offset }) {
  const at = Number(offset || 0);
  const data = await call("getAlbumList2", { type: "starred", size: 100, offset: at });
  const albums = albumList(data).map(toAlbum);
  return { albums, more: albums.length === 100 };
}

export async function playlists() {
  const data = await call("getPlaylists");
  return ((data.playlists && data.playlists.playlist) || []).map((playlist) => toPlaylist(playlist));
}

export async function playlist({ id }) {
  const data = await call("getPlaylist", { id: rawId(id) });
  return toPlaylist(data.playlist, true);
}

export async function createPlaylist({ name }) {
  const data = await call("createPlaylist", { name });
  return toPlaylist(data.playlist, true);
}

export async function renamePlaylist({ id, name }) {
  await call("updatePlaylist", { playlistId: rawId(id), name });
}

export async function deletePlaylist({ id }) {
  await call("deletePlaylist", { id: rawId(id) });
}

export async function addToPlaylist({ id, trackIds }) {
  await call("updatePlaylist", {
    playlistId: rawId(id),
    songIdToAdd: trackIds.map((trackId) => rawId(trackId)),
  });
}

export async function removeFromPlaylist({ id, trackIds }) {
  const data = await call("getPlaylist", { id: rawId(id) });
  const remove = new Set(trackIds.map((trackId) => rawId(trackId)));
  const indexes = [];
  const songs = (data.playlist && data.playlist.entry) || [];
  for (let i = 0; i < songs.length; i++) {
    if (remove.has(songs[i].id)) indexes.push(i);
  }
  if (!indexes.length) return;
  await call("updatePlaylist", { playlistId: rawId(id), songIndexToRemove: indexes });
}

export async function movePlaylistTrack({ id, from, to }) {
  const data = await call("getPlaylist", { id: rawId(id) });
  const songs = ((data.playlist && data.playlist.entry) || []).map((song) => song.id);
  if (from === to || from < 0 || to < 0 || from >= songs.length || to >= songs.length) return;
  const moved = songs.splice(from, 1)[0];
  songs.splice(to, 0, moved);
  await call("updatePlaylist", {
    playlistId: rawId(id),
    songIndexToRemove: songs.map((_, index) => index),
    songIdToAdd: songs,
  });
}

async function radioStations() {
  const data = await call("getInternetRadioStations");
  return (data.internetRadioStations && data.internetRadioStations.internetRadioStation) || [];
}

function clearRadio() {
  host.storage.remove("radioPending");
  host.storage.remove("radioRecent");
}

function pickRadioSongs(songs, skip) {
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

async function endlessNext() {
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
  host.storage.set("radioPending", pending.concat(picked.map((song) => song.id)));
  return picked.map(toTrack);
}

export async function stations() {
  const radios = await radioStations();
  return [
    {
      id: pack("rd", ENDLESS_RADIO),
      name: tr("Endless Radio"),
      description: tr("Plays your library at random, skipping what you've heard recently."),
    },
    ...radios.map((radio) => ({
      id: pack("rd", radio.id),
      name: radio.name,
      description: radio.homePageUrl,
    })),
  ];
}

export async function stationNext({ id }) {
  const wanted = rawId(id);
  if (wanted === ENDLESS_RADIO) return endlessNext();
  const radio = (await radioStations()).find((station) => station.id === wanted);
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

function suffixOf(url) {
  const path = String(url || "").split("?")[0];
  const at = path.lastIndexOf(".");
  return at === -1 ? "" : path.slice(at + 1).toLowerCase();
}

function streamType(suffix) {
  if (suffix === "flac") return "flac";
  if (suffix === "ogg" || suffix === "oga" || suffix === "opus") return "ogg";
  return "mp3";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let ffmpegPath = null;
const serving = [];

async function findFfmpeg() {
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
    } catch (error) {}
  }
  throw fail("setup", tr("Install ffmpeg with Homebrew and allow the plugin to start it"));
}

function stopWaiting() {
  while (serving.length >= SERVING_AT_MOST) serving.shift().kill();
}

async function serve(source, bitRate) {
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
  while (!proc.errorOutput().includes("Input #0")) {
    if (stopped) throw new Error("ffmpeg stopped: " + proc.errorOutput().trim().split("\n").pop());
    if (Date.now() > until) {
      proc.kill();
      throw new Error(tr("the audio didn't start in time"));
    }
    await sleep(30);
  }
  await sleep(100);
  return "http://127.0.0.1:" + port + "/";
}

export async function stream({ id, quality }) {
  const ref = unpack(id);
  if (ref.kind === "rd") {
    const radio = (await radioStations()).find((station) => station.id === ref.id);
    if (!radio) throw fail("unavailable", tr("That radio station is gone."));
    return { url: radio.streamUrl, type: streamType(suffixOf(radio.streamUrl)), quality };
  }
  const data = await call("getSong", { id: ref.id });
  const song = data.song;
  const suffix = String(song.suffix || "").toLowerCase();
  const level = quality || "standard";
  const source = mediaURL("stream", { id: ref.id, format: "raw" });
  if (level === "lossless" && RAW_TYPES.indexOf(suffix) !== -1) {
    const out = { url: source, type: streamType(suffix), quality: level };
    if (song.size) out.size = song.size;
    return out;
  }
  const bitRate = level === "standard" ? 128 : 320;
  try {
    return {
      url: await serve(source, bitRate),
      type: "mp3",
      quality: level,
      bitRate: bitRate * 1000,
    };
  } catch (error) {
    if (error.code !== "setup" || RAW_TYPES.indexOf(suffix) === -1) throw error;
    const out = { url: source, type: streamType(suffix), quality: level };
    if (song.size) out.size = song.size;
    return out;
  }
}

function lrcTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return pad(minutes) + ":" + pad(seconds) + "." + pad(centis);
}

function lrcFromLines(lines, offset, synced) {
  if (!synced) return lines.map((line) => line.value).join("\n");
  return lines
    .map((line) => "[" + lrcTime(Math.max(0, Number(line.start || 0) + offset)) + "]" + line.value)
    .join("\n");
}

function fromStructured(list) {
  const main = list.find((item) => !item.kind || item.kind === "main") || list[0];
  const offset = Number(main.offset || 0);
  const lines = main.line || [];
  const translation = list.find(
    (item) => item !== main && item.kind === "translation" && (item.line || []).length === lines.length
  );
  if (Array.isArray(main.cueLine) && main.cueLine.length) {
    return {
      lines: main.cueLine.map((cueLine, index) => {
        const line = {
          start: Number(cueLine.start == null ? 0 : cueLine.start) + offset,
          text: cueLine.value,
        };
        if (cueLine.end != null) line.end = Number(cueLine.end) + offset;
        if (Array.isArray(cueLine.cue) && cueLine.cue.length) {
          line.words = cueLine.cue.map((cue) => ({
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
  const out = { lrc: lrcFromLines(lines, offset, main.synced === true) };
  if (translation) {
    out.translation = lrcFromLines(
      translation.line || [],
      Number(translation.offset || 0),
      translation.synced === true
    );
  }
  return out;
}

const XML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function unescapeXML(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, entity) => {
    if (entity[0] !== "#") return XML_ENTITIES[entity] || all;
    const code =
      entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return String.fromCodePoint(code);
  });
}

function clockOf(value) {
  if (!value) return null;
  const parts = value.trim().replace(/s$/, "").split(":");
  if (parts.length > 3 || parts.some((part) => part === "" || !(Number(part) >= 0))) return null;
  return Math.round(parts.reduce((sum, part) => sum * 60 + Number(part), 0) * 1000);
}

function attrOf(attrs, name) {
  return attrs.match(new RegExp('\\s' + name + '="([^"]*)"'))?.[1];
}

function linesOfTTML(ttml) {
  const lines = [];
  for (const [, attrs, body] of ttml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const words = [];
    let text = "";
    let lead = "";
    let word = null;
    let depth = 0;
    for (const [, close, name, spanAttrs, chars] of body.matchAll(
      /<(\/?)([\w:.-]+)([^>]*?)\/?>|([^<]+)/g
    )) {
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

async function betterLyrics(song) {
  const artist =
    (song.artists || [])
      .map((item) => item.name)
      .filter(Boolean)
      .join(", ") || song.artist || "";
  const query = new URLSearchParams({ s: song.title || song.name || "", a: artist });
  if (song.album) query.set("al", song.album);
  if (song.duration) query.set("d", String(Math.round(Number(song.duration))));
  const response = await fetch(`https://api.betterlyrics.org/getLyrics?${query}`, {
    headers: { "user-agent": "MyGo Music (https://github.com/egoist/mygo-music)" },
  });
  if (!response.ok) return [];
  return linesOfTTML((await response.json()).ttml || "");
}

export async function lyrics({ id }) {
  const raw = rawId(id);
  const data = await call("getSong", { id: raw });
  const song = data.song || {};
  try {
    const lines = await betterLyrics(song);
    if (lines.length) return { lines };
  } catch (error) {
    console.warn(`Better Lyrics: ${error.message}`);
  }
  let structured = null;
  try {
    const lyricsData = await call("getLyricsBySongId", { id: raw, enhanced: "true" });
    structured = lyricsData.lyricsList && lyricsData.lyricsList.structuredLyrics;
  } catch (error) {
    structured = null;
  }
  if (Array.isArray(structured) && structured.length) return fromStructured(structured);
  const legacy = await call("getLyrics", { artist: song.artist || "", title: song.title || "" });
  const value = legacy.lyrics && legacy.lyrics.value;
  if (!value) throw fail("unavailable", tr("No lyrics for this song."));
  return { lrc: value };
}
