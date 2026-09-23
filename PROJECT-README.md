# Seraphine Music — 项目说明

> macOS 桌面音乐播放器，Tauri v2 + Vue 3 + Pinia
> 远程仓库：https://github.com/Rayen21/seraphine-music-fixed

---

## 目录结构

```
├── src/                          # 前端 Vue 3 源码
│   ├── components/               # 公共组件（Image.vue 等）
│   ├── stores/                   # Pinia store（music.ts, setting.ts, ...）
│   ├── views/                    # 页面视图
│   └── App.vue                   # 根组件（全局快捷键注册入口）
├── src-tauri/                    # Rust 后端（Tauri v2）
│   ├── src/lib.rs                # Tauri 入口（全局快捷键、托盘）
│   ├── src/api/                  # API 命令（fetch_image, http 等）
│   ├── src/music/                # 音乐播放器逻辑
│   ├── vendor/                   # 本地 vendor 包（global-hotkey）
│   ├── patched-tao/              # 补丁后的 tao crate（Cmd+W 修复）
│   ├── Cargo.toml                # Rust 依赖（含 [patch.crates-io]）
│   └── tauri.conf.json           # Tauri 配置（CSP、窗口等）
├── .scratch/                     # 问题追踪文档（本地，不提交）
│   ├── album-cover-display-fix/  # 专辑封面修复记录
│   ├── album-image-fix/          # 图片修复完整记录
│   ├── cmd-w-shortcut/           # Cmd+W/Cmd+M 问题
│   └── f7-f8-f9-shortcuts/       # F7/F8/F9 快捷键记录
├── docs/                         # 项目文档
│   ├── architecture.md           # 三窗口隔离架构
│   ├── conventions.md            # 开发约定
│   ├── testing.md                # 测试验收
│   └── agents/                   # Agent 相关文档
├── .github/workflows/build.yml   # CI 工作流
├── .gitignore
└── PROJECT-README.md             # 本文件
```

---

## 快速开始

### 本地开发

```bash
cd src-tauri
cargo build --release
cd ../..
pnpm tauri dev
```

### CI 编译（GitHub Actions）

```bash
# 需要编译时，commit 信息加 [build]
git commit -m "[build] 描述修改内容"

# 不需要编译（文档、代码调整）
git commit -m "docs: 更新说明"
```

> 编译触发条件：`workflow_dispatch` 或提交信息包含 `[build]`

---

## 关键文件速查

| 功能 | 文件 |
|------|------|
| 图片加载修复 | `src/components/Image.vue`, `src-tauri/src/api/image.rs` |
| CSP 配置 | `src-tauri/tauri.conf.json`（`csp` 字段） |
| 全局快捷键（F7/F9） | `src/stores/setting.ts`（`registerMediaShortcut`） |
| 全局快捷键（Cmd+W） | `src-tauri/src/lib.rs`（`setup` 回调） |
| 窗口委托补丁 | `src-tauri/patched-tao/src/platform_impl/macos/window_delegate.rs` |
| 后端 vendor 包 | `src-tauri/vendor/global-hotkey-0.8.0/` |

---

## 已知问题与修复记录

### 已修复

| 问题 | 修复位置 | 状态 |
|------|----------|------|
| 专辑封面不显示 | `.scratch/album-image-fix/fix-summary.md` | ✅ 已修复 |
| F7/F9 切歌 | `.scratch/f7-f8-f9-shortcuts/spec.md` | ✅ 已修复 |
| Cmd+W 退出程序 | `docs/F7-F8-F9-KEYBOARD-HISTORY.md`（部分） | ⚠️ 待验证 |

### 待处理

| 问题 | 工单位置 | 状态 |
|------|----------|------|
| Cmd+W 按键无反应 | `.scratch/cmd-w-shortcut/issues/01-cmd-w-no-reaction.md` | ⚠️ 修复中 |
| Cmd+M 最小化无反应 | `.scratch/cmd-w-shortcut/spec.md` | ⚠️ 待验证 |

---

## 开发约定

- **分支前缀**：`codex/`（如 `codex/fix-cmd-w`）
- **Commit 格式**：Conventional Commits（`feat:`, `fix:`, `docs:`, `ci:`）
- **子窗口**：禁止 import 主窗口 store，数据同步走 Tauri events
- **异步任务**：`tauri::async_runtime::spawn`，禁止 `tokio::spawn`
- **事件命名**：添加业务前缀（如 `music:`）

---

## 测试

```bash
# 前端测试
pnpm test

# Rust 测试
cd src-tauri && cargo test

# 类型检查
pnpm build
```

---

## 文档规范

- 问题追踪：`.scratch/<feature>/` 下 `spec.md` + `issues/NN-slug.md`
- 地图文件：`.scratch/<feature>/map.md`（已做决策 + 待澄清）
- 工单状态：`Status: claimed` / `Status: resolved`
- 备注：`.gitignore` 已忽略 `.scratch/`，本地修改不提交

---

## 版本发布

- 标签格式：`v*`（如 `v0.1.8`）
- 发布时自动清理旧 Release 和旧 CI 记录
- 产物：`seraphine-music-macos-arm64.zip`（DMG + .app）
