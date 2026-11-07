# Navidrome for MyGo Music

A [MyGo Music](https://github.com/egoist/mygo-music) plugin that plays a
[Navidrome](https://www.navidrome.org) library through its Subsonic API.

It needs MyGo Music 0.1.20 or later, and speaks English or Simplified Chinese
as the app does. Your library's titles and names keep their original language.

## Install

Open MyGo Music → Settings → Plugins → `+` → from GitHub, and enter this
repository. Or open:

```
mygo-music://install-plugin?repo=OWNER/REPO
```

Then fill in the server URL, username and password in the plugin's settings.
The URL is the Navidrome web address, for example `https://music.example.com`.

## What it does

- Home with a For you mix and recently added, recently played, most played and
  starred albums
- Artists, genres, album and artist pages, search and suggestions
- Liked songs and starred albums
- Playlists, including creating, renaming, deleting, adding, removing and
  reordering tracks
- Playback through Navidrome's `stream` endpoint: plays the original file
  directly for formats MyGo decodes, and transcodes other formats on this Mac
  with ffmpeg
- Lyrics from Better Lyrics, with word timing, falling back to Navidrome's own
  synchronized lyrics
- Endless radio that shuffles your library, skipping songs you've heard recently
- Internet radio stations added in Navidrome

Not supported: podcasts, comments and following artists, which Navidrome's
Subsonic API doesn't expose.

Playback plays native audio formats directly; formats MyGo can't decode need
ffmpeg on this Mac:

```bash
brew install ffmpeg
```

The plugin asks for permission to start it, and only starts it from the PATH,
`/opt/homebrew/bin`, `/usr/local/bin` or `/opt/local/bin`. If it's somewhere
else, link it into one of those. Formats MyGo decodes directly without ffmpeg:
mp3, flac, ogg, wav, m4a and aac.

If playback stops immediately with EOF after an earlier failed attempt, clear
the app's audio cache in Settings. MyGo keeps whatever the server returned as
the song, including an XML error, so a stale failed response keeps ending in
EOF until it is removed.

## Settings

| Setting | Description |
| --- | --- |
| Server URL | Navidrome base URL, with `http://` or `https://` |
| Username | Navidrome account |
| Password | Used for Subsonic token auth, stored in the plugin's settings |

The plugin asks for network access to any host because the server is chosen at
runtime. Cover art and audio URLs use a fixed token salt so they can be loaded
by the app directly.

## Development

The plugin is `plugin.json` plus a single `index.js`; there is nothing to build.

```bash
node test/plugin.test.mjs
```

The test runs the plugin against a mock Subsonic server and checks the mapping.

## Publishing

`plugin.json` must be at the top of a public GitHub repository. The app takes
the latest release zip (for example `plugin-darwin-arm64.zip`), or the source.
Add the `mygo-music-plugin` topic to have it listed on the plugins page.

## References

- [MyGo Music plugin API](doc/mygo-plugin-api.md)
- [Navidrome / Subsonic API used here](doc/navidrome-api.md)
