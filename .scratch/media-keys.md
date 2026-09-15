# 媒体按键支持

## 背景
音乐播放器需要支持苹果键盘上的多媒体按键（播放/暂停、上一曲、下一曲），即 macOS 的 MediaKey 事件。

## 技术方案
使用 `media-keyboard` crate，跨平台统一处理：
- macOS: CoreAudioServices
- Windows: RawInput
- Linux: evdev

## 已完成
- [x] Cargo.toml 添加 `media-keyboard = "0.3"` 依赖
- [x] 新建 `src-tauri/src/media_keys.rs`，注册按键回调并映射为 Tauri 事件
- [x] lib.rs 注册模块并在 setup 中调用初始化
- [x] player.rs: 添加 `music_player_next` / `music_player_prev` 命令
- [x] audio.rs: Audio 结构体新增 `next()` / `prev()` 方法
- [x] lib.rs: 注册 next/prev 命令到 invoke_handler

## 待完成
- [x] 前端 music store: 监听 `music:next` / `music:prev` 事件，触发对应播放控制

## 文件清单
| 文件 | 状态 |
|------|------|
| src-tauri/Cargo.toml | ✅ media-keyboard = "0.3" |
| src-tauri/src/media_keys.rs | ✅ 新建 |
| src-tauri/src/lib.rs | ✅ mod + init + commands |
| src-tauri/src/music/player.rs | ✅ next/prev command |
| src-tauri/src/music/audio.rs | ✅ next/prev method |
| src/stores/music.ts | ⬜ 待监听事件 |

## 备注
- `media-keyboard` crate 在 macOS 上需要 CoreAudioServices，无需额外权限
- 按键事件通过 Tauri event 系统下发到前端 store
