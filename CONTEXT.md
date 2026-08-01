# Seraphine Music — 领域上下文

> 单上下文布局。整个仓库使用统一的领域模型，限界上下文即为**音乐播放器**本身。

---

## 通用语言

### 核心聚合

| 术语       | 定义                                                                                                                                                                                                                                     | 关键属性                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Player** | 音频播放引擎（Rust 端 `music::player::Player`），封装 `rodio` 音频输出，管理播放状态和音频设备。前端 `musicStore` 反映其状态。                                                                                                           |                                                                       |
| **Music**  | 一首可播放的音频，可以是本地文件或在线资源。`PlayingMusic` 继承自 `Music`（`MusicDetail` 同理）。后端 `music::scan::ListMusic` 与之对应。`id` 为通用标识符：本地文件 = MD5(path)；在线资源 = 各 API 端点返回的 ID。`hash` 仅在线音乐有。 | `id`, `hash`, `path`, `title`, `artist`, `album`, `duration`, `cover` |
| **Lyric**  | 时间同步的歌词文本。支持 KRC（逐词）和 LRC（逐行）两种格式。分为歌词页和桌面歌词两个展示窗口。                                                                                                                                           | `id`, `fmt`, `lines`                                                  |
| **User**   | 登录用户。绑定 Kugou 账号，持有 VIP 状态和个人歌单。前端 `userStore` 管理。                                                                                                                                                              | `userid`, `nickname`, `pic`, `isVip`                                  |
| **Device** | 音频输出设备。系统音频硬件抽象，可枚举、切换，在设备变更时自动重载。                                                                                                                                                                     | `id`, `name`                                                          |

### 值对象

| 术语              | 定义                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **PlayingMode**   | 播放模式：顺序播放 / 单曲播放 / 列表循环 / 单曲循环 / 随机播放                                                                |
| **PlayingOrigin** | 播放来源：`Local`（本地文件）或 `Online`（Kugou 在线流）                                                                      |
| **AudioQuality**  | 音频编码质量，控制请求 URL 的码率档位：128kbps / 320kbps / FLAC / High / Super                                                |
| **AudioEffect**   | 音频 DSP 音效处理，控制播放器的后处理链：魔音系列 (piano/acappella/subwoofer/ancient/surnay/dj) + 蝰蛇系列 (atmos/clear/tape) |

### 领域事件

| 事件               | 含义                                                  | 消费者                                           |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------ |
| 播放进度事件       | 通过 Channel 推送当前播放位置 (s)                     | `musicStore` → 更新进度条                        |
| 歌曲结束           | 播放位置达到歌曲时长                                  | `musicStore` → 自动播放下一首                    |
| 下载进度事件       | 通过 Channel 推送在线音频下载进度 (0-1)               | `musicStore` → 更新缓冲指示                      |
| 歌词双向通信       | 桌面歌词窗口与主窗口间的 IPC 事件（Bridge Pattern）   | `useDesktopLyricBridge` ↔ `musicStore`           |
| 迷你播放器双向通信 | 迷你播放器窗口与主窗口间的 IPC 事件（Bridge Pattern） | `useMiniPlayerBridge` ↔ `musicStore`/`listStore` |
| app 更新进度事件   | 应用更新下载进度推送（已下载字节数/总字节数/速度）    | `updaterStore` → 更新下载进度指示                |
| 设备变更事件       | 音频输出设备插拔/切换时触发                           | Rust `Player` → 前端 `musicStore` 刷新设备列表   |

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
│  │  │  │  playlist│  │  audio   │  │  server│  │ update│   │     │  │
│  │  │  │  song    │  │  file    │  │  mode  │  └───────┘   │     │  │
│  │  │  │  lyric   │  │  stream  │  │        │              │     │  │
│  │  │  │  user    │  │  lyric   │  │        │              │     │  │
│  │  │  │  rank    │  └──────────┘  └────────┘              │     │  │
│  │  │  │  music   │                                        │     │  │
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
| `music.rs`     | 每日推荐歌曲接口                             |

