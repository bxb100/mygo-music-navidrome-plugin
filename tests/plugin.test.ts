import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { createHarness, loadBuiltPlugin } from "./harness";

const betterTTML = `<tt><body><div>
<p begin="0" end="1"><span begin="0" end="0.4">Hel</span><span begin="0.4" end="1">lo</span></p>
<p begin="2" end="3"><span begin="2" end="3">World</span></p>
</div></body></tt>`;

const artist = {
  id: "ar1",
  name: "Artist One",
  coverArt: "ar1",
  artistImageUrl: "http://127.0.0.1/rest/getCoverArt.view?id=ar1&size=600",
  albumCount: 1,
  starred: "2024-06-01T00:00:00Z",
};

const song = {
  id: "s1",
  title: "Song One",
  album: "Album One",
  albumId: "al1",
  artist: "Artist One",
  artistId: "ar1",
  artists: [{ id: "ar1", name: "Artist One" }],
  albumArtists: [{ id: "ar1", name: "Artist One" }],
  displayAlbumArtist: "Artist One",
  duration: 125,
  coverArt: "al1",
  suffix: "flac",
  size: 123456,
  track: 1,
  year: 2024,
  starred: "2024-06-01T00:00:00Z",
};

const songTwo = {
  ...song,
  id: "s2",
  title: "Song Two",
  track: 2,
  starred: undefined,
};

const radioSongs = Array.from({ length: 60 }, (_, index) => ({
  ...song,
  id: `r${index}`,
  title: `Radio ${index}`,
  track: index + 1,
  starred: undefined,
}));

const album = {
  id: "al1",
  name: "Album One",
  artist: "Artist One",
  artistId: "ar1",
  coverArt: "al1",
  songCount: 2,
  duration: 250,
  created: "2024-05-01T00:00:00Z",
  starred: "2024-06-01T00:00:00Z",
  year: 2024,
  genre: "Rock",
  releaseDate: { year: 2024, month: 5, day: 1 },
};

const playlist = {
  id: "pl1",
  name: "Mix",
  comment: "A mix",
  owner: "me",
  songCount: 2,
  duration: 250,
  created: "2024-05-01T00:00:00Z",
  changed: "2024-05-02T00:00:00Z",
  coverArt: "al1",
  entry: [song, songTwo],
};

const radio = {
  id: "1",
  name: "Radio One",
  streamUrl: "https://radio.example.com/live.mp3",
  homePageUrl: "https://radio.example.com",
};

