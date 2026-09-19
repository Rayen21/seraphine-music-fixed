# 项目状态

## 版本
- 当前版本: `v0.1.43`
- Cargo.toml version: `0.1.32`

## 近期修改
- ✅ `src-tauri/src/lib.rs`: `.resizable(true)` (窗口大小可调)
- ✅ `src/stores/setting.ts`: 媒体键检查改为 `'Released'` (F8 等键正常工作)
- ✅ `src-tauri/src/main.rs`: `use seraphine_music_lib::run;` (import 修复)
- ✅ `mediakeys.rs` 已删除，切歌逻辑由前端 store 的 `playPrevOrNext` 支持
- ✅ 所有 `&AppHandle` → `AppHandle` 迁移完成
- ✅ `.github/workflows/build.yml`: 简化为单 `actions/cache@v4` 步骤 (多路径不支持)

## CI 状态
- ✅ 工作流已确认可正常运行 (tag v0.1.43 编译成功)
- ✅ 只编译 macOS (aarch64)，无 Windows/Linux
- ⚠️ `actions/cache@v4` 不支持多路径 (path 只能一个)，已简化

## 待验证
- [ ] 实际运行 App 确认窗口尺寸和媒体键

## CI 命令参考
- 触发编译: `git tag -a v<version> && git push origin v<version>`
- 删除 CI 历史: `gh api repos/Rayen21/seraphine-music-fixed/actions/runs --jq '.workflow_runs[].id' | while read id; do gh api repos/Rayen21/seraphine-music-fixed/actions/runs/$id -X DELETE --silent; done`
- 检查 CI: `gh api repos/Rayen21/seraphine-music-fixed/actions/runs --jq '[.workflow_runs[] | {id, status, conclusion}] | sort_by(.id) | last'`
