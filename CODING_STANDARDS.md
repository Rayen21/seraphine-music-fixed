# 编码规范

> 本文件定义项目的编码规范。所有提交的代码应遵守以下约定。

---

## 命名规范

### 状态字段

布尔类型的状态字段使用 `is` + 状态形容词。

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
const showFontModal = ref(false)
const showColorModal = ref(false)

// ❌ 避免
const pageShow = ref(false)
const displayPlaylist = ref(false)
```

### 事件处理

用户事件处理函数使用 `handle` + 关键词。

```vue
// ✅ 正确
const handlePlay = () => { ... }
const handleClick = (type: LyricEmitType) => { ... }
const handlePush = (payload: LyricPushPayload) => { ... }
const handlePlayOrPause = () => { ... }

// ❌ 避免
const onPlay = () => { ... }
const clickHandler = () => { ... }
```

Vue 模板中的事件绑定：

```vue
// ✅ 正确
<button @click="handlePlay">
<div @mouseleave="handleMouseLeave">

// ❌ 避免 — 内联逻辑
<button @click="isPlaying ? pause() : play()">
```

例外：直接透传的 DOM 事件（如 `@click.stop`、`@dblclick.stop`）不需要 `handle` 前缀。

### 文件/目录命名

- Vue 组件文件：`PascalCase.vue`（如 `VirtualList.vue`、`DesktopMini.vue`）
- Composable 文件：`use` + `PascalCase`（如 `useMiniPlayerBridge.ts`）
- Store 文件：`kebab-case`（如 `lyric-main.ts`、`lyric-desktop.ts`）
- 工具模块：`kebab-case`（如 `tools.ts`、`params.ts`）
- 测试文件：与源文件同名 + `.spec.ts`（如 `useDesktopLyricBridge.spec.ts`）

### 事件枚举

Tauri 跨窗口通信的事件枚举使用 `XxxEmit` 命名：

```typescript
// ✅ 正确
DesktopMiniEmit
DesktopLyricEmit

// payload 接口
DesktopMiniAudio
DesktopMiniLyric
DesktopMiniPlaylist
DesktopLyricPushPayload
```

---

## 前后端通信

### 前端 → Rust: invoke 封装

项目使用 `src/utils/tools.ts` 中的 `invoke` 封装调用 Tauri command，**禁止直接使用 `@tauri-apps/api/core` 的 `invoke`**（除非静默场景需要绕过错误通知）。

```typescript
import { invoke } from '@/utils/tools'

// ✅ 正确 — 使用项目封装的 invoke
const result = await invoke('check_update', { currentVersion: '0.1.2' })

// ❌ 避免 — 直接使用裸 tauriInvoke（除非静默场景）
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
const result = await tauriInvoke('check_update', { currentVersion: '0.1.2' })
```

**行为说明：**
- 调用成功 → 返回类型化结果
- 调用失败 → 自动显示 `notify.error(msg)`，返回 `undefined`
- 不向上抛出异常，调用方通过 `undefined` 判断失败

**类型定义：**

所有 Tauri command 的类型需在 `src/types/global.d.ts` 的 `Invoke` 接口中声明：

```typescript
interface Invoke {
  my_command_name: {
    params: { key: string }        // 参数类型
    return: { result: string }     // 返回值类型
  }
}
```

**静默调用场景：**

当不希望自动弹出错误通知时（如启动时静默检查），直接使用 `tauriInvoke`：

```typescript
import { invoke as tauriInvoke } from '@tauri-apps/api/core'

try {
  const info = await tauriInvoke<UpdateInfo>('check_update', { ... })
} catch (e) {
  console.error('静默失败:', e)
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
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

let unlisten: UnlistenFn | null = null

unlisten = await listen<DownloadProgress>('update:download-progress', (event) => {
  progress.value = event.payload
})

// 组件卸载时取消监听
onUnmounted(() => unlisten?.())
```

### Rust HTTP 客户端

Rust 端 HTTP 请求使用 `src-tauri/src/http/client.rs` 封装的 `HttpRequest`，直接使用 `tauri_plugin_http::reqwest`。

**简单 GET 请求：**

```rust
use crate::http::client::HttpRequest;

// 直接获取 JSON 响应
let data: MyType = HttpRequest::get_json::<MyType>(url.to_string())
    .await
    .map_err(|e| e.to_string())?;
```

**带 Header 的请求：**

```rust
use crate::http::client::{HttpRequest, HttpRequestOptions};
use tauri_plugin_http::reqwest::Method;

let opts = HttpRequestOptions::new()
    .url("https://api.example.com/data")
    .method(Method::GET)
    .add_header("User-Agent", "my-app")
    .add_header("Accept", "application/json");

let resp = HttpRequest::request(opts)
    .await
    .map_err(|e| format!("请求失败: {}", e))?;

let data: MyType = resp.json().await.map_err(|e| e.to_string())?;
```

**流式下载（需进度上报）：**

```rust
use crate::http::client::HttpRequest;
use tokio_stream::StreamExt;

let client = HttpRequest::get_client();
let resp = client.get(&url)
    .header("User-Agent", "my-app")
    .send()
    .await?;

let mut stream = resp.bytes_stream();
while let Some(chunk) = stream.next().await {
    let chunk = chunk?;
    // 处理 chunk bytes，发送进度事件
}
```

**Cookie 管理：**

```rust
use crate::http::client::HttpRequest;

// 获取指定 URL 的 cookies
let cookies = HttpRequest::get_cookies("https://example.com");

// 设置指定 URL 的 cookies
HttpRequest::set_cookies("https://example.com", cookie_map);

// 清除 cookies（恢复默认）
HttpRequest::clear_cookies("https://example.com");
```
