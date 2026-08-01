# ADR-0011: 前后端 IPC 通道分层规范

**状态**: 已采纳  
**日期**: 2026-08-01  
**决策者**: @buren_Lee

---

## 背景

Tauri 提供至少 4 种前后端/窗口间通信手段：`invoke` (command) 、`Channel<T>`、`Emitter`/`listen` (Tauri Event (Rust→WebView), 事件)、`emitTo`/`listen` (WebView ↔ WebView 事件)。开发者很容易混乱混用导致：

- 所有前端直接写裸 `@tauri-apps/api/core` 的 invoke，错误处理/类型缺失；
- 高频进度推送 vs 低频事件用同一个通道，订阅混乱；
- 子窗口直接跨窗 listen 别人 store 违反 (ADR-0001 规定禁止)；没有统一选型矩阵

## 决策

### 一、四种通道选型矩阵

必须**严格按表格选通道，不"我感觉"；新需求新代码 review 前先查表：

| 通道 ID | 名称 | 方向 | 频率 | 典型场景 | API |
|---------|------|------|------|---------|-----|
| ① | 封装版 Invoke | 前端 → Rust | 请求-响应，单次（低频到 ~100ms 以上 RPC 慢操作 | 登录 / 搜索 / 切歌命令 / 取列表 | `import { invoke } from '@/utils/tools.ts' 项目封装版，禁止 `@tauri-apps/api/core` 裸 invoke |
| ② | Channel<T> | Rust → 前端（单 WebView | 高频（10~100ms 连续推送 | 播放进度 16ms、下载进度 100ms | `tauri::ipc::Channel` + `invoke` 参数 `Channel<number>` |
| ③ | Tauri App Event | Rust → 所有 WebView 广播（多窗口广播） | 低频异步（>1s 偶发） | 应用更新下载进度、托盘事件 | Rust `app.emit("event-name", payload` + 前端 `listen<Payload>('event-name', cb)` |
| ④ | WebView Interop Event | 主窗口 ⇄ 子窗口 (mini-player / desktop-lyric | 中高频 | Bridge 跨窗口 推送 / 子回主 action | `emitTo('label')` / `listen('event', cb)` **必须包装进 Bridge |

### 二、禁止行为红线（硬规则）

1. **禁止裸 `invoke`**：
   ```typescript
   // ✅
   import { invoke } from '@/utils/tools'
   try { await invoke('music_player_play') } catch (e) { notify.error(e) }
   
   // ❌ 绝对禁止
   import { invoke } from '@tauri-apps/api/core'
   const r = await invoke('...')
   ```
   项目封装版 invoke 内部：统一 try/catch 抛出、统一日志埋点、统一返回值类型。

2. **禁止前端写 Invoke 命令类型必须同步 `types/global.d.ts` 里 `interface Invoke ` 全局声明：
   ```typescript
   interface Invoke {
     music_player_set_volume: {
       args:   { volume: number }
       return: void
     }
   }
   ```
   开发期 `utils/tools.ts` 的 invoke 封装泛型根据 keyof 查此表，参数错 TS 报红。

3. **进度推送选通道规则**：
   - 推送频率 > 每秒 1 次（播放进度 ~60fps）→ 必须 ② Channel
   - 每秒 <= 1 次 → ③ Event
   - 混用会：Rust 方每秒 emit 60 次全局 Event 成本（所有窗口都收到）性能浪费。

4. **跨 WebView 通信 (主⇄子 必须走 Bridge 层 (ADR-0001：**禁止**组件里直接 `emitTo` / `listen`**：
   - 只能 Bridge Composable**封装调用封装、watcher、listener 生命周期

### 三、Invoke 命令命名约定

| 前缀 | 归属模块 | 示例 |
|------|---------|------|
| `api_` | API 层 (对接 Kugou 开放) | `api_login_qr_create`, `api_search`, `api_song_url` |
| `music_player_` | 音乐播放 | `music_player_load_url`, `music_player_set_volume`, `music_player_seek` |
| `music_scan_` / `music_file_` / `music_lyric_` | 本地音乐扫描/文件/歌词 | `music_scan_dir`, `music_file_clear`, `music_lyric_get` |
| `http_mode_` / `system_` | HTTP 模式 / 系统 | `http_mode_set`, `system_path_all`, `system_setting_restore_window` |
| （无模块前缀？不允许） | — | ❌ `get_version → system_get_version 不 OK` 写成 `get_app_version`（已有命令需改但旧名字保留 OK，但新增的按前缀 |

### 四、Rust 端 `#[tauri::command]` 集中注册

`lib.rs` 的 `invoke_handler!` 数组是唯一注册入口；**命令函数散在各模块 mod 里，但宏一次性集中注册：

```rust
.invoke_handler(tauri::generate_handler![
  // system
  setting::get_app_version, setting::system_setting_restore_window, path::system_path_all,
  // music scan
  scan::music_scan_dir, scan::music_scan_cancel,
  // music player
  player::music_player_load_file, /* ... */
  // api
  login::api_login_qr_create, search::api_search, /* ... */
  // update
  update::check_update, update::download_update, install_update
])
```

好处：一目了然知道暴露了哪些接口 → 审计用；避免新增 command 忘注册导致 `command not found`。

### 五、错误策略

| 通道 | 错误处理 |
|------|---------|
| ① Invoke | Rust 端 `Result<T, String>` → 前端 try/catch 捕获 String 里是 Err 文案 → notify.error |
| ② Channel | 发送端不发错误 payload。失败通过另一条 Invoke 返回错误。 |
| ③ Event | payload 里带 `ok/err` 字段。 |
| ④ Bridge | err → 主 Bridge 内 try/catch → 主窗口 musicStore 处理 |

## 考虑的替代方案

| 方案 | 优点 | 缺点 | 为什么没选 |
|------|------|------|------------|
| 全用 Event：前端发命令也 emit('cmd') ，Rust 回 emit('cmd-resp') | 一种通道 | 没有请求-响应天然对应，响应 ID 手动配对，心智负担大；TypeScript 类型难写 | RPC 型场景 invoke 请求-响应语义更匹配 |
| 全用 Invoke + 轮询取进度（前端 setInterval invoke getProgress() | 简单 | 高频轮询 16ms 间隔性能 overhead 巨；IPC 密集；延迟高 | 不适合高频流 |
| GraphQL / tRPC 一层 | 类型安全优雅 | 引入新依赖；Tauri IPC 已够了；包体量大包 | 杀鸡用牛刀 |
| 本方案：4 通道选型矩阵 + 封装 invoke + 全局类型 + Bridge | 清晰；类型；TS 报红；review 查表选通道 | 规则多，新人要学 | 长期维护性收益大于学习成本 | — |

## 影响

- **新增**:
  - 新 Rust 命令：3 步 ① 函数写模块 `#[tauri::command]` → ② `Invoke interface 加 entry → ③ `lib.rs` generate_handler 数组 push
  - 新跨窗口数据：ADR-0001 扩展事件协议 + Bridge composable 扩展，不直接组件 emitTo
- **修改**: 现存裸 `@tauri-apps/api/core` 裸 invoke 全部替换（已全改完毕？现全查 grep 一遍查不到就 OK）
- **约束**:
  - ① invoke 封装版：禁止传 `未在 Invoke interface 里 key` → TS 类型错误
  - 播放/下载进度：禁止 ③ Event 推 → 必须 Channel
  - 多窗口事件：禁止绕过 Bridge Pattern → 必须走 Bridge
- **风险**:
  - 全局类型 interface Invoke 和 Rust 命令签名不一致 → 运行期 command not found / args mismatch。解决：写测试 / 代码评审 checklist。

## 后续

- 代码生成：宏扫 Rust command 参数 → 自动生成 TS Invoke interface
- Lint 规则：eslint rule 查裸 @tauri-apps/api/core import → auto-fix 替换 @/utils/tools