test("full plugin flow", async () => {
  const betterRequests: URLSearchParams[] = [];
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "api.betterlyrics.org") {
      betterRequests.push(url.searchParams);
      if (url.searchParams.get("s") === "Song Two") return new Response("", { status: 404 });
      return new Response(JSON.stringify({ ttml: betterTTML }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return nativeFetch(input, init);
  };

  const requests: { method: string; params: URLSearchParams }[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url!, "http://127.0.0.1");
    const method = url.pathname.startsWith("/rest/") ? url.pathname.slice(6).replace(/\.view$/, "") : "";
    const params = url.searchParams;
    requests.push({ method, params });

    const send = (body: any) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ "subsonic-response": { status: "ok", version: "1.16.1", ...body } }));
    };

    switch (method) {
      case "ping":
        return send({});
      case "getAlbumList2":
        return send({ albumList2: { album: [album] } });
      case "getArtists":
        return send({ artists: { index: [{ name: "A", artist: [artist] }] } });
      case "getGenres":
        return send({ genres: { genre: [{ value: "Rock", songCount: 2, albumCount: 1 }] } });
      case "getSongsByGenre":
        return send({ songsByGenre: { song: [song, songTwo] } });
      case "getRandomSongs":
        if (params.get("size") === "500") return send({ randomSongs: { song: radioSongs } });
        return send({ randomSongs: { song: [song, songTwo] } });
      case "getAlbum":
        return send({ album: { ...album, song: [song, songTwo] } });
      case "getArtist":
        return send({ artist: { ...artist, album: [album] } });
      case "getSong":
        if (params.get("id") === "s2") return send({ song: { ...songTwo, suffix: "m4a", size: 999 } });
        if (params.get("id") === "s3") return send({ song: { ...song, id: "s3", suffix: "wma", size: 777 } });
        if (params.get("id") === "s4")
          return send({ song: { ...songTwo, id: "s4", suffix: "mp3", size: 555, bitRate: 96 } });
        return send({ song });
      case "search3":
        return send({
          searchResult3: {
            artist: Number(params.get("artistCount")) > 0 ? [artist] : [],
            album: Number(params.get("albumCount")) > 0 ? [album] : [],
            song: Number(params.get("songCount")) > 0 ? [song] : [],
          },
        });
      case "getStarred2":
        return send({ starred2: { artist: [artist], album: [album], song: [song] } });
      case "getPlaylists":
        return send({ playlists: { playlist: [playlist] } });
      case "getPlaylist":
        return send({ playlist });
      case "createPlaylist":
        return send({ playlist: { ...playlist, name: params.get("name") || "New" } });
      case "getLyricsBySongId":
        return send({
          lyricsList: {
            structuredLyrics: [
              {
                kind: "main",
                lang: "eng",
                synced: true,
                line: [
                  { start: 0, value: "Hello" },
                  { start: 2000, value: "World" },
                ],
                cueLine: [
                  {
                    index: 0,
                    start: 0,
                    end: 1000,
                    value: "Hello",
                    cue: [
                      { start: 0, end: 400, value: "Hel" },
                      { start: 400, end: 1000, value: "lo" },
                    ],
                  },
                  {
                    index: 1,
                    start: 2000,
                    end: 3000,
                    value: "World",
                    cue: [{ start: 2000, end: 3000, value: "World" }],
                  },
                ],
              },
              {
                kind: "translation",
                lang: "zho",
                synced: true,
                line: [
                  { start: 0, value: "你好" },
                  { start: 2000, value: "世界" },
                ],
              },
            ],
          },
        });
      case "getLyrics":
        return send({ lyrics: { value: "[00:01.00]Legacy" } });
      case "getInternetRadioStations":
        return send({ internetRadioStations: { internetRadioStation: [radio] } });
      default:
        return send({});
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(null)));
  const port = (server.address() as any).port;

  const harness = createHarness({
    settings: {
      serverUrl: `http://127.0.0.1:${port}`,
      username: "me",
      password: "secret",
    },
  });

  const plugin = await loadBuiltPlugin();
  const last = (method: string) => requests.filter((r) => r.method === method).at(-1)!;

  try {
    assert.equal((globalThis as any).host.t("Artists"), "Artists");

    const me = await plugin.signIn();
    assert.deepEqual(me, {
      id: "me",
      name: "me",
      imageUrl: "https://www.navidrome.org/favicons/apple-icon-114x114.png",
    });
    assert.deepEqual(plugin.account(), me);
    assert.equal(last("ping").params.get("u"), "me");
    assert.equal(last("ping").params.get("v"), "1.16.1");
    assert.equal(last("ping").params.get("c"), "MyGo Music");
    assert.equal(last("ping").params.get("f"), "json");
    assert.equal(
      last("ping").params.get("t"),
      createHash("md5")
        .update("secret" + last("ping").params.get("s"))
        .digest("hex"),
    );

    const home = await plugin.home();
    assert.equal(home.title, "Home");
    assert.deepEqual(
      home.sections.map((section: any) => section.title),
      ["For you", "Recently added", "Recently played", "Most played", "Starred albums"],
    );
    assert.equal(home.sections[0].tracks.length, 2);
    assert.equal(home.sections[0].tracks[0].id, "tr:s1");
    assert.equal(requests.filter((r) => r.method === "getRandomSongs")[0].params.get("genre"), "Rock");
    assert.equal(home.sections[1].albums[0].id, "al:al1");
    assert.equal(home.sections[1].albums[0].released, "2024-05-01");
    assert.equal(home.sections[1].albums[0].saved, true);
    assert.match(home.sections[1].albums[0].imageUrl, /\/rest\/getCoverArt\.view\?.*[?&]id=al1&size=%7Bsize%7D$/);
    assert.match(home.sections[1].albums[0].imageUrl, /s=mygo-music/);
    assert.equal(home.sections[1].morePage, "albums:newest:12");

    const tracks = await plugin.search({ query: "song", kind: "tracks", offset: 0 });
    assert.equal(tracks.tracks[0].id, "tr:s1");
    assert.equal(tracks.tracks[0].duration, 125000);
    assert.equal(tracks.tracks[0].album.id, "al:al1");
    assert.equal(tracks.tracks[0].artists[0].id, "ar:ar1");
    assert.equal(tracks.more, false);

    const searchAlbums = await plugin.search({ query: "album", kind: "albums" });
    assert.equal(searchAlbums.albums[0].id, "al:al1");

    const albumPage = await plugin.album({ id: "al:al1" });
    assert.equal(albumPage.album.name, "Album One");
    assert.equal(albumPage.tracks.length, 2);

    const artistPage = await plugin.artist({ id: "ar:ar1" });
    assert.equal(artistPage.artist.id, "ar:ar1");
    assert.match(artistPage.artist.imageUrl, /\/rest\/getCoverArt\.view\?.*[?&]id=ar1&size=%7Bsize%7D$/);
    assert.equal(artistPage.albums[0].id, "al:al1");
    assert.equal(artistPage.tracks.length, 2);

    const lists = await plugin.playlists();
    assert.equal(lists[0].id, "pl:pl1");
    assert.equal(lists[0].mine, true);
    assert.equal(lists[0].trackCount, 2);

    const one = await plugin.playlist({ id: "pl:pl1" });
    assert.equal(one.tracks.length, 2);
    assert.equal(one.tracks[0].id, "tr:s1");

    await plugin.addToPlaylist({ id: "pl:pl1", trackIds: ["tr:s2"] });
    assert.deepEqual(last("updatePlaylist").params.getAll("songIdToAdd"), ["s2"]);

    await plugin.removeFromPlaylist({ id: "pl:pl1", trackIds: ["tr:s2"] });
    assert.deepEqual(last("updatePlaylist").params.getAll("songIndexToRemove"), ["1"]);

    await plugin.movePlaylistTrack({ id: "pl:pl1", from: 0, to: 1 });
    assert.deepEqual(last("updatePlaylist").params.getAll("songIndexToRemove"), ["0", "1"]);
    assert.deepEqual(last("updatePlaylist").params.getAll("songIdToAdd"), ["s2", "s1"]);

    const standard = await plugin.stream({ id: "tr:s1", quality: "standard" });
    assert.equal(standard.type, "flac");
    assert.equal(standard.size, 123456);
    assert.match(standard.url, /format=raw/);

    const lossless = await plugin.stream({ id: "tr:s1", quality: "lossless" });
    assert.equal(lossless.type, "flac");
    assert.equal(lossless.size, 123456);
    assert.match(lossless.url, /format=raw/);
    assert.match(lossless.url, /\/rest\/stream\.view\?/);

    const highLossless = await plugin.stream({ id: "tr:s1", quality: "high" });
    assert.equal(highLossless.type, "flac");
    assert.equal(highLossless.size, 123456);
    assert.match(highLossless.url, /format=raw/);

    const losslessM4a = await plugin.stream({ id: "tr:s2", quality: "lossless" });
    assert.equal(losslessM4a.type, "m4a");
    assert.equal(losslessM4a.size, 999);
    assert.match(losslessM4a.url, /id=s2/);

    const transcodedStandard = await plugin.stream({ id: "tr:s3", quality: "standard" });
    assert.equal(transcodedStandard.type, "mp3");
    assert.equal(transcodedStandard.bitRate, 128000);
    assert.match(transcodedStandard.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const standardArgs = harness.spawns.filter((s: { args: string[] }) => s.args[0] === "-nostdin").at(-1)!.args;
    assert.equal(standardArgs[standardArgs.indexOf("-b:a") + 1], "128k");
    assert.equal(standardArgs[standardArgs.indexOf("-listen") + 1], "1");
    assert.match(standardArgs[standardArgs.indexOf("-i") + 1], /id=s3/);

    const transcoded = await plugin.stream({ id: "tr:s3", quality: "high" });
    assert.equal(transcoded.type, "mp3");
    assert.equal(transcoded.bitRate, 320000);
    const highArgs = harness.spawns.filter((s: { args: string[] }) => s.args[0] === "-nostdin").at(-1)!.args;
    assert.equal(highArgs[highArgs.indexOf("-b:a") + 1], "320k");
    assert.match(highArgs[highArgs.indexOf("-i") + 1], /id=s3/);

    const liked = await plugin.liked({ offset: 0 });
    assert.equal(liked.tracks.length, 1);
    assert.equal(liked.more, false);

    const likedMap = await plugin.isLiked({ ids: ["tr:s1", "tr:s2"] });
    assert.deepEqual(likedMap, { "tr:s1": true, "tr:s2": false });

    await plugin.like({ id: "tr:s1", on: true });
    assert.equal(last("star").params.get("id"), "s1");
    await plugin.like({ id: "tr:s1", on: false });
    assert.equal(last("unstar").params.get("id"), "s1");

    await plugin.saveAlbum({ id: "al:al1", on: true });
    assert.equal(last("star").params.get("albumId"), "al1");

    const saved = await plugin.savedAlbums({ offset: 0 });
    assert.equal(saved.albums[0].id, "al:al1");

    const recent = await plugin.recent();
    assert.equal(recent.length, 2);

    const lyrics = await plugin.lyrics({ id: "tr:s1" });
    assert.equal(lyrics.lines.length, 2);
    assert.equal(lyrics.lines[0].text, "Hello");
    assert.equal(lyrics.lines[0].words.length, 2);
    assert.equal(lyrics.lines[0].words[1].text, "lo");
    assert.equal(lyrics.lines[1].end, 3000);
    assert.equal(betterRequests[0].get("s"), "Song One");
    assert.equal(betterRequests[0].get("a"), "Artist One");
    assert.equal(betterRequests[0].get("al"), "Album One");
    assert.equal(betterRequests[0].get("d"), "125");

    const ownLyrics = await plugin.lyrics({ id: "tr:s2" });
    assert.equal(betterRequests[1].get("s"), "Song Two");
    assert.equal(ownLyrics.lines[0].translation, "你好");

    const stations = await plugin.stations();
    assert.equal(stations[0].id, "rd:__endless__");
    assert.equal(stations[0].name, "Endless Radio");
    assert.match(stations[0].description, /recently/);
    assert.equal(stations[1].id, "rd:1");
    assert.equal(stations[1].name, "Radio One");
    assert.match(stations[1].description, /radio\.example\.com/);

    await plugin.played({ id: "tr:r0" });
    assert.deepEqual(harness.storage.radioRecent, ["r0"]);
    assert.equal(last("scrobble").params.get("id"), "r0");

    const endless = await plugin.stationNext({ id: "rd:__endless__" });
    assert.equal(last("getRandomSongs").params.get("size"), "500");
    assert.equal(endless.length, 50);
    assert.equal(new Set(endless.map((t: any) => t.id)).size, 50);
    assert.equal(
      endless.some((t: any) => t.id === "tr:r0"),
      false,
    );
    assert.deepEqual(
      harness.storage.radioPending,
      endless.map((t: any) => t.id.slice(3)),
    );
    const firstPending = harness.storage.radioPending.slice();

    const endlessAgain = await plugin.stationNext({ id: "rd:__endless__" });
    assert.equal(endlessAgain.length, 9);
    assert.equal(
      endlessAgain.some((t: any) => firstPending.includes(t.id.slice(3))),
      false,
    );

    const moved = endlessAgain[0].id;
    await plugin.played({ id: moved });
    assert.equal(harness.storage.radioPending.includes(moved.slice(3)), false);
    assert.equal(harness.storage.radioRecent[0], moved.slice(3));

    const afterReset = await plugin.stationNext({ id: "rd:__endless__" });
    assert.equal(harness.storage.radioRecent, undefined);
    assert.equal(afterReset.length, 2);

    for (let index = 0; index < 205; index++) await plugin.played({ id: `tr:h${index}` });
    const radioRecent = harness.storage.radioRecent as string[];
    assert.equal(radioRecent.length, 200);
    assert.equal(radioRecent[0], "h204");
    assert.equal(radioRecent.at(-1), "h5");

    const next = await plugin.stationNext({ id: "rd:1" });
    assert.equal(next[0].id, "rd:1");
    assert.equal(next[0].duration, 0);

    const radioStream = await plugin.stream({ id: "rd:1", quality: "standard" });
    assert.equal(radioStream.url, radio.streamUrl);
    assert.equal(radioStream.type, "mp3");

    const genres = await plugin.browse({ page: "genres" });
    assert.equal(genres.sections[0].links[0].page, "genre:Rock");

    const genre = await plugin.browse({ page: "genre:Rock" });
    assert.equal(genre.title, "Rock");
    assert.equal(genre.sections[0].albums[0].id, "al:al1");
    assert.equal(genre.sections[1].tracks.length, 2);

    const artistsPage = await plugin.browse({ page: "artists" });
    assert.equal(artistsPage.sections[0].artists[0].id, "ar:ar1");

    const albumPageTwo = await plugin.browse({ page: "albums:newest:0" });
    assert.equal(albumPageTwo.sections[0].albums[0].id, "al:al1");
    assert.equal(albumPageTwo.sections[0].morePage, undefined);

    const suggestions = await plugin.suggest({ query: "song" });
    assert.deepEqual(suggestions, ["Song One", "Album One", "Artist One"]);

    await plugin.createPlaylist({ name: "New Mix" });
    assert.equal(last("createPlaylist").params.get("name"), "New Mix");

    await plugin.renamePlaylist({ id: "pl:pl1", name: "Renamed" });
    assert.equal(last("updatePlaylist").params.get("name"), "Renamed");

    await plugin.deletePlaylist({ id: "pl:pl1" });
    assert.equal(last("deletePlaylist").params.get("id"), "pl1");

    assert.deepEqual(plugin.account(), me);

    plugin.setSetting({ key: "username" });
    assert.equal(plugin.account(), null);
    assert.equal(harness.storage.radioPending, undefined);
    assert.equal(harness.storage.radioRecent, undefined);

    await plugin.signIn();
    await plugin.played({ id: "tr:s1" });
    await plugin.stationNext({ id: "rd:__endless__" });
    plugin.signOut();
    assert.equal(plugin.account(), null);
    assert.equal(harness.storage.radioPending, undefined);
    assert.equal(harness.storage.radioRecent, undefined);
  } finally {
    globalThis.fetch = nativeFetch;
    server.close();
  }
});
