# Mini Player：事件驱动的数据传递

## Problem Statement

迷你播放器（`mini-player` 窗口）需要展示当前播放信息、播放列表和歌词，并支持基本播放控制。当前迷你窗口通过独立的 Pinia + localStorage 持久化层来获取数据——两个窗口各自维护独立的 Pinia 实例，依赖持久化层的写入和读取来做数据同步。这种方式存在隐式竞态和同步延迟问题，且迷你窗口只是一个展示型 UI，却承载了完整的 store 依赖链。

用户期望迷你播放器能**实时、可靠地**反映主窗口的播放状态，且行为可预测。

## Solution

迷你播放器的所有数据由主窗口通过 Tauri 事件（`emitTo` / `listen`）**显式推送**，用户操作通过事件**回传主窗口**执行。迷你窗口成为一个纯展示 + 事件发送的视图组件，内部仅用 `ref()` 管理纯 UI 状态。

数据流：

```
主窗口 stores → bridge composable → emitTo('mini-player', 'mini-player:handler', { type, data })
                                        │
                                        ▼
                              迷你窗口 ref() → 渲染 UI
                                        │
                        用户操作 → emitTo('main', 'mini-player:handler', { type, data })
                                        │
                                        ▼
                              主窗口 bridge → 调用 store action → 自动推送新状态
```

事件统一通过 `WindowEvent.MiniPlayer`（即 `'mini-player:handler'`）信道传输，用 `MiniPlayerEmit` 枚举区分消息类型。

## User Stories

1. 作为用户，我希望在迷你播放器中看到当前歌曲的封面、标题和歌手，以便一目了然地知道正在播放什么
2. 作为用户，我希望迷你播放器实时显示当前歌词行，以便跟随歌曲进度
3. 作为用户，我希望通过迷你播放器控制播放/暂停，以便无需切换到主窗口即可控制播放
4. 作为用户，我希望通过迷你播放器切换上一首/下一首，以便快速浏览播放列表
5. 作为用户，我希望在迷你播放器中查看和滚动播放队列，以便选择特定歌曲播放
6. 作为用户，我希望双击迷你播放器播放列表中的歌曲即可播放，以便直接跳转到任意歌曲
7. 作为用户，我希望迷你播放器立即反映播放状态变化，以便 UI 不会显示过时信息
8. 作为用户，我希望关闭迷你播放器后返回主窗口，以便在需要时使用完整界面
9. 作为用户，我希望迷你播放器在歌曲缓冲时显示加载指示器，以便知道播放正在进行中
10. 作为用户，我希望迷你播放器正确显示本地和在线歌曲的封面，以便通过视觉识别歌曲
11. 作为用户，我希望迷你播放器即使在播放中途打开也能正确显示，以便初始状态同步可靠

## Implementation Decisions

### 1. 事件协议

通过 `WindowEvent.MiniPlayer`（`'mini-player:handler'`）单一信道传输，使用 `MiniPlayerEmit` 枚举区分消息类型。所有类型定义在 `src/types/global.d.ts` 和 `src/utils/params.ts` 中。

主窗口 → 迷你窗口（`MiniPlayerEmit`）：

| 类型 | 载荷类型 | 推送时机 |
|------|---------|---------|
| `Audio` | `MiniPlayerAudio` | `musicStore.isLoading / isPlaying / music / origin` 变化时立即推送 |
| `Lyric` | `string`（纯文本） | 播放进度/歌词变化时推送（throttled 100ms），主窗口预计算当前行文本 |
| `Playlist` | `ListMusic[]` | `listStore.play.list` 变化时立即推送 |

```typescript
interface MiniPlayerAudio {
  isLoading: boolean
  isPlaying: boolean
  music: PlayingMusic | null
  origin: PlayingOrigin
}
```

迷你窗口 → 主窗口（`MiniPlayerEmit`）：

| 类型 | 载荷 | 说明 |
|------|------|------|
| `Init` | — | 窗口创建后请求首帧数据 |
| `Play` | — | 播放 |
| `Pause` | — | 暂停 |
| `Prev` | — | 上一首 |
| `Next` | — | 下一首 |
| `Set` | `ListMusic` | 播放指定歌曲 |
| `Close` | — | 关闭窗口 |
| `Pos` | `PhysicalPosition` | 窗口位置变化 |

