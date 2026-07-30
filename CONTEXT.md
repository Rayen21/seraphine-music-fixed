# Seraphine Music — 领域上下文

> 单上下文布局。整个仓库使用统一的领域模型，限界上下文即为**音乐播放器**本身。

---

## 通用语言

### 核心聚合

| 术语             | 定义                                                                                                                                                                                                                                     | 关键属性                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Music**        | 一首可播放的音频，可以是本地文件或在线资源。`PlayingMusic` 继承自 `Music`（`MusicDetail` 同理）。后端 `music::scan::ListMusic` 与之对应。`id` 为通用标识符：本地文件 = MD5(path)；在线资源 = 各 API 端点返回的 ID。`hash` 仅在线音乐有。 | `id`, `hash`, `path`, `title`, `artist`, `album`, `duration`, `cover` |
| **Playlist**     | 有序的音乐集合。由 `PlaylistInfo`（元数据）和 `Music[]`（条目列表）组成。按使用上下文分为三种：**本地曲库** (`Local`)、**浏览结果** (`Show`)、**播放队列** (`Play`)。三者形式相同、可互相赋值。后端通过 Kugou API 管理远程歌单。         | `info: PlaylistInfo`, `list: Music[]`                                 |
| **Favorite**     | 用户收藏的音乐标记集合。不同于 Playlist——仅存储 `ID[]` 引用，不持有完整的 Music 数据。                                                                                                                                                   | `info: PlaylistInfo`, `list: ID[]`                                    |
| **Player**       | 音频播放引擎（Rust 端 `music::player::Player`），封装 `rodio` 音频输出，管理播放状态和音频设备。前端 `musicStore` 反映其状态。                                                                                                           | 状态: idle / loading / playing / paused                               |
| **Lyric**        | 时间同步的歌词文本。支持 KRC（逐词）和 LRC（逐行）两种格式。分为歌词页和桌面歌词两个展示窗口。                                                                                                                                           | `id`, `fmt: Krc                                                       | Lrc`, `lines: LyricLine[]` |
| **LyricBinding** | 用户手动建立的 Music → Lyric 匹配关系，包含偏移量修正。持久化在 `matchedMap` / `offsetMap` 中。优先于在线搜索。                                                                                                                          | `musicId → lyricId`, `offset`                                         |
| **User**         | 登录用户。绑定 Kugou 账号，持有 VIP 状态和个人歌单。前端 `userStore` 管理。                                                                                                                                                              | `userid`, `nickname`, `pic`, `isVip`                                  |
| **Device**       | 音频输出设备。系统音频硬件抽象，可枚举、切换，在设备变更时自动重载。                                                                                                                                                                     | `id`, `name`                                                          |
| **Scan**         | 本地音乐扫描操作。遍历文件系统目录（最大深度 8 层），通过 `lofty` 提取元数据并生成 `Music` 条目，支持中途取消。                                                                                                                          | 输入: 目录路径列表；输出: `Music[]`                                   |

### 值对象

| 术语              | 定义                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **PlayingMode**   | 播放模式：顺序播放 / 单曲播放 / 列表循环 / 单曲循环 / 随机播放                                                                |
| **AudioQuality**  | 音频编码质量，控制请求 URL 的码率档位：128kbps / 320kbps / FLAC / High / Super                                                |
| **AudioEffect**   | 音频 DSP 音效处理，控制播放器的后处理链：魔音系列 (piano/acappella/subwoofer/ancient/surnay/dj) + 蝰蛇系列 (atmos/clear/tape) |
| **PlayingOrigin** | 播放来源：`Local`（本地文件）或 `Online`（Kugou 在线流）                                                                      |
| **SortInfo**      | 列表排序配置：排序类型 (默认/标题/歌手/专辑/时长) + 排序顺序 (升序/降序)                                                      |
| **LyricLine**     | 歌词行：由 `offset`（偏移时间）、`duration`（行时长）、`words`（单词列表）和 `translations`（翻译）组成                       |
| **LyricWord**     | 歌词单词：逐词歌词的最小单位，包含偏移时间和时长                                                                              |
| **HttpMode**      | HTTP 请求模式配置，控制 API 请求的路由和代理行为                                                                              |
| **CloseStatus**   | 关闭按钮行为：`Hide`（隐藏到托盘）或 `Exit`（退出应用）                                                                       |
| **AutoStartMode** | 开机自启模式：`Foreground`（前台启动）或 `Background`（后台启动）                                                             |

