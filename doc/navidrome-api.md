# Navidrome / Subsonic API 参考

本插件通过 Navidrome 的 Subsonic API 取数据。Navidrome 兼容
Subsonic API v1.16.1（有少量差异）并实现了部分 OpenSubsonic 扩展。

来源：

- Navidrome 官方兼容性列表：https://www.navidrome.org/docs/developers/subsonic-api/
- Subsonic API 文档：https://www.subsonic.org/pages/api.jsp
- Subsonic 1.16.1 响应结构：https://www.subsonic.org/pages/inc/api/schema/subsonic-rest-api-1.16.1.xsd
- OpenSubsonic `getLyricsBySongId`：https://opensubsonic.netlify.app/docs/endpoints/getlyricsbysongid/
- Navidrome 源码：https://github.com/navidrome/navidrome/tree/master/server/subsonic

整理于 2026-11-06。

## 请求

```
GET https://<server>/rest/<method>.view?<auth>&<params>&f=json
```

- 所有方法都在 `/rest/` 下，以 `.view` 结尾。
- `f=json` 返回 JSON；不写则返回 XML。
- Navidrome 也接受 HTTP POST，但本插件只用 GET；播放列表修改用 GET 的查询参数。

### 认证

每个请求都要带：

| 参数 | 说明                                             |
| ---- | ------------------------------------------------ |
| `u`  | 用户名                                           |
| `p`  | 明文密码，或 `enc:` + 十六进制密码；仅建议测试用 |
| `t`  | `md5(password + salt)`，十六进制                 |
| `s`  | 随机 salt                                        |
| `v`  | 协议版本，本插件用 `1.16.1`                      |
| `c`  | 客户端名，本插件用 `MyGo Music`                  |

`p` 与 `t`+`s` 二选一。本插件用 token：

```js
const salt = Math.random().toString(36).slice(2, 10);
const token = md5(password + salt);
```

封面、音频这类由 `<img>` 或播放器直接发起的 URL 不能带每次随机 salt，
所以本插件用固定 salt `mygo-music` 生成 `t`/`s` 放进 URL。

### 响应封装

```json
{
    "subsonic-response": {
        "status": "ok",
        "version": "1.16.1",
        "type": "navidrome",
        "serverVersion": "0.55.0",
        "openSubsonic": true,
        "albumList2": { "album": [] }
    }
}
```

失败时仍是 HTTP 200：

```json
{
    "subsonic-response": {
        "status": "failed",
        "version": "1.16.1",
        "error": { "code": 40, "message": "Wrong username or password" }
    }
}
```

### 错误码

| code | 含义                       |
| ---- | -------------------------- |
| 0    | 通用错误                   |
| 10   | 缺少必需参数               |
| 20   | 客户端协议版本太旧         |
| 30   | 服务端协议版本太旧         |
| 40   | 用户名或密码错误           |
| 41   | LDAP 用户不支持 token 认证 |
| 50   | 无权限                     |
| 60   | 试用期结束                 |
| 70   | 找不到数据                 |

## 本插件使用的端点

### System

| 方法   | 参数 | 返回/用途               |
| ------ | ---- | ----------------------- |
| `ping` | —    | 验证账号；用于 `signIn` |

### 浏览

| 方法         | 参数 | 关键返回字段                                                                                    |
| ------------ | ---- | ----------------------------------------------------------------------------------------------- |
| `getArtists` | —    | `artists.index[].artist[]`：`id`、`name`、`coverArt`、`artistImageUrl`、`albumCount`、`starred` |
| `getArtist`  | `id` | `artist`：同上，另加 `album[]`（AlbumID3）                                                      |
| `getAlbum`   | `id` | `album`：AlbumID3，另加 `song[]`（Child）                                                       |
| `getSong`    | `id` | `song`：Child                                                                                   |
| `getGenres`  | —    | `genres.genre[]`：`value`、`songCount`、`albumCount`                                            |

### 专辑/歌曲列表

| 方法              | 参数                                                    | 关键返回字段                                               |
| ----------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| `getAlbumList2`   | `type`、`size`、`offset`、`genre`、`fromYear`、`toYear` | `albumList2.album[]`（AlbumID3）                           |
| `getSongsByGenre` | `genre`、`count`、`offset`                              | `songsByGenre.song[]`（Child）                             |
| `getStarred2`     | —                                                       | `starred2.artist[]`、`starred2.album[]`、`starred2.song[]` |

