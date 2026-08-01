# ADR-0009: 应用自动更新机制（基于 GitHub Releases + 流式下载进度）

**状态**: 已采纳  
**日期**: 2026-08-01  
**决策者**: @buren_Lee

---

## 背景

桌面应用需要自动更新。更新方案的核心权衡：

1. **更新源** — 自建更新服务器（成本）/ Tauri updater 内置（签名要求证书钱）/ GitHub Releases（免费 + 开源友好）
2. **版本比较** — 直接字符串比较 `"0.1.5" vs "0.2.0"` 的陷阱（字符串 "0.1.10" < "0.1.9"
3. **进度显示** — 更新包通常 80-200MB，无进度条用户会以为卡死
4. **跨平台** — Windows NSIS / macOS DMG / Linux AppImage 三种格式的资产选择匹配规则

## 决策

### 一、更新源与流程

**选择 GitHub Releases 作为免费更新源。** 流程：

```
设置页面「检查更新」按钮
  ↓ invoke check_update(current_version 从 app.package_info() 取)
  ├─ GET https://api.github.com/repos/burenLee/seraphine-music/releases/latest
  ├─ 解析 tag_name → 最新版本
  ├─ 解析 assets[] 按当前平台匹配资产：
  │     Windows → name.ends_with(".exe") 且 （NSIS 安装包）
  │     macOS → 未实现，待扩展 .dmg
  │     Linux → 未实现，待扩展 .AppImage
  ├─ semver 比较 latest > current
  └─ 返回 UpdateInfo { has_update, current_version, latest_version, download_url?, file_size? }
        ↓
前端展示弹窗：发现新版本！v0.1.5 → v0.2.0，[立即更新]
  ↓ invoke download_update(download_url)
  ├─ reqwest.get(url) 流式
  ├─ 边下边写 app 临时文件
  ├─ 每块 chunk emit 事件 update:download-progress { downloaded, total, speed }
  └─ 完成：返回本地安装包路径
        ↓
前端：下载完成 → [立即安装] invoke install_update(path)
  ├─ 关闭所有窗口 + 启动安装包 + app.exit(0)
```

### 二、版本比较：semver 解析 + 去 v 前缀

```rust
fn parse_version(version: &str) -> Result<Version> {
  semver::Version::parse(version.trim_start_matches('v'))
}

let has_update = latest > current;
```

- GitHub Release 的 tag_name 通常是 `v0.1.5`，Tauri config.json 里写 `version = "0.1.4"`，trim 去掉 v 后比较。
- 为什么自己写比较器？语义化版本比较坑很多（1.0.0-alpha < 1.0.0），用官方 semver crate 免去手写。

### 三、下载进度 & 速率计算

```rust
// update:download-progress 事件 payload:
pub struct DownloadProgress {
  pub downloaded: u64, // 已下字节数
  pub total: u64,      // 总字节数 (content-length）
  pub speed: f64,      // 瞬时速度 bytes/sec
}
```

速度计算：记录上一次 chunk 的 (size / 间隔，一次简单窗口 0.5秒滑动平均，避免跳动。

### 四、GitHub API 限流 & 容错

| 问题 | 缓解 |
|------|------|
| 未认证 GitHub API 限流 60次/小时/IP | 用户主动点「检查更新」触发，不做启动轮询（默认。每次点就手动才查，一般不会超；如果后续做启动自动查，加间隔 12h 缓存一次结果）
| GitHub 国内访问慢/不通 | 失败返回「检查更新失败」错误，提供手动下载链接跳转 Releases 页面 |
| Release assets 找不到匹配平台资产 | 返回 has_update=false 正常，文案提示 |

## 考虑的替代方案

| 方案 | 优点 | 缺点 | 为什么没选 |
|------|------|------|------------|
| Tauri 官方 tauri-plugin-updater 官方签名 | 代码集成最佳实践、静默安装 | 需要代码签名证书（$400+/年）Windows 必须 EV 才能绕过 SmartScreen | 免费项目承担不起证书成本 |
| 自建更新服务器（对象存储 OSS）| 国内 CDN 加速下载快 | 服务器/带宽成本；维护更新元数据 JSON（latest.json） | 不划算，零成本优先 |
| 只提示用户手动下载 exe 覆盖安装 | 最简单 | 体验差；用户不会用 | 但保留 fallback |
| 本方案：GitHub Releases + 浏览器 GitHub + 流式 进度 + semver 比较 | 零成本；对开源友好；用户可视化进度 | 国内网速慢（可后续加镜像）| — |

## 影响

- **新增**: 扩展 macOS .dmg / Linux .AppImage 时，assets 匹配 `name.ends_with(".dmg"/".AppImage") 分平台
- **修改**: 发版 checklist：1. 调版本号同步 `tauri.conf.json version` → `scripts/sync-version.cjs`；2. git tag vX.Y.Z；3. GitHub Draft Release → 上传 3 平台安装包；4. Publish Release。漏一步用户端检测不到新版
- **约束**: 
  - tag 必须严格 vMAJOR.MINOR.PATCH 语义，不搞 v0.1.5-beta.2 的预发版本时 semver 解析正确，但用户侧不要打 prerelease 比较 0.1.0 > 0.1.0-beta ，要注意
  - 安装包下载完成启动安装前必须 `app.cleanup_before_exit()`（关 Webview，否则 NSIS 安装时报「文件被占用」
- **风险**:
  - 大文件下载中途断网：写一半的 .tmp 残留下次重新下覆盖写 OK
  - GitHub 资产地址变更：API 返回 302 → reqwest 默认 follow 对，` follow redirect OK

## 后续

- 加 Gitee / 阿里 OSS 镜像备用下载地址（国内加速）
- 后台静默下载，下载完弹「已下载完成，重启安装」
- 启动时每 12 小时缓存上次检查结果（不重复请求）