### 领域事件

| 事件            | 含义                                                | 消费者                           |
| --------------- | --------------------------------------------------- | -------------------------------- |
| `reload_device` | 音频输出设备变更，触发播放器重载                    | `musicStore` → 重新加载当前音频  |
| 播放进度事件    | 通过 Channel 推送当前播放位置 (s)                   | `musicStore` → 更新进度条        |
| 下载进度事件    | 通过 Channel 推送在线音频下载进度 (0-1)             | `musicStore` → 更新缓冲指示      |
| 歌词双向通信    | 桌面歌词窗口与主窗口间的 IPC 事件（Bridge Pattern） | Bridge composable ↔ `musicStore` |
| 歌曲结束        | 播放位置达到歌曲时长                                | `musicStore` → 自动播放下一首    |

---

## 架构全景

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Seraphine Music                              │
│                                                                     │
│  ┌──────────── WebView (Vue 3) ──────────────────────────────────┐  │
│  │                                                               │  │
│  │  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌─────────────────┐   │  │
│  │  │ Views   │  │ Layout   │  │ Stores │  │ Components      │   │  │
│  │  │ Home    │  │  Aside   │  │ music  │  │  MusicTable     │   │  │
│  │  │ Search  │  │  Header  │  │ list   │  │  ProgressRange  │   │  │
│  │  │ Setting │  │  Playbar │  │ user   │  │  VirtualList    │   │  │
│  │  │ ...     │  │  LyricPg │  │ lyric  │  │  ContextMenu    │   │  │
│  │  └─────────┘  └──────────┘  │ setting│  └─────────────────┘   │  │
│  │                             │ dskLrc │                        │  │
│  │                             └────────┘                        │  │
│  │                        ▲ invoke / Tauri events                │  │
│  └────────────────────────┼──────────────────────────────────────┘  │
│                           │ IPC                                     │
│  ┌────────────────────────┼──── Rust Backend ────────────────────┐  │
│  │                        ▼                                      │  │
│  │  ┌──────────────────────────────────────────────────────┐     │  │
│  │  │                  Player Context                      │     │  │
│  │  │                                                      │     │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌───────┐   │     │  │
│  │  │  │ api/     │  │ music/   │  │ http/  │  │ sys/  │   │     │  │
│  │  │  │  login   │  │  player  │  │  client│  │  path │   │     │  │
│  │  │  │  search  │  │  scan    │  │  config│  │  set  │   │     │  │
│  │  │  │  playlist│  │  audio   │  │  server│  │       │   │     │  │
│  │  │  │  song    │  │  file    │  │  mode  │  │       │   │     │  │
│  │  │  │  lyric   │  │  stream  │  │        │  │       │   │     │  │
│  │  │  │  user    │  │  lyric   │  │        │  │       │   │     │  │
│  │  │  │  rank    │  └──────────┘  └────────┘  └───────┘   │     │  │
│  │  │  │  ...     │                                        │     │  │
│  │  │  └──────────┘                                        │     │  │
│  │  └──────────────────────────────────────────────────────┘     │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 领域边界与模块职责

### 1. 音乐播放 — `music/` (Rust) + `stores/music.ts` (前端)

核心领域逻辑所在。所有与音频播放相关的操作集中于此。

- **`player.rs`** — 播放器引擎，管理 Audio 实例、设备监听、下载/加载/播放/暂停/停止/跳转
- **`audio.rs`** — 底层音频解码输出（rodio 封装），支持文件加载和流式加载
- **`stream.rs`** — 流式文件读取，支持边下边播
- **`scan.rs`** — 本地音乐文件扫描，元数据提取（通过 `lofty` 解析标签），封面保存
- **`file.rs`** — 文件操作：获取详情、打开所在文件夹、清除缓存
- 前端 `musicStore` — 播放状态镜像、进度监听、自动下一首、播放模式控制

**规则**：播放器状态以 Rust 端为准，前端通过 Channel 监听进度（~16ms 间隔）。前端不可直接修改 Rust 端的播放状态，必须通过 invoke 命令。

### 2. 网络音乐服务 — `api/` (Rust) + 对应 invoke 调用

与 Kugou API 的所有交互。从 KuGouMusicApi 移植到 Rust，无需额外服务进程。

