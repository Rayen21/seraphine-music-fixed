# 修复日志

## 2026-09-15 - macOS 媒体键与专辑封面显示修复

### 问题一：Mac 上 F7/F9 媒体按键失效（仅 F8 有效）

**原因分析：**
- 上游仓库虽然引入了 `souvlaki = "0.7"` crate，但从未在 Rust 代码中实际使用
- macOS 的媒体键（F7/F9）需要接入原生 MPRemoteCommandCenter API
- Tauri 的 hotkey 插件对 macOS 媒体键支持有限

**修复方案：**
1. 创建 `src-tauri/src/media_keys.rs`，使用 souvlaki crate 注册媒体键：
   - `set_play()` → 触发 "play" 事件
   - `set_pause()` → 触发 "pause" 事件
   - `set_next_track()` → 触发 "next" 事件（F9）
   - `set_previous_track()` → 触发 "prev" 事件（F7）
2. 在 `lib.rs` 中注册 media_keys 模块并在 setup 阶段调用 `media_keys::init(&app_handle)`
3. souvlaki 仅在 macOS 平台编译（Cargo.toml 已有 `[target.'cfg(target_os = "macos")'.dependencies]` 配置）

### 问题二：UI 界面不显示专辑封面图片

**原因分析：**
- `Image.vue` 组件对本地文件路径直接传给 `<img src>`，未使用 Tauri 的 `convertFileSrc()` API
- macOS WebKit（Safari 内核）对 file:// URL 有严格的安全限制，会拦截本地资源加载
- Windows WebView2（Chromium 内核）对此限制较宽松

**修复方案：**
1. `Image.vue` 中导入 `convertFileSrc` from `@tauri-apps/api/core`
2. 在 `handlePreload()` 中对本地路径调用 `convertFileSrc(img)` 转换为 asset: 协议 URL
3. 模板中的 `<img :src>` 也使用 `convertFileSrc(img)` 处理本地路径

### 其他已修复问题（之前轮次）

- CI 构建流程修复：支持 Intel + Apple Silicon 双架构
- 缓存目录修复：从当前工作目录改为 home 目录
- 缺失文件恢复：tailwind.config.js, postcss.config.js 等
