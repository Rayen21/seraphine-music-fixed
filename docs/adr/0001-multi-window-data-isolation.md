# ADR-0001: 多窗口数据隔离与桥接模式

**状态**: 已采纳  
**日期**: 2026-07-22  
**决策者**: @buren_Lee

---

## 背景

应用有三个 WebView 窗口：主窗口、迷你播放器窗口（`mini-player`）、桌面歌词窗口（`desktop-lyric`）。在实现桌面歌词窗口和迷你播放器窗口时，需要一个统一的架构来规范所有子窗口的数据传递和隔离机制。

## 决策

### 一、数据隔离原则

非主窗口**只能使用各自的专用 store**，其余所有数据由主窗口通过 Tauri 事件系统显式传递。

具体规则：

- `mini-player` 只允许使用 `mini-player` store
- `desktop-lyric` 只允许使用 `desktop-lyric` store
- 播放状态、播放列表、歌词数据、用户信息等全部由主窗口通过事件推送
- 非主窗口的用户操作通过事件回传主窗口，由主窗口执行实际业务逻辑
- 禁止非主窗口直接引用 `music`、`list`、`lyric-main`、`user`、`setting` store

### 二、Bridge Pattern 标准化

采用 **Bridge Pattern** 作为所有子窗口数据传递的标准实现模式。每个子窗口对应一个 bridge composable，封装主窗口到子窗口的数据推送和子窗口到主窗口的 action 事件处理。

#### 接口约定

所有 bridge composable 遵循同一接口模式，传递子窗口的 `WebviewWindow` 引用，由 bridge 内部管理生命周期：

```typescript
// 迷你播放器（需额外引用主窗口用于关闭后聚焦）
function useMiniPlayerBridge(
  miniWindow: Ref<WebviewWindow | undefined>,
  mainWindow: Window
): { start: () => Promise<void>; stop: () => void }

// 桌面歌词
function useDesktopLyricBridge(lyricWindow: Ref<WebviewWindow | undefined>): {
  start: () => Promise<void>
  stop: () => void
}
```

核心设计：**bridge 持有窗口引用，`stop()` 内部完成清理和窗口销毁**，组件无需额外传入 `onClose` 回调。

#### 职责边界

| 层                    | 职责                                                                                                   | 不允许                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| **Bridge composable** | 监听主窗口 store → 推送数据；监听子窗口 action → 调用 store 方法；生命周期管理（start/stop）；关闭窗口 | 操作 DOM、管理 WebviewWindow 对象         |
| **组件 (Vue SFC)**    | 创建 WebviewWindow；渲染 UI；监听 `tauri://created` 调用 bridge.start；通过 `bridge.stop()` 销毁窗口   | 直接调用 `emitTo`/`listen` 进行跨窗口通信 |

#### 生命周期

组件按钮点击 → new WebviewWindow(...)
  └─ tauri://created → bridge.start()
      ├─ 注册 watchers：自动推送状态变化至子窗口
      ├─ 注册 listener：接收子窗口 Init / action 请求
      └─ 子窗口 onMounted → 发送 Init → bridge 全量推送首帧

子窗口 Close / 组件再次点击 → bridge.stop()
  └─ stop() 清理所有 watchers / listener 并关闭窗口

#### 消息类型分类

| 方向    | 迷你播放器 (`MiniPlayerEmit`)                                | 桌面歌词 (`DesktopLyricEmit`)                                 | 触发方式   | 说明             |
| ------- | ------------------------------------------------------------ | ------------------------------------------------------------- | ---------- | ---------------- |
| 主 → 子 | `Audio` / `Lyric` / `Playlist`                               | `Audio` / `Lyric` / `Progress` / `Fonts`                      | watch 自动 | 状态变化主动推送 |
| 子 → 主 | `Init`                                                       | `Init`                                                        | 窗口创建   | 请求首帧数据     |
| 子 → 主 | `Play` / `Pause` / `Prev` / `Next` / `Set` / `Close` / `Pos` | `Play` / `Pause` / `Prev` / `Next` / `Close` / `Pos` / `Main` | 用户操作   | action 回传      |

#### 初始化时序

1. 组件调用 `new WebviewWindow(...)` 创建子窗口
2. 监听 `tauri://created` 事件 → 调用 `bridge.start()`
3. 子窗口 `onMounted` 后发送 `Init` 事件请求首帧数据
4. Bridge 的 listener 收到 `Init` 后全量推送所有状态（`syncAudio` + `syncLyric` + `syncProgress` + `syncFonts`）
5. 子窗口先渲染空白/骨架状态（显示歌名兜底），主窗口就绪后通过 `Init` 事件全量推送首帧数据

#### 清理规则