### 2. 主窗口端：composable `useMiniPlayerBridge`

`src/composables/useMiniPlayerBridge.ts`，签名：

```typescript
export function useMiniPlayerBridge(
  miniWindow: Ref<WebviewWindow | undefined>,
  mainWindow: Window
): { start: () => Promise<void>; stop: () => void }
```

职责：

- 通过 `WindowEvent.MiniPlayer` 信道监听迷你窗口的 action 事件，按 `MiniPlayerEmit` 类型分发到对应 store action
- 监听相关 store 字段变化，通过 `syncAudio` / `syncLyric` / `syncPlaylist` 推送对应类型的载荷
- 传入的 `miniWindow` ref 作为窗口存活判据
- `stop()` 清理所有 watcher/listener，关闭迷你窗口，然后聚焦主窗口
- `Audio` / `Playlist` 使用 `watch`（即时推送），`Lyric` 使用 `watchThrottled`（100ms throttle）
- 此 composable 在 `SystemActions.vue` 中窗口创建/销毁时对应初始化/销毁。

### 3. 迷你窗口端

迷你窗口入口文件创建裸 Vue app（`src/mini-player.ts`，不引入主窗口 store）。

`MiniPlayer.vue` 组件：

- 通过 `ref()` 持有主窗口推送的状态数据
- 在 `onMounted` 中发送 `Init` 事件请求首帧，注册 `listen(WindowEvent.MiniPlayer, ...)` 接收推送
- 用户交互通过 `emitTo(WindowName.Main, WindowEvent.MiniPlayer, { type, data })` 回传
- 仅 `playlistVisible`、hover 状态等纯 UI 状态使用本地 `ref()`

### 4. 窗口尺寸常量

迷你窗口尺寸（width=298, height=66）定义在 `src/utils/params.ts`（`miniPlayerSize`），主窗口创建窗口时使用。

### 5. 数据预计算

主窗口 bridge 负责歌词文本预计算，迷你窗口只做渲染：

- 歌词文本：bridge 中的 `syncLyric` 根据 `playProgress` + `offset` + `lyric.lines` 计算出当前应显示的歌词文本，通过 `MiniPlayerEmit.Lyric` 推送纯文本字符串

### 6. 迷你窗口 capabilities

`src-tauri/capabilities/mini-player.json` 需确保包含事件通信所需的权限（当前已有 `core:event:default`，无需额外修改）。

## Testing Decisions

### 测试重点

测试外部行为：给定事件输入，产生正确的渲染输出和事件回传。

### 测试层级

1. **事件序列化测试**：验证 `useMiniPlayerBridge` 在 store 变化时生成正确的 `MiniPlayerAudio` / `MiniPlayerPlaylist` 载荷和歌词文本
2. **组件渲染测试**：给 `MiniPlayer.vue` 注入模拟数据，验证 DOM 输出
3. **事件回传测试**：模拟用户点击，验证正确的 `emitTo` 事件和类型被发送

### 参考现有实践

- 项目使用 Vitest + Vue Test Utils 进行组件测试
- Tauri 事件 API 在测试中可 mock 为简单的 event bus

## Out of Scope

- 迷你播放器的视觉重设计或新增 UI 功能
- 迷你播放器的视觉重设计或新增 UI 功能
- 将事件通信更换为其他传输层
- 迷你播放器窗口的响应式缩放或拖拽

## Further Notes

- 迷你窗口可能在主窗口 store 水合完成之前被创建，bridge 的 `start()` 在 `tauri://created` 后立即调用，子窗口 `onMounted` 发送 `Init` 触发全量同步
- `stop()` 清理所有 watcher/listener 并关闭窗口，避免向不存在窗口发送事件
- `Audio` / `Playlist` 使用即时 `watch`，`Lyric` 使用 100ms throttle
- 事件类型常量统一定义在 `src/utils/params.ts`，`MiniPlayerEmit` 与 `DesktopLyricEmit` 保持独立
