# 编码规范

> 本文件定义项目的编码规范。所有提交的代码应遵守以下约定。

---

## 命名规范

### 状态字段

布尔类型的状态字段使用 `is`(不考虑时态) + 状态形容词。

```typescript
// ✅ 正确
const isPlaying = ref(false)
const isLoading = ref(false)
const isHydrated = ref(false)
const isLocked = ref(false)
const isHovering = ref(false)

// ❌ 避免
const playing = ref(false)
const loaded = ref(false)
```

### 可见性

控制元素显示/隐藏的字段使用 `关键词` + `Visible`。

```typescript
// ✅ 正确
const pageVisible = ref(false)
const playlistVisible = ref(false)

// ❌ 避免
const pageShow = ref(false)
const displayPlaylist = ref(false)
```

### 文件/目录命名

- Vue 组件文件：`PascalCase.vue`（如 `VirtualList.vue`、`MiniPlayer.vue`）
- Composable 文件：`use` + `PascalCase`（如 `useMiniPlayerBridge.ts`）
- Store 文件：`kebab-case`（如 `lyric-main.ts`、`lyric-desktop.ts`）
- 工具模块：`kebab-case`（如 `tools.ts`、`params.ts`）
- 测试文件：与源文件同名 + `.spec.ts`（如 `useDesktopLyricBridge.spec.ts`）

### 事件枚举

Tauri 跨窗口通信的事件枚举使用 `XxxEmit` 命名：

```typescript
// ✅ 正确
MiniPlayerEmit
DesktopLyricEmit

// payload 接口
MiniPlayerAudio
MiniPlayerLyric
MiniPlayerPlaylist
DesktopLyricPushPayload
```

---

## 前后端通信

### 前端 → Rust: invoke 封装

项目使用 `src/utils/tools.ts` 中的 `invoke` 封装调用 Tauri command，**禁止直接使用 `@tauri-apps/api/core` 的 `invoke`**。

```typescript
// ✅ 正确 — 使用项目封装的 invoke, 使用try-catch捕获错误
import { invoke } from '@/utils/tools'

try {
  const result = await invoke('check_update', { currentVersion: '0.1.2' })
} catch (error) {
  console.error(error)
}

// ❌ 避免 — 直接使用裸 invoke
import { invoke } from '@tauri-apps/api/core'

const result = await invoke('check_update', { currentVersion: '0.1.2' })
```

**行为说明：**

- 调用成功 → 返回类型化结果
- 调用失败 → 向上抛出异常

**类型定义：**

所有 Tauri command 的类型需在 `src/types/global.d.ts` 的 `Invoke` 接口中声明：

```typescript
interface Invoke {
  my_command_name: {
    args: { key: string } // 参数类型
    return: { result: string } // 返回值类型
  }
}
```

### Rust → 前端: Event 事件

进度或状态推送使用 Tauri Event 系统：

**Rust 端：**

```rust
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
    speed: f64,
}

// 在 command 中发送事件
let _ = app.emit("update:download-progress", DownloadProgress { ... });
```

**前端监听：**

```typescript
import { type UnlistenFn, listen } from '@tauri-apps/api/event'

let unlisten: UnlistenFn | null = null

unlisten = await listen<DownloadProgress>('update:download-progress', (event) => {
  progress.value = event.payload
})

// 组件卸载时取消监听
onUnmounted(() => unlisten?.())
```
