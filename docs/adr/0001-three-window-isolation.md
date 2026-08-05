# 三窗口隔离 + 共享基础层架构

Seraphine Music 需要在主窗口之外提供迷你播放器与桌面歌词两个子窗口，且子窗口运行在独立的 WebView 上下文中，直接 import 主窗口 Pinia store 会破坏隔离并导致状态难以推理。我们因此采用「三窗口独立入口 + 共享基础层」架构：三窗口共用 `src/components/`、`src/utils/`、`src/types/`、`src/styles/` 基础层，业务代码位于 `src/windows/<window-name>/`，子窗口与主窗口之间的状态同步一律走 Tauri events 通道，HTML 入口、Bridge、Capabilities、Specs 统一使用窗口名（`mini-player`、`desktop-lyric`）作为前缀。

具体规则：

- 三窗口架构：主窗口（main）、迷你播放器（mini-player）、桌面歌词（desktop-lyric）
- 子窗口代码位于 `src/windows/<window-name>/`
- 子窗口**禁止**直接 import 主窗口 store（`src/stores/*`）
- 子窗口与主窗口数据同步通过 **Tauri events** 通道实现
- HTML 入口、Bridge、Capabilities、Specs 统一使用窗口名称作为前缀（如 `mini-player` 而非 `desktop-mini`）
