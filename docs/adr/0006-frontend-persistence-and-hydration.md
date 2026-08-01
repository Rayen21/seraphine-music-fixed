# ADR-0006: 前端状态持久化与水合恢复机制

**状态**: 已采纳  
**日期**: 2026-08-01  
**决策者**: @buren_Lee

---

## 背景

桌面应用的核心体验之一是「重启后回到上次离开时的状态」：上次在听哪首歌、音量多少、播放列表、用户是否已登录、字体偏好是什么。但以下问题必须被明确：

1. **哪些字段该持久化？** 瞬时态（`isLoading`, `isDragging`）重启后应重置；持久态（音量、音质、用户信息、音乐信息）应恢复。没有标准的话所有开发者都会倾向「全部持久化」，导致状态膨胀 + 脏数据。
2. **恢复的顺序？** 如果先恢复歌曲再恢复音量，Rust 端 `Audio` 实例未就绪会抛错；如果先恢复快捷键注册但 store 未水合，注册回调会访问未初始化的 state。
3. **DEV 热重载 vs Rust 端未重启的冲突**：前端 `vite` HMR 会重建 Pinia store，但 Rust `Player` 是单例常驻的，两个 monitor 通道会重叠推流。必须对 DEV 做特殊处理。

## 决策

### 一、持久化技术栈

- 前端持久化统一使用 `pinia-plugin-persistedstate`，不直接写 `localStorage`
- 所有参与持久化的 store **必须显式列出 persist 字段**，禁止「全 store 持久化（省略 pick）」
- 后端动态配置持久化使用 `tauri-plugin-store`（`config.json`），这是 Rust 端的通道，由 `HttpConfig` / `HttpMode` 管理，**不与前端 Pinia 混用**

### 二、各 Store 持久化清单

在所有 store 中执行以下约定：

| Store ID | 持久化字段 (pick) | 水合后动作 |
|----------|------------------|-----------|
| `music` | `music, origin, volume, mode, quality, playProgress` | DEV 环境先 `pause()` 清理；再 `monitorDevice → monitorPlay → monitorDownload`；恢复音量；恢复歌曲（reload）；恢复进度 seek |
| `list` | `local (本地列表), play (播放列表), sortMap` | 无额外动作（纯数据） |
| `lyric-main` | `pageMode, setting (字体/字号/颜色/对齐/翻译模式), matchedMap, offsetMap` | 无（UI 状态纯被动渲染） |
| `lyric-desktop` (desktop-lyric store) | `isLocked, fontSize, fontFamily, textColors, transMode, offsetMap` | 无（子窗口独立，由 ADR-0001 Bridge 推送首帧） |
| `user` | `userinfo` (只有这个！isVip 不持久化，水合后重新查接口；userPlaylist 不持久化) | 若 `userinfo` 存在则异步 `getVipState()` |
| `setting` | `autoLiteVipState, fontFamily, autoStartState, autoStartMode, closeStatus, globalShortcutState, mediaShortcutState, shortcutMap, device, miniPlayerPosition, desktopLyricPosition` | `unregisterAll` 清理上一次残留 → `registerAllGlobalShortcut() → registerMediaShortcut()`；getAvailableFonts |
| `context-menu` | (不持久化) | — |
| `refresh` | (不持久化，信号型) | — |
| `updater` | (不持久化) | — |

**反模式**：
- 持久化 `isPlaying` / `isLoading`：这些是瞬时态，恢复后应走 `isLoaded=false → invoke load → play()` 的标准流程，不能直接 assume 正在播
- 持久化 `isVip`：VIP 状态可能在服务端已变更，重启后必须 revalidate，直接 trust 本地过期值将导致 VIP 资源无法访问

### 三、水合 (Hydration) 时序设计

```
App 启动
 ├─ Vue App.mount()
 ├─ createPinia().use(piniaPluginPersistedstate).mount()
 │    └─ 每个 store 同步从 localStorage 读回 pick 的字段，内存态填充
 │         └─ 触发每个 store 的 afterHydrate 回调：
 │              store.isHydrated = true
 ├─ watch 监听 isHydrated 变化（每个 store 独立，互不阻塞）
 │    ├─ music store
 │    │   ├─ [DEV ONLY] invoke pause() 清除 Rust 端遗留播放态和通道
 │    │   ├─ monitor_play / monitor_download 注入新 Channel
 │    │   ├─ setVolume(volume.value) 让 Rust Audio 和前端对齐
 │    │   ├─ load(music.value, origin.value) → 这一步会走 ADR-0003 的缓存命中逻辑
 │    │   └─ seek(playProgress.value)
 │    ├─ setting store
 │    │   ├─ unregisterAll() 防重复
 │    │   └─ registerAllGlobalShortcut + registerMediaShortcut
 │    ├─ user store (仅 userinfo 已存在)
 │    │   └─ getVipState() 异步刷新 VIP 状态
 │    └─ 其他 store 无额外动作
 └─ UI 第一帧渲染
```

