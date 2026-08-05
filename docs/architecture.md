# 架构详解

## 前端架构（Vue 3 / TypeScript）

前端代码位于 `src/`，采用三窗口独立入口 + 共享基础层架构（详见 [ADR-0001](./adr/0001-three-window-isolation.md)）：

```
src/
├── main.ts                 # 主窗口入口
├── desktop-lyric.ts        # 桌面歌词窗口入口
├── mini-player.ts          # 迷你播放器窗口入口
├── index.html              # 主窗口 HTML
├── desktop-lyric.html      # 桌面歌词 HTML
├── mini-player.html        # 迷你播放器 HTML
├── router/                 # 路由（Hash 模式）
├── stores/                 # Pinia 状态管理（主窗口专用）
│   ├── music.ts            # 播放状态机（Play/Pause/Stop/加载/重试）
│   ├── list.ts             # 播放列表
│   ├── lyric.ts            # 歌词
│   ├── user.ts             # 用户/登录/VIP 状态
│   ├── setting.ts          # 设置
│   ├── context-menu.ts     # 右键菜单
│   ├── refresh.ts          # 刷新逻辑
│   └── updater.ts          # 更新逻辑
├── components/             # 共享组件
├── composables/            # 子窗口 Bridge（事件桥接）
│   ├── useMiniPlayerBridge.ts
│   └── useDesktopLyricBridge.ts
├── layout/                 # 布局组件
│   ├── Aside/              # 侧边栏
│   ├── Header/             # 头部（登录/搜索/菜单）
│   ├── LyricPage/          # 歌词页
│   ├── Main/               # 主体内容
│   └── Playbar/            # 播放栏
├── views/                  # 页面视图
├── windows/                # 子窗口业务代码
│   ├── desktop-lyric/
│   └── mini-player/
├── utils/                  # 工具函数
├── types/                  # 类型定义
├── styles/                 # 全局样式
└── assets/                 # 静态资源
```

### 路由

使用 `createWebHashHistory`，主窗口路由嵌套在 `Layout` 组件下，子窗口路由独立。

### 状态管理

- 主窗口使用 Pinia + `pinia-plugin-persistedstate` 持久化
- 子窗口使用组件局部 `ref()` 管理状态，通过 Tauri events 与主窗口同步
- 子窗口**禁止**直接 import 主窗口 store（`src/stores/*`）

## 后端架构（Rust / Tauri）

后端代码位于 `src-tauri/src/`，分为五个模块：

```
src-tauri/src/
├── lib.rs          # 入口：插件注册、托盘图标、Tauri command 注册
├── api/            # 酷狗音乐 API 封装
│   ├── login.rs    # 登录（二维码/微信/验证码/手机号/Token）
│   ├── search.rs   # 搜索（单曲/复杂搜索）
│   ├── song.rs     # 歌曲 URL 获取
│   ├── playlist.rs # 歌单（标签/用户/详情/增删/曲目）
│   ├── album.rs    # 专辑歌曲
│   ├── artist.rs   # 歌手列表/音频
│   ├── audio.rs    # 音频信息
│   ├── lyric.rs    # 歌词搜索/获取
│   ├── rank.rs     # 排行榜
│   ├── top.rs      # 排行榜/歌单/专辑
│   ├── personal.rs # 私人 FM
│   ├── privilege.rs# 权限
│   ├── user.rs     # 用户详情
│   ├── youth.rs    # 概念版 VIP
│   ├── register.rs # 设备注册
│   └── music.rs    # 每日推荐
├── http/           # HTTP 层
│   ├── client.rs   # 客户端封装
│   ├── config.rs   # HTTP 配置（Cookie/Header 管理）
│   ├── mode.rs     # HTTP 模式切换
│   ├── server.rs   # 代理请求封装
│   └── libs.rs     # HTTP 工具库
├── music/          # 音频处理层
│   ├── player.rs   # 播放器核心（rodio 封装，播放/暂停/停止/跳转/音量）
│   ├── audio.rs    # 音频设备管理
│   ├── file.rs     # 音频文件解析（lofty 元数据）
│   ├── lyric.rs    # 歌词解析（KRC/LRC 解码）
│   ├── scan.rs     # 本地音乐扫描
│   └── stream.rs   # 流式播放
├── system/         # 系统层
│   ├── path.rs     # 文件路径操作
│   ├── setting.rs  # 系统设置
│   └── update.rs   # 应用更新
└── utils/          # 工具层
    ├── crypto.rs   # 加解密（AES-CBC/RSA/MD5/SHA1）
    ├── helper.rs   # 通用辅助函数
    └── tools.rs    # 工具函数
```

