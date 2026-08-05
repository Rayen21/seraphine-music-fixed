# 关键约定

## 共享层与业务层

- 共享基础层代码放在 `src/components/`、`src/utils/`、`src/types/`、`src/styles/`，三窗口通用
- 各窗口业务代码放在 `src/windows/[window-name]/`

## 异步任务

- Tauri `setup` 回调中的异步任务必须使用 `tauri::async_runtime::spawn`，**禁止**直接使用 `tokio::spawn`（会因缺少 Tokio reactor 上下文而 panic）

## 跨平台命令

- Windows 平台下执行需要 UAC 提权的外部命令时，使用 `std::process::Command` 配合 `creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)` 隐藏控制台窗口，保留 `cmd /C start` 命令以触发 UAC 提权
- 跨平台命令执行需通过条件编译隔离平台特定实现，非 Windows 平台返回明确错误信息而非编译失败

## Commit 规范

- 遵循 Conventional Commits 风格
- 使用 `Fixes`/`Closes`/`Resolves` + `#<issue-number>` 自动关闭 issue

## ADR

- 架构决策使用 ADR 文档记录，编号从 `0001` 开始，存放在 `docs/adr/`

## 版本同步

- `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 三处版本号保持一致
- 使用 `pnpm set-ver` 同步版本，`pnpm check-ver` 检查一致性