| 模块           | 职责                                         |
| -------------- | -------------------------------------------- |
| `login.rs`     | 多种登录方式：二维码、微信、手机号、设备注册 |
| `search.rs`    | 歌曲/专辑/歌手/歌词/歌单搜索                 |
| `song.rs`      | 歌曲 URL 获取（音质选择）                    |
| `playlist.rs`  | 歌单 CRUD：标签、用户歌单、详情、曲目管理    |
| `lyric.rs`     | 在线歌词搜索与获取                           |
| `album.rs`     | 专辑歌曲列表                                 |
| `artist.rs`    | 歌手列表与作品                               |
| `rank.rs`      | 排行榜列表与排行歌曲                         |
| `top.rs`       | 热门推荐：专辑、卡片、歌单                   |
| `user.rs`      | 用户详情                                     |
| `youth.rs`     | 概念版会员（青年会员）权益                   |
| `privilege.rs` | 歌曲权限查询                                 |
| `personal.rs`  | 每日推荐、私人 FM                            |
| `register.rs`  | 设备注册                                     |

**规则**：API 调用返回原始响应（`ApiResponse<T>`），在前端或中间层进行数据转换。

### 3. HTTP 基础设施 — `http/`

- **`client.rs`** — 基于 `reqwest` 的 HTTP 客户端，支持配置和签名
- **`server.rs`** — 请求构建，参数签名（Android/Web/Register 三种加密方式），请求选项
- **`config.rs`** — HTTP 配置管理（基础 URL、Cookie、Token）
- **`mode.rs`** — 请求模式切换（控制路由/代理策略）

### 4. 系统 — `system/`

- **`path.rs`** — 应用路径管理（临时目录、歌词缓存、封面缓存）
- **`setting.rs`** — 窗口设置（还原窗口位置/大小）

### 5. 前端状态管理 — `stores/`

| Store          | 管理状态                                          | 持久化字段                                                       |
| -------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| `music`        | 播放状态、进度、音量、模式、音质                  | music, origin, volume, mode, quality, playProgress               |
| `list`         | 四个列表（本地/展示/播放/喜欢）、排序、框选、搜索 | local, play, sortMap                                             |
| `lyric`        | 歌词页显示、歌词设置、匹配记录、偏移量            | pageMode, setting, matchedMap, offsetMap                         |
| `user`         | 用户信息、VIP 状态、用户歌单                      | userinfo                                                         |
| `setting`      | 窗口状态、字体、自启、关闭行为、快捷键、设备      | autoLiteVipState, fontFamily, ...                                |
| `desktopLyric` | 桌面歌词窗口样式设置                              | isLocked, fontSize, fontFamily, textColors, transMode, offsetMap |
| `contextMenu`  | 右键菜单状态                                      | —                                                                |
| `refresh`      | 页面刷新触发信号                                  | —                                                                |

### 6. 多窗口架构

应用包含三个 WebView 窗口：

1. **主窗口** (`main`) — 完整的音乐播放器界面，无边框
2. **桌面歌词窗口** (`/desktop-lyric` 路由) — 置顶悬浮小窗，显示歌词，提供基本播放控制
3. **迷你播放器窗口** (`/desktop-mini` 路由) — 置顶悬浮小窗，提供歌曲信息，基本播放控制和播放列表

各窗口通过 Tauri 事件系统通信（`DesktopLyricEmit` / `DesktopMiniEmit` 定义通信类型），共享同一个 Rust 后端。

**数据规范**：非主窗口只能使用各自的专用 store（如 `desktop-mini` 只用 `desktop-mini`），其余所有数据由主窗口通过事件传递。禁止在非主窗口中直接引用 `music`、`list`、`lyric-main`、`user`、`setting` 等主窗口 store。

**Bridge Pattern**：主窗口到子窗口的数据传递通过 Bridge Composable 封装（参见 ADR-0002）。现有实现：

- `useDesktopMiniBridge(miniWindow, mainWindow)` — 迷你播放器，位于 `composables/useDesktopMiniBridge.ts`
- `useDesktopLyricBridge(lyricWindow)` — 桌面歌词，位于 `composables/useDesktopLyricBridge.ts`

Bridge 接收子窗口 `WebviewWindow` 引用，在 `stop()` 内部完成 watcher/listener 清理并关闭窗口。子窗口视图只做纯渲染，不承担跨窗口通信逻辑。