关键原则：**每个 store 独立 watch isHydrated，不做跨 store 的手动同步触发**。Pinia afterHydrate 内部保证「先赋值 isHydrated → 再触发 watcher」的天然顺序。

### 四、DEV 环境特化处理

因 `vite` HMR 会多次重新创建前端 JS 上下文，但 Rust `Player` 在 `setup()` 中创建后常驻，导致：
- 旧的 `monitor_play` / `monitor_download` Channel 未注销，开始重复推流（一份推给旧前端页面上下文，一份推给新的）
- 新的 `load()` 又会再打开音频设备，同一首歌两个 sink，产生"重音"

修复策略（已在 music store 实现）：
```typescript
watch(isHydrated, async () => {
  if (import.meta.env.DEV) await pause() // 强制清 Rust 端 Audio sink + 旧通道
  // ... 再做正常恢复
}, { once: true })
```
生产构建无此问题，`import.meta.env.DEV` 被摇掉。

## 考虑的替代方案

| 方案 | 优点 | 缺点 | 为什么没选 |
|------|------|------|------------|
| 持久化 isPlaying，重启后自动继续播放 | 无缝衔接 | 输出设备可能变更（蓝牙耳机断开）导致播放失败；用户可能期望重启后保持暂停态 | 多数竞品（网易云/QQ）重启默认不自动播放 |
| 全部字段持久化，省得一个 pick | 代码少 | localstorage 体积膨胀，瞬时态脏数据污染导致莫名 bug | 不可控风险高 |
| 跨 store 手动写 HydrationController 统一调度恢复顺序 | 时序严格可控 | 耦合严重，新增 store 要改控制器 | Pinia 提供的 afterHydrate + 独立 watcher 已足够解耦 |
| 持久化 isVip，省一次接口请求 | 启动少一次 API | VIP 过期/续费后本地仍显示过期值，用户投诉率高 | 正确性优先于 100ms 延迟 |
| 本方案：显式 pick + 各 store 独立水合 watcher + DEV pause 清理 | 字段可控、恢复顺序天然稳定、DEV PRD 双环境兼容 | 每个 store 要手写 persist.pick，忘写会出现字段重启丢失（被认为是 bug，反而利于补全） | — |

## 影响

- **新增**: 新增 store 时，必须 3 选 1：要么不持久化（纯内存），要么写 `persist: { pick: [...] }`，要么明确在 CR 中说明「此 store 不需持久化因为...」。禁止省略 persist 字段。
- **修改**: 任何现有 store 新增字段，需判断「是否属于持久态」并决定是否加到 pick。常见判断框架：
  - ✅ 持久化：用户主动设置过的偏好 / 跨重启不希望丢失的数据
  - ❌ 不持久化：计算字段、加载中标记、临时选择、当前拖拽状态、每次登录 fresh fetch 即可的派生数据（isVip）
- **约束**:
  - `afterHydrate` 回调中不能 `await` 跨 store 的动作，会产生死锁/未初始化。若有依赖，改用 `watch(store.isHydrated, ...)`
  - DEV 环境的特殊处理只允许出现在 `if (import.meta.env.DEV)` 块中，禁止影响 PROD 代码路径
  - 任何水合动作中使用的 invoke command，需保证 Rust 端可"重复调用而无副作用"（幂等），例如 `unregisterAll` → 再 `register`
- **风险**: 
  - 恢复 `playProgress` 时，若歌曲缓存已被外部删除导致 `load()` 失败 → `seek()` 也失败。当前 `try/catch` 吞掉错误，用户看到的是"切到同首歌但进度在 0"，可接受
  - localStorage 被浏览器/用户手动清空时，所有持久态丢失 → 无补救（这是用户行为），但 Rust 端 `config.json`（Cookie/HttpMode）依然保留

## 后续

- 若引入「启动时是否恢复上次播放」设置项，默认值应 = **否**
- `userPlaylist` 持久化：列表项可能已被用户在别的端删除，需要 revalidate + 增量 diff，暂不持久化以避免复杂化
- 设置页加 "清除所有数据并重置" 按钮，一键清 localStorage + Rust `config.json`（诊断用）
