# 修复日志

## 2026-09-15 — 媒体键 + 专辑图片加载问题

### 问题1：苹果键盘媒体键不工作

**根因：** 后端 `media_keys.rs`（souvlaki crate）正确初始化 macOS Now Playing 元数据并捕获媒体按键，通过 `app_handle.emit("media-key", ...)` 发送事件到前端。但前端从未监听这些事件，导致事件被丢弃。

**修复文件：** `src/stores/music.ts`
- 新增 `monitorMediaKey()` 函数，监听 `'media-key'` 事件并映射到播放控制（playpause / nexttrack / previoustrack）
- 在 store 水合时调用 `monitorMediaKey()`

### 问题2：专辑图片不显示

**根因：** 在线图片直接通过浏览器 `<img>` 标签加载，受 CORS/CDN 限制导致失败。后端已有 `api_download_image` 代理接口（返回 base64）但前端未使用。

**修复文件：**
- `src/components/Image.vue` — 区分本地路径和在线 URL：本地文件继续用浏览器加载，在线 URL 走后端代理下载 base64；添加降级策略
- `src/types/global.d.ts` — 注册 `api_download_image` 的 Invoke 类型定义

### 验证
- TypeScript 编译通过（vue-tsc --noEmit）