`getAlbumList2` 的 `type`，Navidrome 实际支持：

`newest`、`recent`、`random`、`frequent`、`starred`、`highest`、
`alphabeticalByName`、`alphabeticalByArtist`、`byGenre`、`byYear`。

`size` 最大 500（超过会被截到 500），默认 10。

### 搜索

| 方法      | 参数                                                                                           | 关键返回字段                                    |
| --------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `search3` | `query`、`artistCount`、`artistOffset`、`albumCount`、`albumOffset`、`songCount`、`songOffset` | `searchResult3.artist[]`、`.album[]`、`.song[]` |

Navidrome 不支持 Lucene 语法，只做简单的自动补全式匹配。

### 播放列表

| 方法             | 参数                                                                                              | 返回/说明                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `getPlaylists`   | —                                                                                                 | `playlists.playlist[]`（Playlist）；`username` 参数被忽略 |
| `getPlaylist`    | `id`                                                                                              | `playlist` + `playlist.entry[]`（Child）                  |
| `createPlaylist` | `name`，可选 `playlistId`、`songId`（可重复）                                                     | 1.14.0 起返回创建/更新后的 `playlist`                     |
| `updatePlaylist` | `playlistId`、`name`、`comment`、`public`、`songIdToAdd`（可重复）、`songIndexToRemove`（可重复） | 空响应                                                    |
| `deletePlaylist` | `id`                                                                                              | 空响应                                                    |

Navidrome 的 `songIndexToRemove` 是 0 起的播放列表位置，多个值按原列表位置一次性删除。
`updatePlaylist` 可以在同一次请求里先删后加，所以重排整张列表可以一次完成：

```js
await call("updatePlaylist", {
    playlistId,
    songIndexToRemove: songs.map((_, i) => i),
    songIdToAdd: reorderedSongIds,
});
```

### 收藏/评分

| 方法              | 参数                                            | 说明                 |
| ----------------- | ----------------------------------------------- | -------------------- |
| `star` / `unstar` | `id`（歌曲）、`albumId`、`artistId`（都可重复） | 收藏歌曲/专辑/艺术家 |

本插件把“喜欢的歌曲”映射为 star 的歌曲，把“收藏的专辑”映射为 star 的专辑。

### 播放记录

| 方法       | 参数                                     | 说明                           |
| ---------- | ---------------------------------------- | ------------------------------ |
| `scrobble` | `id`、`time`（毫秒时间戳）、`submission` | `submission=true` 才计为已播放 |

Navidrome 只在 `scrobble` 时更新播放次数/最近播放，调用 `stream` 本身不算播放。

### 媒体

| 方法          | 参数                                                          | 说明                                    |
| ------------- | ------------------------------------------------------------- | --------------------------------------- |
| `stream`      | `id`、`maxBitRate`（kbps）、`format`、`estimateContentLength` | 返回音频二进制                          |
| `getCoverArt` | `id`、`size`                                                  | 返回图片；`id` 可以是歌曲、专辑或艺术家 |

`format` 可用具体格式，或 `raw` 表示不转码。`maxBitRate=0` 表示不限。
本插件：

插件只向 Navidrome 请求 `format=raw` 原文件，不再使用服务端转码。音频交给本机
ffmpeg 处理：

| MyGo quality                         | 处理                      |
| ------------------------------------ | ------------------------- |
| 原生格式（mp3/flac/ogg/wav/m4a/aac） | 直接播放 Navidrome 原文件 |
| 其他格式，`standard`                 | 本机 ffmpeg 转 128k mp3   |
| 其他格式，`high` / `lossless`        | 本机 ffmpeg 转 320k mp3   |

本机 ffmpeg 用 `-listen 1 http://127.0.0.1:<port>/` 直接向播放器提供 MP3 流，
所以不需要等整首歌转完，也不依赖 Navidrome 服务器的 ffmpeg 版本。

`plugin.json` 需要进程权限：

```json
"process": ["ffmpeg", "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/local/bin/ffmpeg"]
```

插件会依次尝试这些路径；非原生格式在没有 ffmpeg 时会提示安装。