---

## 关键业务流程

### 音乐播放流程

```
用户点击播放
  → musicStore.setMusic(music, origin)
    → 停掉当前播放 → 根据 origin 调用 load_file / load_url
      → Rust 端：加载音频到 Audio 引擎
    → 开始播放
  → musicStore.loadLyric(music)
    → 优先获取本地缓存歌词（music_lyric_get）
    → 未命中则搜索在线歌词（api_lyric_search → api_lyric_get）
    → 解析 KRC/LRC → 更新 lyricStore
  → 后台：monitorPlay 推送进度 → 到达末尾 → playAutoNext
```

### 在线音乐播放（流式）

```
music_player_load_url
  → HttpRequest::get 获取音频流
  → 检查本地缓存（文件存在且大小匹配 → 直接播放）
  → 否则：
    1. download_file: 异步下载到临时目录
    2. load_stream: 等待缓冲区 > 128KB 后开始播放（边下边播）
  → monitorDownload 推送下载进度
```

### 登录流程

```
用户选择登录方式
  → QR 码 / 微信 / 手机号 / Token
  → API 验证 → 返回 userid, nickname, pic
  → userStore.login(info)
    → 获取 VIP 状态（api_youth_union_vip）
    → 加载用户歌单
    → 持久化 userinfo
```

---

## 设计决策 (ADR 索引)

| ADR                                                  | 主题                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| [0001](docs/adr/0001-multi-window-data-isolation.md) | 非主窗口数据隔离——仅使用专用 store，其余由主窗口事件传递       |
| [0002](docs/adr/0002-multi-window-bridge-pattern.md) | 多窗口桥接模式 (Bridge Pattern) 标准化——Bridge Composable 封装 |

---

## 技术选型

| 层          | 技术                         | 版本 | 用途                  |
| ----------- | ---------------------------- | ---- | --------------------- |
| 桌面框架    | Tauri                        | 2.11 | 跨平台桌面壳 + IPC 桥 |
| 前端框架    | Vue 3 + Composition API      | 3.5  | UI 层                 |
| 状态管理    | Pinia + persist              | 3.0  | 状态 + 持久化         |
| 样式        | Tailwind CSS                 | 3.4  | 原子化样式            |
| 路由        | vue-router (hash)            | 5.1  | 页面导航              |
| 后端语言    | Rust                         | 2021 | 核心逻辑              |
| 音频解码    | rodio + cpal                 | 0.22 | 音频输出              |
| 元数据提取  | lofty                        | 0.24 | 音频标签解析          |
| HTTP 客户端 | reqwest (tauri-plugin-http)  | 2    | 网络请求              |
| 快捷键      | tauri-plugin-global-shortcut | 2    | 全局热键              |
| 构建工具    | Vite                         | 8.1  | 前端构建              |
| 包管理      | pnpm                         | 11.7 | 依赖管理              |

---

## 上下文映射

```
┌──────────────────────────────────────────────────────────────────────┐
│                      播放器上下文 (Player Context)                    │
│                                                                      │
│  Music ──────────── Playlist ──────────── Player ──────── Device     │
│    │                   │                   │                         │
│    ├── Online(Kugou)   ├── Local  本地曲库  ├── AudioQuality 音质     │
│    └── Local(文件系统)  ├── Show   浏览结果  ├── AudioEffect  音效     │
│                        └── Play   播放队列  └── PlayingMode  模式     │
│                                                                      │
│  User ──────────── Lyric ───────────── Favorite ──────── Scan        │
│    │                │                     │              │           │
│    ├── 登录态        ├── KRC 逐词          └── ID[] 引用  ├── 目录遍历 │
│    ├── VIP          ├── LRC 逐行                         └── 元数据   │
│    └── 歌单管理      ├── LyricBinding 匹配                            │
│                     ├── 歌词页                                       │
│                     └── 桌面歌词窗口                                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 使用说明

- 新增功能时，先判断属于哪个模块。若涉及核心播放逻辑，优先扩展到 `music/`；若涉及 API 调用，优先扩展到 `api/`。
- 前端 Store 职责：`musicStore` 只管理播放状态，`listStore` 只管理列表数据，不互相越权。
- 任何新的领域术语请添加到此文件的**通用语言**章节。
- 架构决策记录到 `docs/adr/`，格式 `<NNNN>-<kebab-case-title>.md`。