**规则**：API 调用返回原始响应（`ApiResponse<T>`），在前端或中间层进行数据转换。

### 3. HTTP 基础设施 — `http/`

- **`client.rs`** — 基于 `reqwest` 的 HTTP 客户端，支持配置和签名
- **`server.rs`** — 请求构建，参数签名（Android/Web/Register 三种加密方式），请求选项
- **`config.rs`** — HTTP 配置管理（基础 URL、Cookie、Token）
- **`mode.rs`** — 请求模式切换（控制路由/代理策略）

### 4. 系统 — `system/`

- **`path.rs`** — 应用路径管理（临时目录、歌词缓存、封面缓存）
- **`setting.rs`** — 窗口设置（还原窗口位置/大小）
- **`update.rs`** — 应用自动更新：GitHub Release 检查、下载进度事件推送、安装包启动

### 5. 前端状态管理 — `stores/` 与子窗口专用 stores

**主窗口通用 Stores**（`src/stores/`）：

| Store          | 管理状态                                          | 持久化字段                                         |
| -------------- | ------------------------------------------------- | -------------------------------------------------- |
| `music`        | 播放状态、进度、音量、模式、音质                  | music, origin, volume, mode, quality, playProgress |
| `list`         | 四个列表（本地/展示/播放/喜欢）、排序、框选、搜索 | local, play, sortMap                               |
| `lyric`        | 歌词页显示、歌词设置、匹配记录、偏移量            | pageMode, setting, matchedMap, offsetMap           |
| `user`         | 用户信息、VIP 状态、用户歌单                      | userinfo                                           |
| `setting`      | 窗口状态、字体、自启、关闭行为、快捷键、设备      | autoLiteVipState, fontFamily, ...                  |
| `context-menu` | 右键菜单状态                                      | —                                                  |
| `refresh`      | 页面刷新触发信号                                  | —                                                  |
| `updater`      | 应用更新状态：检查、下载、安装进度                | —                                                  |

**子窗口专用 Stores**（位于 `src/windows/[window-name]/stores/`，仅对应窗口可见）：

| Store           | 所在窗口      | 管理状态             | 持久化字段                                                       |
| --------------- | ------------- | -------------------- | ---------------------------------------------------------------- |
| `desktop-lyric` | desktop-lyric | 桌面歌词窗口样式设置 | isLocked, fontSize, fontFamily, textColors, transMode, offsetMap |

### 6. 多窗口架构与目录布局

应用包含三个 WebView 窗口，前端代码按「共享层 + 窗口专属层」分区组织：

```
src/
├── shared/                 ← 三窗口通用（组件/工具/样式/类型）【待补充】
├── windows/                ← 各窗口专属业务代码
│   ├── main/               ← 主窗口（当前仍在 src/ 根下，待后续迁移）
│   ├── mini-player/
│   │   ├── mini-player.ts      入口脚本
│   │   └── MiniPlayer.vue      视图组件（纯渲染，无跨窗口逻辑）
│   └── desktop-lyric/
│       ├── desktop-lyric.ts    入口脚本
│       ├── DesktopLyric.vue    视图组件
│       └── stores/
│           └── desktop-lyric.ts  桌面歌词专用 store
├── components/  composables/  layouts/  stores/  views/  ...  ← 主窗口 & 兼容层
└── ...
```

三个窗口：

1. **主窗口** (`main`) — 完整的音乐播放器界面，无边框
2. **桌面歌词窗口** (`desktop-lyric`) — 置顶悬浮小窗，显示歌词，提供基本播放控制。入口文件 `desktop-lyric.html`，入口脚本 `src/windows/desktop-lyric/desktop-lyric.ts`
3. **迷你播放器窗口** (`mini-player`) — 置顶悬浮小窗，提供歌曲信息，基本播放控制和播放列表。入口文件 `mini-player.html`，入口脚本 `src/windows/mini-player/mini-player.ts`