播放器会把收到的响应体当作歌曲缓存。旧版本依赖服务器转码失败时，Navidrome 返回
的 XML 错误也会被缓存成 `.mp3`，再次播放会立即 EOF；清空应用音频缓存即可。

### 歌词

| 方法                | 参数              | 说明                                                            |
| ------------------- | ----------------- | --------------------------------------------------------------- |
| `getLyricsBySongId` | `id`、`enhanced`  | OpenSubsonic `songLyrics` 扩展；`lyricsList.structuredLyrics[]` |
| `getLyrics`         | `artist`、`title` | 旧接口；`lyrics.value` 为文本/LRC                               |

`structuredLyrics[]`：

```json
{
    "kind": "main",
    "lang": "eng",
    "synced": true,
    "offset": -100,
    "line": [{ "start": 0, "value": "It's bugging me" }],
    "cueLine": [
        {
            "index": 0,
            "start": 0,
            "end": 2000,
            "value": "It's bugging me",
            "cue": [{ "start": 0, "end": 800, "value": "It's " }]
        }
    ]
}
```

- `line[].start`、`cueLine[].start/end`、`cue[].start/end` 单位毫秒。
- `offset` 要加到所有时间上。
- `synced=false` 时 `start` 不可用。
- `enhanced=true` 才返回 `cueLine` 以及 `kind` 为 `translation` 等非 main 条目。
- 本插件优先用 `cueLine` 生成带逐字时间的 `lines`，否则用 `line` 生成 LRC；
  同语言对照的 `kind=translation` 会填到 `translation`。

### 电台

| 方法                       | 参数 | 关键返回字段                                                                             |
| -------------------------- | ---- | ---------------------------------------------------------------------------------------- |
| `getInternetRadioStations` | —    | `internetRadioStations.internetRadioStation[]`：`id`、`name`、`streamUrl`、`homePageUrl` |

新建/修改电台需要管理员权限，本插件只读。

## JSON 字段

### Child（歌曲）

| 字段                                       | 说明                                 |
| ------------------------------------------ | ------------------------------------ |
| `id`                                       | 字符串 ID                            |
| `title`                                    | 标题                                 |
| `album`、`albumId`                         | 专辑名、专辑 ID                      |
| `artist`、`artistId`                       | 艺术家名、艺术家 ID                  |
| `displayAlbumArtist`、`albumArtists[]`     | OpenSubsonic 专辑艺术家              |
| `artists[]`                                | OpenSubsonic 艺术家列表 `{id, name}` |
| `track`、`discNumber`、`year`、`genre`     | 标签                                 |
| `coverArt`                                 | 封面 ID                              |
| `size`、`suffix`、`contentType`、`bitRate` | 文件信息                             |
| `duration`                                 | 秒                                   |
| `starred`                                  | 收藏时间                             |
| `played`                                   | 最近播放时间（OpenSubsonic）         |

### AlbumID3

| 字段                                       | 说明                              |
| ------------------------------------------ | --------------------------------- |
| `id`、`name`                               | 标识与名称                        |
| `artist`、`artistId`                       | 专辑艺术家                        |
| `coverArt`                                 | 封面 ID                           |
| `songCount`、`duration`（秒）、`playCount` | 统计                              |
| `created`                                  | 入库时间                          |
| `starred`                                  | 收藏时间                          |
| `year`、`genre`                            | 标签                              |
| `releaseDate`                              | OpenSubsonic `{year, month, day}` |

### ArtistID3

`id`、`name`、`coverArt`、`artistImageUrl`、`albumCount`、`starred`。

### Playlist

`id`、`name`、`comment`、`owner`、`public`、`songCount`、`duration`、
`created`、`changed`、`coverArt`，带歌曲时另有 `entry[]`（Child）。

## Navidrome 与 Subsonic 的差异

- 只做音乐，不做视频。
- 支持多个音乐库（Music Folders）和按用户授权。
- 不支持按文件夹浏览；`getIndexes`、`getMusicDirectory` 返回模拟的
  `/Artist/Album/01 - Song.mp3` 目录树。