- `stop()` 执行完整的清理链路：销毁 watcher → 销毁 listener → 关闭窗口
- `stopFns` 数组统一存储所有 unwatch 函数和 unlisten 函数
- `stop()` 遍历 `stopFns` 执行所有清理，然后清空数组，最后关闭窗口
- 窗口关闭由 bridge 内部 `stop()` 完成，组件不再需要独立的 `onClose` 逻辑

#### 数据推送的计算原则

**通用数据由主窗口推送，子窗口保留自身渲染计算**。主窗口推送原始进度和歌词数据，子窗口自行计算与渲染节奏耦合紧密的数据（如 `activedIndex`、`nextIndex`）。

#### 事件一致性

不要求原子性。不同事件（Audio/Lyric/Progress/Fonts）独立推送，允许短暂的不一致窗口（如切歌时新 Audio 先到、旧 Lyric 尚未刷新）。依赖 throttle（33~100ms）保证旧数据在可接受时间内被覆盖，不引入事务或批量推送机制。

#### 歌词偏移独立管理

桌面歌词窗口使用 `desktopLyricStore.offsetMap` 管理自己的偏移量，不共享 `lyric-main` 的 `offsetMap`。偏移调整直接在子窗口内完成并通过 store 持久化，bridge 只传递原始进度值。

#### 窗口锁定交互

锁定后 `setIgnoreCursorEvents(true)` 使窗口鼠标穿透，双击拖拽区域恢复交互。

## 现有实现

| Bridge                  | 文件                                   | 子窗口        | 参数                       |
| ----------------------- | -------------------------------------- | ------------- | -------------------------- |
| `useMiniPlayerBridge`   | `composables/useMiniPlayerBridge.ts`   | mini-player   | `(miniWindow, mainWindow)` |
| `useDesktopLyricBridge` | `composables/useDesktopLyricBridge.ts` | desktop-lyric | `(lyricWindow)`            |

两个 bridge 的参数差异（`useMiniPlayerBridge` 额外接收 `mainWindow`）是因为迷你播放器关闭时需要聚焦主窗口。后续可考虑统一签名，但当前差异由业务需求决定。

## 考虑的替代方案

| 方案                              | 优点                                   | 缺点                                                 | 为什么没选            |
| --------------------------------- | -------------------------------------- | ---------------------------------------------------- | --------------------- |
| 共享 Pinia store                  | 开发简单，直接 import 即用             | 多实例竞态、同步延迟、耦合重                         | 数据一致性不可靠      |
| 通过 Tauri 全局状态共享           | 单一数据源，无需事件协议               | Tauri state 在 WebView 间不共享，技术上不可行        | 技术不可行            |
| 组件内直接 `emitTo`/`listen`      | 简单直接                               | 职责混叠、不可测试、风格不一致                       | 违反单一职责          |
| 全局事件总线                      | 一次注册到处可用                       | 隐式依赖、难以追踪、无法隔离                         | 与 Tauri 事件系统重复 |
| 主窗口全权推送 + Bridge（本方案） | 单一数据源、事件驱动、封装性、可测试性 | 需设计事件协议、需为每个子窗口编写 bridge（~150 行） | —                     |

## 影响

- **新增**: 每个子窗口需要事件协议定义（`MiniPlayerEmit` 等）和一个 bridge composable（~150 行）；子窗口入口文件移除 Pinia 依赖或精简为仅专用 store
- **修改**: 子窗口组件改为事件驱动的**轻计算视图**——主窗口推送原始数据，子窗口保留渲染相关计算；bridge 承担所有跨窗口逻辑
- **约束**: 新增非主窗口功能时，必须先扩展事件协议，不能直接引用主 store；新增子窗口必须遵守同样的隔离规则，并在此 ADR 中注册对应的 bridge；不得绕过 bridge 直接在主窗口组件中使用 `emitTo`/`listen` 与子窗口通信
- **风险**: 事件协议变更需要主窗口和子窗口同步更新；初始化时序（子窗口创建早于主窗口 store 水合完成）需要显式处理；bridge 和子窗口的事件协议需保持同步

## 后续

- 桌面歌词窗口（`desktop-lyric`）的子窗口功能已实现，包括：播放控制、歌词偏移、字号/字体/颜色设置（弹窗修改）、窗口锁定（双击解锁）、双行/翻译布局。详见对应 spec。
- 每个子窗口的事件协议应记录在对应的 spec 或 ADR 中，作为接口契约
- **共享数据由主窗口推送**：子窗口需要的共享数据（如可用字体列表 `availableFonts`）由主窗口按需触发检测并推送，已集成到 settingStore，bridge 中 `syncFonts` 按需触发检测并推送至桌面歌词窗口
- **初始化时序**：子窗口可能早于主窗口 store 水合完成被创建。子窗口先渲染空白/骨架状态（显示歌名兜底），主窗口就绪后通过 `Init` 事件全量推送首帧数据
