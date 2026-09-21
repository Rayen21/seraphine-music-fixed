# 专辑图片无法显示修复记录

## 问题描述

用户反馈：已安装版本中，专辑封面图片无法显示（原项目正常运行时正常显示）。

## 根因分析

### 问题定位

专辑图片加载链路为：
> API 返回 CDN URL → Image.vue 调用 invoke(fetch_image) → 后端 fetch_image 使用 Tauri HTTP 客户端拉取 → 返回 base64 data URL → img src=data:... 渲染

### 根本原因：CSP 拦截 data URL

src-tauri/tauri.conf.json 中的 CSP img-src 指令为：
```
img-src 'self' asset: http: https:
```

未包含 data: 协议。当 Image.vue 将后端返回的 base64 data URL 设为 img src=data:... 时，WebView 的 Content Security Policy 直接拦截了资源加载。

为何 @error 兜底不生效：
WebView 的 CSP 拦截发生在渲染层，不触发 img 的 error 事件，因此 @error="isError = true" 从未执行，fallback 图标也看不到。

### 已排除的因素

- ClashX/Mate 代理拦截：用户关闭代理后仍不显示，排除
- 后端编译错误：已修复（5 次迭代），编译通过
- HTTP→HTTPS 重试：已实现但非根因

## 修复内容

### 修复一：CSP 放行 data: 协议

文件：src-tauri/tauri.conf.json

修改：在 img-src 中添加 data: 协议

```
img-src 'self' asset: data: http: https:
```

Commit: 3d8ccec

### 修复二：适配 Kuwo CDN（img4.kuwo.cn）请求头

**问题**：顶部"猜你喜欢"、"每日推荐"等 Banner 卡片图片仍为空白。

**根因**：Kuwo CDN（img{1-5}.kuwo.cn）对请求的 Cookie 有特定要求，需要 `kw_token` 参数。后端 `fetch_image` 命令之前只设置了 Kugou CDN 的 Cookie（dfid, token 等），Kuwo 域名收到请求后因缺少 kw_token 而拒绝返回图片。

**修复方案**：在 `build_cdn_header()` 中识别 Kuwo CDN URL（包含 `kuwo.cn` 或 `kuwoimg.com`），从 URL 查询参数中提取 `kw_token`，将其作为 Cookie 发送。同时设置 Kuwo 专用的 Referer 和 User-Agent。

文件：src-tauri/src/api/image.rs

变更：
- `build_cdn_header()` 新增 `url: &str` 参数
- 新增 `extract_kw_token(url)` 辅助函数，解析 URL 查询参数中的 `kw_token`
- `build_cdn_header()` 内按域名区分 Kuwo/Kugou 的请求头策略
- Kuwo 策略：Referer=kuwo.cn, UA=MSIE 10.0, Cookie=kw_token=xxx

Commit: 55cb7c7

## CI 构建

| Commit | 说明 | Actions 链接 |
|--------|------|-------------|
| 3d8ccec | CSP 放行 data: 协议 | [run](https://github.com/Rayen21/seraphine-music-fixed/actions/runs/35548778389) |
| 55cb7c7 | Kuwo CDN kw_token 适配 | [run](https://github.com/Rayen21/seraphine-music-fixed/actions/runs/35611209158) |

## 修复三：音频缓存文件名使用可读名称

**问题**：音频缓存文件（`~/.seraphine-music/` 目录下）存储为 32 位十六进制哈希字符串（如 `228610852CB411A6FC432B2258AA585E`），而歌词文件使用可读格式（如 `爱河 - 花粥 - 765512743.krc`）。

**根因**：`music_player_load_url` 命令只接收 `{ path, hash }` 参数，文件保存直接使用 `hash` 作为文件名，没有歌曲名和歌手名信息。

**修复方案**：
1. 后端 `music_player_load_url` 新增 `name` 和 `artist` 参数
2. 从 URL 路径提取扩展名（如 `/song.mp3?token=xxx` → `.mp3`）
3. 文件名格式改为：`{name} - {artist} - {hash}.{ext}`
4. 前端 `music.ts` 传入 `newMusic.title` 和 `newMusic.artist`

**涉及文件**：
- `src-tauri/src/music/player.rs`：参数增加 + 文件命名逻辑
- `src/stores/music.ts`：调用时传入 title/artist
- `src/types/global.d.ts`：类型定义更新（注意 `artist: string | null` 需 fallback 为 `""`）

**已知编译问题及修复**：
- `E0382: borrow of moved value: path` — `HttpRequest::get(path)` 消费了 `path` 所有权，需将扩展名提取移至 `get()` 调用之前。

**Commit 历史**：
- `2326508` — 初始实现（含类型错误）
- `baf83c8` — 修复 `artist: string | null` 类型错误
- `6553187` — 修复 borrow of moved value

**CI 构建**：[run 35616096084](https://github.com/Rayen21/seraphine-music-fixed/actions/runs/35616096084) — ✅ 成功，DMG 已下载至 `/tmp/seraphine-build/`