- ID 一定是字符串（通常是 MD5 或 UUID），客户端不要转成整数。
- `getPlaylists` 忽略 `username` 参数。
- `search2`/`search3` 不支持 Lucene 查询。
- `stream` 不会把歌曲标记为已播放，只有 `scrobble(submission=true)` 会。
- `getArtistInfo*` 需要外部集成；`getTopSongs`、`getSimilarSongs*` 需要 Last.fm。

## 本插件的映射

### ID

各类 ID 可能撞车，所以统一加前缀；进入 Subsonic 前去掉：

| MyGo     | 前缀  | 例                       |
| -------- | ----- | ------------------------ |
| Track    | `tr:` | `tr:8f2c…`               |
| Album    | `al:` | `al:0a1b…`               |
| Artist   | `ar:` | `ar:5d3e…`               |
| Playlist | `pl:` | `pl:c7d9…`               |
| Radio    | `rd:` | `rd:1`、`rd:__endless__` |

### 能力映射

| MyGo 导出                                                                         | Navidrome 端点                                                          |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `home`                                                                            | `getAlbumList2` newest/recent/frequent/starred；`getRandomSongs`        |
| `browse`                                                                          | `getArtists`、`getGenres`、`getAlbumList2`、`getSongsByGenre`           |
| `search`                                                                          | `search3`；播放列表在本地按名称过滤                                     |
| `recent`                                                                          | `getAlbumList2?type=recent` 后取前 3 张专辑的歌曲                       |
| `played`                                                                          | `scrobble`                                                              |
| `liked` / `isLiked` / `like`                                                      | `getStarred2`、`star`、`unstar`                                         |
| `album`                                                                           | `getAlbum`                                                              |
| `artist`                                                                          | `getArtist`，再取前 4 张专辑的歌曲                                      |
| `saveAlbum` / `savedAlbums`                                                       | `star`/`unstar`、`getAlbumList2?type=starred`                           |
| `playlists` / `playlist` / `createPlaylist` / `renamePlaylist` / `deletePlaylist` | 同名端点                                                                |
| `addToPlaylist` / `removeFromPlaylist` / `movePlaylistTrack`                      | `updatePlaylist`                                                        |
| `stations` / `stationNext` / `stream`（网络电台）                                 | `getInternetRadioStations`                                              |
| `stations` / `stationNext`（无尽电台）                                            | 内置 `rd:__endless__`；`getRandomSongs?size=500`                        |
| `lyrics`                                                                          | Better Lyrics API；回退 `getLyricsBySongId`、`getLyrics`                |
| `stream`                                                                          | `getSong` 判断后缀，再拼 `stream` URL                                   |
| 封面                                                                              | `getCoverArt?id=<coverArt 或实体 id>&size={size}`，由应用按显示尺寸替换 |

首页的“猜你喜欢”取常听和收藏专辑里出现最多的流派，再用
`getRandomSongs?genre=<流派>` 取 12 首歌；流派歌曲不足时用随机歌曲补足。

无尽电台每批用 `getRandomSongs?size=500` 取随机歌曲，过滤待播批次和最近
200 条播放记录后最多返回 50 首；没有剩余歌曲时清空播放记录再试一次。

歌词先向 `https://api.betterlyrics.org/getLyrics` 请求，参数为
`s`（歌曲名）、`a`（艺术家）、`al`（专辑）和 `d`（时长秒数）。返回的 TTML
按 `<p>` 转成行、按带时间的 `<span>` 转成逐字时间；没有结果或请求失败时，
再使用 Navidrome 的 `getLyricsBySongId` 和 `getLyrics`。

登录账号没有头像时，使用
`https://www.navidrome.org/favicons/apple-icon-114x114.png` 兜底；艺术家图片和
封面保持原样。

### 未实现

- 播客（`shows`、`show`、`subscribeShow`、`likeEpisode`）：Navidrome 的 Subsonic API 没有播客。
- 评论（`comments`、`postComment`、`likeComment`）：Navidrome 没有评论。
- `followArtist`：Navidrome 只有 star 艺术家，与“关注”语义不同。
- `savePlaylist`：Navidrome 的播放列表没有“保存别人的列表”概念。
- 艺术家页歌曲只取前 4 张专辑；Subsonic 没有“按艺术家取全部歌曲”的端点，
  `getTopSongs` 依赖 Last.fm。
- 电台曲目时长为 `0`（未知），由播放器持续读取直播流。
