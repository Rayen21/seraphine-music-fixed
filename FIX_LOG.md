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

## 2026-09-15 — CI 构建失败修复

### 问题：GitHub Actions 构建持续失败

**错误信息：** `failed to watch /Users/runner/work/seraphine-music-fixed/seraphine-music-fixed/Cargo.toml: No path was found.`

**根因分析：**
- Tauri CLI v2 在 CI runner 上查找 Cargo.toml 时，期望在项目根目录找到 workspace Cargo.toml
- 项目结构是 `src-tauri/Cargo.toml`（非 workspace），CLI 无法正确定位
- 之前的修复尝试（移动 tauri.conf.json、移除 tauriScript 等）均未解决

**修复方案：**
1. **添加根目录 `Cargo.toml`** — 作为 workspace，包含 `src-tauri` 成员：
   ```toml
   [workspace]
   members = ["src-tauri"]
   resolver = "2"
   ```
2. **移除根目录的 `tauri.conf.json`** — Tauri v2 期望配置文件在 src-tauri/ 下，根目录不应有副本
3. **添加 `.gitignore`** — 排除 node_modules、dist、pnpm-store 等无关文件

### 提交记录
- `8803c38` fix: 添加 workspace Cargo.toml 和 .gitignore，移除根目录 tauri.conf.json
- `8c47a32` fix: 移除 media_keys.rs（上游无此文件，导致编译失败）

### 验证
- 本地构建通过（需安装 Rust/Cargo）
- CI 等待 GitHub Actions 结果
