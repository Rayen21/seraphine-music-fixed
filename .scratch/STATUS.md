# 项目状态

## 版本
- 当前版本: `v0.1.45`
- Cargo.toml version: `0.1.32`

## 近期修改
- ✅ `src-tauri/src/lib.rs`: `.resizable(true)` → `.resizable(false)` (窗口大小不可调)
- ✅ `src-tauri/src/lib.rs`: 移除 `.always_on_top(true)` (窗口不再置顶)
- ✅ `src/stores/setting.ts`: 媒体键检查改为 `'Released'` (F8 等键正常工作)
- ✅ `src-tauri/src/main.rs`: `use seraphine_music_lib::run;` (import 修复)
- ✅ `mediakeys.rs` 已删除，切歌逻辑由前端 store 的 `playPrevOrNext` 支持
- ✅ 所有 `&AppHandle` → `AppHandle` 迁移完成
- ✅ `.github/workflows/build.yml`: 简化为单 `actions/cache@v4` 步骤 (多路径不支持)

## CI 状态
- ✅ 工作流已确认可正常运行 (tag v0.1.45 编译成功)
- ✅ 只编译 macOS (aarch64)，无 Windows/Linux
- ✅ CI 历史已清理
- ⚠️ `actions/cache@v4` 不支持多路径 (path 只能一个)，已简化

## 待验证
- [x] 窗口尺寸和媒体键修复
- [ ] 实际运行 App 确认窗口可拖拽到任意层级
- [ ] 实际运行 App 确认媒体键 (F7/F8/F9) 切歌功能

## CI 命令参考
- 触发编译: `git tag -a v<version> && git push origin v<version>`
- 删除 CI 历史: `gh api repos/Rayen21/seraphine-music-fixed/actions/runs --jq '.workflow_runs[].id' | while read id; do gh api repos/Rayen21/seraphine-music-fixed/actions/runs/$id -X DELETE --silent; done`
- 检查 CI: `gh api repos/Rayen21/seraphine-music-fixed/actions/runs --jq '[.workflow_runs[] | {id, status, conclusion}] | sort_by(.id) | last'`