各窗口通过 Tauri 事件系统通信（`DesktopLyricEmit` / `MiniPlayerEmit` 定义通信类型），共享同一个 Rust 后端。

**数据规范**（ADR-0001）：非主窗口只能使用各自的专用 store（如 `desktop-lyric` 只用 `src/windows/desktop-lyric/stores/desktop-lyric.ts`），其余所有数据由主窗口通过事件传递。禁止在非主窗口中直接引用 `music`、`list`、`lyric`、`user`、`setting` 等主窗口 store。ESLint 规则强制此隔离。

**Bridge Pattern**：主窗口到子窗口的数据传递通过 Bridge Composable 封装（参见 ADR-0001）。现有实现：

- `useMiniPlayerBridge(miniWindow, mainWindow)` — 迷你播放器，位于 `src/composables/useMiniPlayerBridge.ts`
- `useDesktopLyricBridge(lyricWindow)` — 桌面歌词，位于 `src/composables/useDesktopLyricBridge.ts`

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

| ADR                                                                              | 主题                                                           | 状态   |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------ |
| [0001](docs/adr/0001-multi-window-data-isolation.md)                             | 多窗口数据隔离与桥接模式——数据隔离原则 + Bridge Pattern        | 已采纳 |
| [0002](docs/adr/0002-player-state-ownership-and-channel-sync.md)                 | 播放状态所有权与 Channel 同步机制——Rust 端 Player 为唯一真相源 | 已采纳 |
| [0003](docs/adr/0003-streaming-playback-and-cache-strategy.md)                   | 在线音乐流式播放与缓存策略——边下边播 + 本地缓存命中            | 已采纳 |
| [0004](docs/adr/0004-http-signing-encryption-and-multi-mode-architecture.md)     | HTTP 请求签名加密与多终端模式架构——Android/Web/Register 三模式 | 已采纳 |
| [0005](docs/adr/0005-lyric-system-dual-format-match-binding-offset-isolation.md) | 歌词系统——双格式解析 + 匹配绑定记忆 + 多窗口偏移独立           | 已采纳 |
| [0006](docs/adr/0006-frontend-persistence-and-hydration.md)                      | 前端状态持久化与水合恢复机制——Pinia persist + isHydrated 守卫  | 已采纳 |
| [0007](docs/adr/0007-local-music-scan-id-and-metadata-extraction.md)             | 本地音乐扫描 ID 方案与元数据提取——MD5(path) + lofty 标签解析   | 已采纳 |
| [0008](docs/adr/0008-cache-directory-and-path-fallback.md)                       | 应用缓存目录与路径降级策略——app_cache_dir + 临时目录兜底       | 已采纳 |
| [0009](docs/adr/0009-auto-update-github-releases.md)                             | 应用自动更新机制——基于 GitHub Releases + 流式下载进度推送      | 已采纳 |
| [0010](docs/adr/0010-global-shortcut-and-media-shortcut-dual-architecture.md)    | 全局快捷键与媒体快捷键双轨架构——tauri-plugin-global-shortcut   | 已采纳 |
| [0011](docs/adr/0011-ipc-channel-layering-specification.md)                      | 前后端 IPC 通道分层规范——invoke 封装 + Event 推送 + Channel    | 已采纳 |

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
│                                                                      │                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 使用说明

- 新增功能时，先判断属于哪个模块。若涉及核心播放逻辑，优先扩展到 `music/`；若涉及 API 调用，优先扩展到 `api/`。
- 前端 Store 职责：`musicStore` 只管理播放状态，`listStore` 只管理列表数据，不互相越权。
- 任何新的领域术语请添加到此文件的**通用语言**章节。
- 架构决策记录到 `docs/adr/`，格式 `<NNNN>-<kebab-case-title>.md`。
- 自动更新相关扩展：版本检查逻辑在 `system/update.rs`，前端状态管理在 `updaterStore`。
