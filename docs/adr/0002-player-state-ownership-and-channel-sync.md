# ADR-0002: 播放状态所有权与 Channel 同步机制

**状态**: 已采纳  
**日期**: 2026-08-01  
**决策者**: @buren_Lee

---

## 背景

音乐播放器的状态管理涉及播放/暂停、音量、进度、切歌等高频交互。在 Tauri 架构下存在两种可能的设计方向：

1. **前端持有状态** — 前端 `musicStore` 作为真相源，Rust 端仅被动接收命令执行音频输出
2. **后端持有状态** — Rust `Player` 作为唯一真相源，前端通过单向通道同步镜像状态

若选择前端持有，将面临以下痛点：多窗口时 store 数据不一致（ADR-0001 已证实）、刷新后 Rust 端与前端状态脱节、音频设备变更时前端无法感知、切歌竞态导致的进度事件窜台。

## 决策

**将播放状态的所有权放在 Rust 端 `Player`（`src-tauri/src/music/player.rs`），前端 `musicStore` 仅为只读镜像，所有状态变更必须经 `invoke` 命令到达 Rust 端，播放进度与下载进度通过 `Channel<T>` 单向推送至前端。**

核心机制：
- Rust `Player` 以 `Arc<RwLock<Audio>>` 持有音频实例，所有状态变更（play/pause/seek/volume/device）封装为 `pub` 方法
- 前端通过 `invoke('music_player_play', ...)` 等命令发起变更，**禁止直接修改** `musicStore` 中的 `isPlaying / playProgress` 等字段（除了作为 Channel 接收端赋值）
- 播放进度（~16ms）与下载进度（~100ms）通过 `Channel<number>` 高频推送
- 每次 `load_url` / `load_file` 自增 `loading_id`（`AtomicU64`），Channel 推送时携带 id，前端丢弃过期 id 的事件，解决切歌竞态

### 常量与间隔

| 常量 | 值 | 位置 | 说明 |
|------|-----|------|------|
| `PLAY_INTERVAL` | 16ms (~60fps) | player.rs L34 | 播放进度推送间隔，匹配 UI 刷新率 |
| `DOWNLOAD_INTERVAL` | 100ms | player.rs L36 | 在线音频下载进度推送间隔 |
| `DEVICE_INTERVAL` | 1000ms | player.rs L32 | 音频设备热插拔检测轮询间隔 |
| `FILE_TIMEOUT` | 5000ms | player.rs L30 | 本地文件句柄获取超时 |
| `MAX_RETRY_COUNT` | 3 | music.ts L36 | 单首歌播放失败自动重试次数 |

### 状态变更权限矩阵

| 状态字段 | Rust 端读 | Rust 端写 | 前端读 | 前端写（允许途径） |
|---------|-----------|-----------|--------|-------------------|
| `isPlaying` | ✅ `Audio` 内部 | ✅ `play()/pause()/stop()` | ✅ store 镜像 | ❌ 仅通过 `invoke` |
| `playProgress` | ✅ `audio.position()` | ❌ 只读派生 | ✅ Channel 推送 | ❌ 写必须走 `invoke seek()` |
| `volume` | ✅ `sink.volume()` | ✅ `set_volume()` | ✅ store 持久化 | ✅ `invoke set_volume` 后同步写 store |
| `mode` (播放模式) | ❌ 不感知 | — | ✅ store 持有 | ✅ 纯前端态（不跨 Rust） |
| `quality` (音质) | ❌ 不感知 | — | ✅ store 持有 | ✅ 纯前端态（请求 song_url 时使用） |

## 考虑的替代方案

| 方案 | 优点 | 缺点 | 为什么没选 |
|------|------|------|------------|
| 前端 store 持有状态，Rust 仅执行 | 前端开发简单，无需跨层 | 多窗口不一致、刷新后态丢失、切歌竞态无法根治 | 与 ADR-0001 隔离原则冲突，且 bug 率高 |
| 双向绑定（Tauri Event 互相推） | 灵活 | 循环更新风险、调试困难、无唯一真相源 | 违反单一写入原则，状态冲突难定位 |
| Pinia 跨窗口共享 store | 看似一劳永逸 | Tauri 多 WebView 间 Pinia 实例隔离，物理不可行 | 技术不可行（见 ADR-0001 替代方案分析） |
| 本方案：Rust 唯一真相源 + Channel 单向推送 | 多窗口天然一致、刷新可恢复、无竞态（loading_id）、可测 | 前端需显式 `invoke`、类型契约需维护 | — |

## 影响

- **新增**: `Invoke` 接口中 `music_player_*` 系列命令的类型声明必须与 `player.rs` 同步（`types/global.d.ts`）
- **修改**: 新增播放控制逻辑时，先在 Rust `Player` 提供方法 → 暴露 `#[tauri::command]` → 前端 `musicStore` 包装 `invoke`，禁止跳步
- **约束**: 
  - 前端任何组件不得绕过 `musicStore` 直接写 `isPlaying / playProgress`
  - 切歌时必须自增 `loading_id`，所有进度 Channel 回调需校验 id 匹配
  - `monitor_play` / `monitor_download` 必须使用 `tauri::async_runtime::spawn`（禁止裸 `tokio::spawn`，否则 setup 内无 reactor）
- **风险**: 
  - 16ms Channel 推送频率在低端设备上的 CPU 占用（实测 rodio 回调开销可忽略）
  - 前端 DEV 热重载时 Rust 端未重启，旧 monitor 不清理导致双通道推送 → DEV 水合时强制先 `pause()` 清理

## 后续

- 若后续扩展 DSP 音效（AudioEffect）链，所有权也归 Rust `Player`，前端仅推送预设名称
- 跨设备播放（DLNA / AirPlay）扩展时，沿用同一 `Channel<Progress>` 协议，`Player` 内部抽象 `OutputBackend` trait
