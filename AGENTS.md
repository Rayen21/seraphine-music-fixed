## Agent skills

- 使用英文思考,使用中文回答

### Issue tracker

以 Markdown 文件形式存放在 `.scratch/` 目录中，每个功能一个子目录。详见 [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md)。

### Triage labels

使用默认五标签映射（needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix）。详见 [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md)。

### Domain docs

单上下文布局，根目录 `CONTEXT.md` + `docs/adr/`。详见 [`docs/agents/domain.md`](docs/agents/domain.md)。

## 快速命令

| 命令                         | 对应 package.json 脚本                                       | 说明                                      |
| ---------------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| `pnpm tauri dev`             | `tauri` 脚本 + `dev` 子命令                                  | 启动 Tauri 完整开发环境                   |
| `pnpm tauri build`           | `tauri` 脚本 + `build` 子命令                                | 完整构建（前端 + Rust + 打包）            |
| `pnpm dev`                   | `dev: vite`                                                  | 启动前端开发服务器（端口 1420）           |
| `pnpm build`                 | `build: vue-tsc --noEmit && vite build`                      | 类型检查 + 前端构建                       |
| `pnpm preview`               | `preview: vite preview`                                      | 本地预览生产构建                          |
| `pnpm lint-format`           | `lint-format: eslint . --fix && prettier . --write`          | ESLint + Prettier 一键整理                |
| `pnpm set-ver x.x.x`         | `set-ver: node scripts/sync-version.cjs`（需传 semver 参数） | 同步三处版本号（package / tauri / cargo） |
| `pnpm test`                  | `test: vitest run`                                           | 运行前端测试（Vitest）                    |
| `cd src-tauri && cargo test` | —（Rust 原生）                                               | 运行 Rust 测试                            |

## 关键约定

- 子窗口禁止 import 主窗口 store，数据同步走 Tauri events
- `setup` 中异步任务用 `tauri::async_runtime::spawn`，禁止 `tokio::spawn`
- 事件命名添加业务前缀（如 `music:`）
- Commit 遵循 Conventional Commits
- 详见 [docs/conventions.md](docs/conventions.md)

## 验证流程

- 前端测试：`pnpm test`（Vitest + happy-dom，测试文件在 `tests/` 镜像目录结构，覆盖 utils/stores/components/composables/子窗口/集成测试）
- Rust 测试：`cd src-tauri && cargo test`（纯函数 / serde / 边界 / 常量 / command 符号）
- 类型检查：`pnpm build`（vue-tsc --noEmit，strict 模式）
- 详见 [docs/testing.md](docs/testing.md)

---

## 文档导航

| 文档                                         | 说明                                                          |
| -------------------------------------------- | ------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md) | 后端 + 前端架构详解（模块划分、关键设计、构建配置）           |
| [docs/conventions.md](docs/conventions.md)   | 关键约定（窗口隔离、异步任务、事件命名、跨平台、Commit 规范） |
| [docs/testing.md](docs/testing.md)           | 验证流程与质量检查（测试策略、ESLint/Prettier、构建验证）     |

                               |
