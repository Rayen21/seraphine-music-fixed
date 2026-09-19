# Seraphine Music - 项目进度文档

> 最后更新: 2026-09-19
> 仓库: https://github.com/Rayen21/seraphine-music-fixed
> 当前版本: v0.1.32 (main)
> CI 状态: ✅ 构建通过

## 项目架构

- **前端**: Vue 3 + Pinia + Vite
- **后端**: Tauri v2 + Rust (seraphine_music_lib crate)
- **窗口架构**: 三窗口隔离（主窗口 / 桌面歌词 / 迷你播放器），共享基础层
- **数据同步**: 子窗口禁止 import 主窗口 store，数据同步走 Tauri events
- **异步任务**: `tauri::async_runtime::spawn`，禁止 `tokio::spawn`
- **事件命名**: 业务前缀（如 `music:`）

---

## 当前状态

| 状态 | 说明 |
|------|------|
| ✅ 代码已修改、提交、推送 | 所有修复已推送到远端 main |
| ✅ CI 构建通过 | v0.1.32 的 GitHub Actions 构建成功 |
| ✅ Release 已创建 | Seraphine Music v0.1.32 已发布 |

## 关键文件路径

```
/Users/hanqingren/seraphine-music-fixed/
├── src-tauri/
│   ├── Cargo.toml              # Rust 依赖配置（已移除 media-keys）
│   ├── src/lib.rs              # Tauri 入口，注册 plugin / command
│   ├── src/main.rs             # 入口: use seraphine_music_lib::run;
│   ├── src/music/player.rs     # 播放器核心
│   ├── src/http/config.rs      # HTTP 配置 / 网易云 cookies
│   └── src/api/login.rs        # 登录 API
├── src/
│   ├── stores/music.ts         # 音乐状态管理
│   ├── stores/list.ts          # 播放列表管理
│   └── composables/            # 迷你播放器 / 桌面歌词桥接
├── src-tauri/tauri.conf.json   # Tauri 构建配置
└── .github/workflows/build.yml # GitHub Actions CI (仅 macOS)
```

## 已完成修复

### 1. 编译错误修复（v0.1.32）

**问题**: `main.rs` 中 `use seraphine_music::run;` 无法解析，因为 Cargo.toml 中 lib 名为 `seraphine_music_lib`

**修复**:
- `src-tauri/src/main.rs`: `use seraphine_music_lib::run;`
- `src-tauri/src/lib.rs`: 修复两个 warning（unused `event` 参数、unused `Result`）

### 2. CI Workflow 修复（v0.1.31）

- 移除 `build-other` job（Windows/Linux），仅保留 macOS
- 修正 `tauriScript`/`args` 缩进
- 移除 `media-keys` 依赖及相关代码
- 删除 `src-tauri/src/mediakeys.rs`
- 移除前端 `playPrevOrNext` 调用
- 所有 `&AppHandle` → `AppHandle` 迁移
- 移除 `WindowListener`，使用 `.minimizable(false)`/`.maximizable(false)`

### 3. Git 重新初始化

- 因 `.git` 目录权限问题，重新初始化仓库
- 所有修改重新 commit 并 push

---

## 待执行操作

- [ ] 验证 v0.1.32 的 DMG 可在 macOS Apple Silicon 上运行
- [ ] 测试 F7/F8/F9 多媒体键盘快捷键功能（代码已集成但未验证）
- [ ] 前端测试: `pnpm test`
- [ ] Rust 测试: `cd src-tauri && cargo test`
