# F7 / F8 / F9 媒体快捷键修改完整记录

> 项目：Seraphine Music（macOS 桌面音乐播放器）
> 涉及硬件：2023 MacBook Pro（M2/M3 芯片），macOS 26.6.2
> 状态：F7（上一首）、F8（播放/暂停）、F9（下一首）均已正常工作

---

## 一、问题背景

Seraphine Music 的 macOS 版本使用 `global-hotkey` 库（fork 自 [soffes/HotKey](https://github.com/soffes/HotKey)）来捕获全局快捷键。在 2023 MacBook 上，F7/F9 键的按键行为存在特殊之处，导致切歌功能始终无法正常工作。

核心问题：
1. **F7/F9 的 SystemDefined 事件发送的 NX_KEYTYPE 值不标准** — macOS 发出的事件值与苹果定义不一致。
2. **`global-hotkey` 源码未监听 F7/F9 的 KeyDown/KeyUp 事件** — 在 macOS 13+，按 F7/F9 （不按 Fn）时发送的是 KeyDown 事件而非 SystemDefined 事件。
3. **前端注册 Key 字符串与后端匹配逻辑不一致** — 前端用 `'F7'`，后端可能注册为 `Code::F9`（MediaTrackNext）。
4. **`HotKey` 的 `PartialEq` 对 `modifiers` 严格匹配** — 前端注册 `HotKey(None, F7)`，但后端 fallback 构造了 `HotKey(Some(empty), ...)`，导致匹配失败。

---

## 二、修改时间线（从旧到新）

### 第 1 轮：前端注册策略调整（2026-09-20）

**文件：** `src/stores/setting.ts`

| 提交 | 改动 |
|------|------|
| `af9dbb0` | 将 F7/F9 的注册从 `MediaTrackPrevious/MediaTrackNext` 改为 `'F7'/'F9'`（前端 Key 字符串） |
| `dc2eca3` | 回退为 `MediaTrackNext/MediaTrackPrevious`（误判） |
| `af9dbb0` | 再次改回 `'F7'/'F9'`（最终方案） |
| `54eb96e` | 让 F7/F9 同时受全局快捷键开关控制（后回退） |
| `57bad24` | 恢复 F7/F9 独立于全局快捷键开关 |

**当前状态：**
- F8 → 注册 `'MediaPlayPause'`，受全局快捷键开关控制
- F7 → 注册 `'F7'`（Key 字符串），独立开关
- F9 → 注册 `'F9'`（Key 字符串），独立开关

### 第 2 轮：vendor 全局快捷键监听扩展（2026-09-20）

**文件：** `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/vendor/global-hotkey-0.8.0/`

**提交：** `f005bb4`

改动：
1. 在 `Cargo.toml` 中添加 `[patch.crates-io]` 指向本地 vendor 目录
2. `event_mask` 扩展为监听 `SystemDefined | KeyDown | KeyUp`
3. `key_to_scancode` 中移除 F7(0x62) 和 F9(0x74)（不再走 Carbon scancode 路径）
4. `is_media_key()` 将 `Code::F7 | Code::F9` 加入匹配列表
5. 新增 KeyDown/KeyUp 处理分支：keyCode 0x62→F7、0x74→F9
6. 注册逻辑：走 `media_hotkeys` 路径，触发 `start_watching_media_keys()`

### 第 3 轮：Fallback 匹配 F7/F9（2026-09-20）

**文件：** `src-tauri/vendor/global-hotkey-0.8.0/src/platform_impl/macos/mod.rs`

**提交：** `a9bac31` → `c7c93ef`

在 `media_key_event_callback` 的 `ScreenChanged` 块内添加 fallback：
```rust
let fallback_code = match nx_keytype {
    NX_KEYTYPE::Previous => Some(Code::F7),
    NX_KEYTYPE::Next => Some(Code::F9),
    _ => None,
};
```
用 fallback_code 构造 `HotKey(None, fallback_code)` 去匹配已注册的 F7/F9。

### 第 4 轮：修正 modifier 匹配失败（2026-09-21）

**文件：** `src-tauri/vendor/global-hotkey-0.8.0/src/platform_impl/macos/mod.rs`

**提交：** `beb02f9`、`c826d7c`

问题：`HotKey::new(Some(empty_mods), F9)` 与 `HotKey(None, F9)` 在 Rust 中 `PartialEq` 不相等。

修改：
- 将 fallback 中的 `HotKey::new(Some(mods), fallback_code)` 改为 `HotKey::new(None, fallback_code)`
- 将 KeyDown/KeyUp 处理中的 `HotKey::new(Some(mods), mapped_code)` 改为 `HotKey::new(None, mapped_code)`
- 将主匹配中的 `HotKey::new(Some(mods), nx_keytype.into())` 改为 `HotKey::new(None, nx_keytype.into())`

### 第 5 轮：NX_KEYTYPE::Rewind → F9（最终修复，2026-09-21）

**文件：** `src-tauri/vendor/global-hotkey-0.8.0/src/platform_impl/macos/mod.rs`

**提交：** `5629024`

**根因：** 2023 MacBook 上按 F9 时，macOS 发出的 NX_KEYTYPE 值为 20（`NX_KEYTYPE::Rewind`），而非 17（`NX_KEYTYPE::Next`）。`From<NX_KEYTYPE> for Code` 将 Rewind 映射为 `Code::MediaRewind`，不是 `Code::F9`，导致匹配全部失败。

修复：在 fallback match 中增加：
```rust
NX_KEYTYPE::Rewind => Some(Code::F9),
NX_KEYTYPE::Fast => Some(Code::F9),
```

---

## 三、最终代码结构

### 前端（setting.ts）

```typescript
// F8 播放/暂停 — 走 MediaPlayPause Key
await register('MediaPlayPause', ...)

// F7 上一首 — 走 F7 Key（独立开关）
await register('F7', ...)

// F9 下一首 — 走 F9 Key（独立开关）
await register('F9', ...)
```

### 后端 vendor 匹配流程

```
按键事件
  └─ SystemDefined (ScreenChanged)
       ├─ NX_KEYTYPE::Play → HotKey(None, MediaPlayPause) → 匹配 F8
       ├─ NX_KEYTYPE::Previous → HotKey(None, F7) → 匹配 F7 ✓
       ├─ NX_KEYTYPE::Next → HotKey(None, F9) → 匹配 F9 ✓
       └─ NX_KEYTYPE::Rewind → fallback → Code::F9 → 匹配 F9 ✓
       └─ NX_KEYTYPE::Fast → fallback → Code::F9 → 匹配 F9 ✓
  └─ KeyDown / KeyUp
       ├─ keyCode 0x62 → Code::F7 → 匹配 F7 ✓
       └─ keyCode 0x74 → Code::F9 → 匹配 F9 ✓
```

---

## 四、关键常量与映射

| macOS NX_KEYTYPE | 值 | 前端 Key 字符串 | 后端 Code | 说明 |
|---|---|---|---|---|
| `NX_KEYTYPE::Play` | 16 | `'MediaPlayPause'` | `MediaPlayPause` | 播放/暂停 |
| `NX_KEYTYPE::Next` | 17 | `'F9'` | `Code::F9` | 下一首 |
| `NX_KEYTYPE::Previous` | 18 | `'F7'` | `Code::F7` | 上一首 |
| `NX_KEYTYPE::Rewind` | 20 | `'F9'` (fallback) | `Code::F9` (fallback) | 2023 MacBook 按 F9 实际发出 |
| `NX_KEYTYPE::Fast` | 19 | `'F9'` (fallback) | `Code::F9` (fallback) | 备用映射 |

---

## 五、修改涉及的完整文件列表

| 文件 | 改动内容 |
|------|----------|
| `src/stores/setting.ts` | F7/F9 注册 Key、unregister、MediaPlayPause 保持不动 |
| `src-tauri/Cargo.toml` | 添加 `[patch.crates-io] global-hotkey` |
| `src-tauri/Cargo.lock` | 从 crates-io 替换为 vendor 路径 |
| `src-tauri/vendor/global-hotkey-0.8.0/Cargo.toml` | 完整 vendor 文件 |
| `src-tauri/vendor/global-hotkey-0.8.0/src/platform_impl/macos/mod.rs` | 核心修改：event_mask、is_media_key、key_to_scancode、media_key_event_callback 中的 fallback 和 KeyDown handler |
| `src-tauri/vendor/global-hotkey-0.8.0/src/hotkey.rs` | vendor 完整文件，HotKey 结构体定义 |
| `src-tauri/vendor/global-hotkey-0.8.0/src/lib.rs` | vendor 完整文件 |
| `src-tauri/vendor/global-hotkey-0.8.0/src/error.rs` | vendor 完整文件 |

---

## 六、注意事项

1. **F8 不受影响** — F8（MediaPlayPause）走标准 NX_KEYTYPE::Play → MediaPlayPause 路径，始终正常工作。
2. **F7 和 F9 是独立的** — 不受全局快捷键开关（`mediaShortcutState`）控制。
3. **2023 MacBook 特殊性** — F9 发出的是 `NX_KEYTYPE::Rewind`(20) 而非 `NX_KEYTYPE::Next`(17)，这是本项目的核心适配点。
4. **不编译本地** — 所有修改通过 `git push origin main` + GitHub Actions CI 构建。
