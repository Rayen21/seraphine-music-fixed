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

文件：src-tauri/tauri.conf.json

修改：在 img-src 中添加 data: 协议

img-src 'self' asset: data: http: https:

## 影响范围

- 所有使用 Image 组件的页面（专辑封面、歌手头像、播放列表封面等）
- 不影响已有 HTTPS 直链图片（https: 已放行）
- 不影响本地文件图片（asset: 已放行）

## CI 构建

Commit: 3d8ccec | 分支: main
GitHub Actions: Rayen21/seraphine-music-fixed/actions
