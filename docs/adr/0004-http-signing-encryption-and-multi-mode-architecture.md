# ADR-0004: HTTP 请求签名加密与多终端模式架构

**状态**: 已采纳  
**日期**: 2026-08-01  
**决策者**: @buren_Lee

---

## 背景

项目对接 Kugou Music API，该 API 存在多个终端形态（移动版 App、概念版 Lite、Web 端），各自使用不同的签名算法和静态密钥（padding / RSA 公钥 / appid）。如果在每个 api 模块中各自拼接签名和密钥，会产生严重的代码重复、密钥泄漏风险，以及新增终端模式时的重构困难。

另外，配置的持久化策略需要区分「静态配置」（编译期确定，如 appid / padding）和「动态配置」（运行时变化，如 Cookie / Token），二者的存储方式和生命周期完全不同。

## 决策

### 一、静态 / 动态配置分层

| 类型 | Rust 存储 | 持久化 | 示例 |
|------|-----------|--------|------|
| **静态配置** (`StaticConfig`) | `LazyLock<StaticConfig>` | ❌ 硬编码在二进制（`config.rs` L26-L71） | `appid`, `client_ver`, `params_*_padding`, `rsa_pem`, `wx_appid/secret` |
| **动态配置** (`DynamicConfig`) | `RwLock<DynamicConfig>` | ✅ `tauri_plugin_store::StoreExt` → `config.json` (`STORE_PATH`) | `KgCookies`（每终端独立） |

- **两套终端配置**：静态配置中为 `Mode::KgMobile`（移动版）和 `Mode::KgLite`（概念版，默认）各维护一份完整的 `KgStaticConfig`，通过 `HttpMode::get_mode()` 读取当前终端后返回对应的切片
- **启动初始化顺序强制**：`mode::HttpMode::init` → `config::HttpConfig::init`（lib.rs setup 中可见）。原因：`HttpConfig::init` 读取 cookies 时需先知道 Mode，才能选择 mobile/lite 分支

### 二、四种签名算法

所有请求通过 `RequestOptions.should_signature` 标志控制是否签名，`encrypt_type` 选择算法，统一在 `utils::helper.rs` 中实现：

| 算法 | 适用 EncryptType | 拼接公式 | 典型使用场景 |
|------|------------------|----------|-------------|
| `sign_params` | 默认 (Web/Android 通用) | `sort(key+value)` concat + `data` + `params_padding` → MD5 | 默认请求 |
| `sign_params_web` | EncryptType::Web | `params_web_padding` + `sort(k=v)` concat + `params_web_padding` → MD5 | Web 模式登录 / 部分开放接口 |
| `sign_params_android` | EncryptType::Android | `params_android_padding` + `sort(k=v)` concat + `data(json)` + `params_android_padding` → MD5 | 移动版 / Lite 版主接口（90% 请求） |
| `sign_params_register` | EncryptType::Register | `params_register_padding` + `sort(value_only)` concat + `params_register_padding` → MD5 | 设备注册 `api_register_dev` |

**排序规则**：所有签名算法统一使用 `sort_unstable()` 对 key/value 对按字典序排序，保证签名可复现。

### 三、Key 加密 (RSA / key padding)

- `RequestOptions.should_encrypt` 开启后，对敏感字段（如手机号 / 密码明文）先使用对应终端的 `key_padding` / `key_cloud_padding` / `key_params_padding` 做 MD5 派生，再用终端 `rsa_pem` 公钥加密后放入请求体
- `STATIC_CONFIG` 中硬编码的 RSA PEM（`config.rs` L35-L40 和 L56-L61）是 Kugou 各终端公开的公钥，**不是本项目私钥**，因此直接写入代码不存在「私钥泄漏」风险，但仍遵守「不在日志 / 错误上报中 dump 完整 STATIC_CONFIG」的约定

### 四、HttpMode 切换

```rust
pub enum Mode { KgMobile, KgLite }
static HTTP_MODE: RwLock<Mode> = RwLock::new(Mode::KgLite); // 默认概念版
```

- 前端 `Aside/HttpMode.vue` 通过 `invoke http_mode_set` 切换，`http_mode_list` 返回列表（当前 KgMobile 标为 disabled，未完全上线）
- 切换后：`RwLock` 更新内存态 → `store.set(MODE_KEY, json!(mode))` → `store.save()` 持久化
- 下次启动时 `HttpMode::init` 从 store 读回

## 考虑的替代方案

| 方案 | 优点 | 缺点 | 为什么没选 |
|------|------|------|------------|
| 所有终端一套签名 (Android 默认) | 代码最省 | 部分接口仅 Web 模式可达，无法切换 | 业务功能受限 |
| 静态密钥放环境变量 / 外部文件 | 避免硬编码 | 桌面端用户无需构建即可运行；环境变量在打包后设置繁琐；且 RSA 公钥本身非敏感 | 徒增部署复杂度，收益为零（公钥） |
| 动态配置放 SQLite | 结构化查询 | cookies/Token 本就是扁平 KV；引入 SQLite 依赖；tauri_plugin_store 已够用 | 杀鸡用牛刀 |
| 签名算法放 TypeScript 前端 | Rust 代码干净 | 密钥暴露在前端 bundle，混淆也易被逆向；前端添加算法依赖包体积膨胀 | 安全 & 性能不匹配 |
| 本方案：双层配置 + 四种签名 + tauri_plugin_store 持久化 | 终端可扩展（新增终端仅需加 Mode 分支 + StaticConfig）、密钥相对安全（Rust 反编译比 JS 难）、启动快速（LazyLock 零成本） | 新增终端模式需补全两套 appid/padding/rsa 配置的同步维护 | — |

## 影响

- **新增**: 新增终端模式（如 `Mode::KgPad`）需同步修改：`mode.rs` enum + `STATIC_CONFIG.kg.pad` + `http_mode_list` 返回项 + `HttpConfig` 读取分支（2 处）+ `DynamicConfig` 结构体字段
- **修改**:
  - 所有 API 调用统一走 `HttpRequest::request(RequestOptions)`，禁止在 `api/*.rs` 里手写 MD5 签名或拼接 padding
  - 新增加密密钥字段时，`KgStaticConfig` / `DynamicConfig` 加字段后必须同步 `Default` 实现和 `from_value` 反序列化（避免旧 config.json 启动崩溃）
- **约束**:
  - **禁止在日志 / notify / 错误信息中 dump `*StaticConfig` 和 `*Cookies` 全对象**，防止崩溃日志泄漏用户 Cookie
  - `setup()` 中 `mode::init` 必须在 `config::init` **之前** 调用，不可调换顺序
  - 敏感字段（手机号 / 密码）必须 `should_encrypt=true`，禁止明文传输
- **风险**:
  - Kugou 官方更换公钥 / padding 时，需发版更新 `STATIC_CONFIG`（硬编码无热更能力）
  - `Mode::KgMobile` 当前 disabled，其 `appid / client_ver` 可能已过期，启用前需验证接口可用性

## 后续

- 若新增 Web 终端模式作为 Mode::Web 第三分支，应提供降级：三端接口返回不一致时的自动 fallback
- 动态配置 Cookie 加密：当前存明文，考虑用 OS 密钥链（tauri-plugin-keychain）对 `KgCookies` 加一层信封加密
- 启动时配置版本号：当 `DynamicConfig` 字段新增 / 改名后，对旧 store 做字段迁移（目前直接 `unwrap_or_default` 跳过）