### 关键设计

- **Tauri 插件**：`single-instance`（单实例）、`global-shortcut`（全局快捷键）、`autostart`（开机自启）、`clipboard-manager`、`dialog`、`store`（持久化）、`http`（网络请求）
- **播放器**：基于 `rodio` 封装，通过 `crossbeam-channel` + `rayon` 实现异步播放控制

### 三窗口 Capabilities

| 文件                 | 窗口          | 权限范围                     |
| -------------------- | ------------- | ---------------------------- |
| `default.json`       | main          | 核心 API + 文件系统 + 剪贴板 |
| `desktop-lyric.json` | desktop-lyric | 歌词显示 + 窗口控制          |
| `mini-player.json`   | mini-player   | 播放控制 + 窗口控制          |

## 依赖版本

### 前端依赖（package.json）

#### 运行时依赖（dependencies）

| 包名                                 | 版本    |
| ------------------------------------ | ------- |
| @tauri-apps/api                      | ^2.11.1 |
| @tauri-apps/plugin-autostart         | ^2.5.1  |
| @tauri-apps/plugin-clipboard-manager | ^2.3.2  |
| @tauri-apps/plugin-dialog            | ^2.7.1  |
| @tauri-apps/plugin-global-shortcut   | ^2.3.2  |
| @vueuse/components                   | ^14.3.0 |
| @vueuse/core                         | ^14.3.0 |
| clsx                                 | ^2.1.1  |
| pinia                                | ^3.0.4  |
| pinia-plugin-persistedstate          | ^4.7.1  |
| qrcode.vue                           | ^3.10.0 |
| tailwind-merge                       | ^3.6.0  |
| vue                                  | ^3.5.39 |
| vue-router                           | ^5.1.0  |

### 后端依赖（Cargo.toml）

#### 桌面平台依赖（target = non-mobile）

| Crate                        | 版本 | features |
| ---------------------------- | ---- | -------- |
| tauri-plugin-autostart       | 2    | -        |
| tauri-plugin-global-shortcut | 2    | -        |
| tauri-plugin-single-instance | 2    | -        |

#### 运行时依赖（dependencies）

| Crate                          | 版本 | features                    |
| ------------------------------ | ---- | --------------------------- |
| tauri                          | 2    | tray-icon, protocol-asset   |
| tauri-plugin-dialog            | 2    | -                           |
| tauri-plugin-store             | 2    | -                           |
| tauri-plugin-clipboard-manager | 2    | -                           |
| tauri-plugin-http              | 2    | cookies, gzip, json, stream |
| aes                            | 0.8  | -                           |
| base64                         | 0.22 | -                           |
| cbc                            | 0.1  | block-padding, alloc        |
| hex                            | 0.4  | -                           |
| md-5                           | 0.11 | -                           |
| rsa                            | 0.9  | hazmat                      |
| sha1                           | 0.11 | -                           |
| uuid                           | 1.23 | v4                          |
| rayon                          | 1.11 | -                           |
| tokio                          | 1.51 | -                           |
| tokio-stream                   | 0.1  | -                           |
| flate2                         | 1.1  | -                           |
| lofty                          | 0.24 | -                           |
| rodio                          | 0.22 | -                           |
| rand                           | 0.10 | -                           |
| semver                         | 1    | -                           |
| serde                          | 1.0  | -                           |
| serde_json                     | 1.0  | -                           |
| anyhow                         | 1.0  | -                           |
| thiserror                      | 2.0  | -                           |
| bytes                          | 1.11 | -                           |
| chrono                         | 0.4  | -                           |

#### 开发依赖（dev-dependencies）

| Crate    | 版本 |
| -------- | ---- |
| tempfile | 3    |
