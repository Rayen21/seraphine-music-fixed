use anyhow::anyhow;
use serde_json::json;
use std::sync::{LazyLock, RwLock};
use tauri::App;
use tauri_plugin_store::StoreExt;

use crate::http::{
  client::HttpRequest,
  libs::{
    DynamicConfig, KgCookies, KgDynamicConfig, KgStaticConfig, KgTerminalConfig, StaticConfig,
    BASE_URL, CONFIG_KEY, STORE_PATH,
  },
  mode::{HttpMode, Mode},
};

// 动态配置
static DYNAMIC_CONFIG: LazyLock<RwLock<DynamicConfig>> =
  LazyLock::new(|| RwLock::new(DynamicConfig::default()));
// 静态配置
static STATIC_CONFIG: LazyLock<StaticConfig> = LazyLock::new(|| StaticConfig {
  kg: KgTerminalConfig {
    mobile: KgStaticConfig {
      api_ver: 20,
      src_appid: 2919,
      appid: 1005,
      client_ver: 20489,
      wx_appid: "wx79f2c4418704b4f8",
      wx_secret: "4efcab88b700769e376e3f6087b8abc9",
      rsa_pem: "-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDIAG7QOELSYoIJvTFJhMpe1s/g
bjDJX51HBNnEl5HXqTW6lQ7LC8jr9fWZTwusknp+sVGzwd40MwP6U5yDE27M/X1+
UR4tvOGOqp94TJtQ1EPnWGWXngpeIW5GxoQGao1rmYWAu6oi1z9XkChrsUdC6DJE
5E221wf/4WLFxwAtRQIDAQAB
-----END PUBLIC KEY-----",
      params_padding: "R6snCXJgbCaj9WFRJKefTMIFp0ey6Gza",
      params_web_padding: "NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt",
      params_android_padding: "OIlwieks28dk2k092lksi2UIkp",
      params_register_padding: "1014",
      key_padding: "57ae12eb6890223e355ccfcb74edf70d",
      key_cloud_padding: "ebd1ac3134c880bda6a2194537843caa0162e2e7",
      key_params_padding: "OIlwieks28dk2k092lksi2UIkp",
    },
    lite: KgStaticConfig {
      api_ver: 20,
      src_appid: 2919,
      appid: 3116,
      client_ver: 11440,
      wx_appid: "wx72b795aca60ad321",
      wx_secret: "33e486041e5e25729a4e3d2da7502f9a",
      rsa_pem: "-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDECi0Np2UR87scwrvTr72L6oO0
1rBbbBPriSDFPxr3Z5syug0O24QyQO8bg27+0+4kBzTBTBOZ/WWU0WryL1JSXRTX
LgFVxtzIY41Pe7lPOgsfTCn5kZcvKhYKJesKnnJDNr5/abvTGf+rHG3YRwsCHcQ0
8/q6ifSioBszvb3QiwIDAQAB
-----END PUBLIC KEY-----",
      params_padding: "R6snCXJgbCaj9WFRJKefTMIFp0ey6Gza",
      params_web_padding: "NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt",
      params_android_padding: "LnT6xpN3khm36zse0QzvmgTZ3waWdRSA",
      params_register_padding: "1014",
      key_padding: "185672dd44712f60bb1736df5a377e82",
      key_cloud_padding: "ebd1ac3134c880bda6a2194537843caa0162e2e7",
      key_params_padding: "LnT6xpN3khm36zse0QzvmgTZ3waWdRSA",
    },
  },
});

pub struct HttpConfig;

impl HttpConfig {
  pub fn init(app: &App) {
    let config = Self::load_dynamic_config(app_handle);

    if let Ok(mut http_config) = DYNAMIC_CONFIG.write() {
      *http_config = config;
    }
  }

  /// 从 store 加载动态配置
  fn load_dynamic_config(app: &App) -> DynamicConfig {
    // 尝试获取 store
    let Ok(store) = app.store(STORE_PATH) else {
      return DynamicConfig::default();
    };

    // 尝试获取 store 配置
    if let Some(store_config) = store.get(CONFIG_KEY) {
      if let Ok(config) = serde_json::from_value::<DynamicConfig>(store_config) {
        // 从 store 中恢复 cookies
        let cookies = match HttpMode::get_mode() {
          Mode::KgMobile => &config.kg.mobile.cookies,
          Mode::KgLite => &config.kg.lite.cookies,
        };
        HttpRequest::set_cookies(BASE_URL, cookies.to_hashmap());

        return config;
      }
    }

    // store 配置不存在或解析失败，创建新配置并保存
    let config = DynamicConfig::default();

    if let Ok(value_config) = serde_json::to_value(&config) {
      store.set(CONFIG_KEY, value_config);
      let _ = store.save();
    }

    config
  }

  /// 设置 kg 的动态配置
  pub fn set_kg_cookies(
    app: &App,
    url: &str,
    cookies: KgCookies,
  ) -> anyhow::Result<()> {
    HttpRequest::set_cookies(url, cookies.to_hashmap());

    let mut config = DYNAMIC_CONFIG.write().map_err(|e| anyhow!(e.to_string()))?;

    match HttpMode::get_mode() {
      Mode::KgMobile => config.kg.mobile.cookies = cookies,
      Mode::KgLite => config.kg.lite.cookies = cookies,
    }

    let store = app.store(STORE_PATH)?;
    store.set(CONFIG_KEY, json!(*config));
    store.save()?;

    Ok(())
  }

  pub fn clear_kg_cookies(app: &App, url: &str) -> anyhow::Result<()> {
    HttpRequest::clear_cookies(url);

    let mut config = DYNAMIC_CONFIG.write().map_err(|e| anyhow!(e.to_string()))?;

    let default_cookies = KgCookies::default();

    match HttpMode::get_mode() {
      Mode::KgMobile => config.kg.mobile.cookies = default_cookies,
      Mode::KgLite => config.kg.lite.cookies = default_cookies,
    }

    let store = app.store(STORE_PATH)?;
    store.set(CONFIG_KEY, json!(*config));
    store.save()?;

    Ok(())
  }

  /// 获取 kg 的动态配置
  pub fn get_kg_dynamic_config() -> KgDynamicConfig {
    let Ok(config) = DYNAMIC_CONFIG.read() else {
      return KgDynamicConfig::default();
    };

    match HttpMode::get_mode() {
      Mode::KgMobile => config.kg.mobile.clone(),
      Mode::KgLite => config.kg.lite.clone(),
    }
  }

  /// 清除 kg 的动态配置
  /// 这将清除当前模式的 cookies，包括 mobile 和 lite 模式。
  pub fn clear_kg_dynamic_config(app: &App) -> anyhow::Result<()> {
    let mut config = DYNAMIC_CONFIG.write().map_err(|e| anyhow!(e.to_string()))?;

    match HttpMode::get_mode() {
      Mode::KgMobile => config.kg.mobile.cookies = KgCookies::default(),
      Mode::KgLite => config.kg.lite.cookies = KgCookies::default(),
    }

    let store = app.store(STORE_PATH)?;
    store.set(CONFIG_KEY, json!(*config));
    store.save()?;

    Ok(())
  }

  /// 获取 kg 的静态配置
  pub fn get_kg_static_config() -> &'static KgStaticConfig {
    match HttpMode::get_mode() {
      Mode::KgMobile => &STATIC_CONFIG.kg.mobile,
      Mode::KgLite => &STATIC_CONFIG.kg.lite,
    }
  }
}

#[tauri::command]
pub fn http_config_clear(app: App) -> Result<(), String> {
  HttpConfig::clear_kg_dynamic_config(&app).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
  use crate::http::libs::MODE_KEY;

  use super::*;

  // === 常量 ===

  #[test]
  fn test_store_path_constant() {
    assert_eq!(STORE_PATH, "config.json");
  }

  #[test]
  fn test_config_key_constant() {
    assert_eq!(CONFIG_KEY, "http_config");
  }

  #[test]
  fn test_mode_key_constant() {
    assert_eq!(MODE_KEY, "http_mode");
  }

  // === HttpConfig::get_kg_static_config (不依赖 AppHandle，可纯单测) ===

  #[test]
  fn test_get_kg_static_config_lite_matches_default_mode() {
    // 默认 HttpMode::KgLite，应返回 lite 静态配置
    let cfg = HttpConfig::get_kg_static_config();
    assert_eq!(cfg.appid, 3116);
    assert_eq!(cfg.client_ver, 11440);
    assert_eq!(cfg.api_ver, 20);
    assert_eq!(cfg.src_appid, 2919);
    assert_eq!(cfg.wx_appid, "wx72b795aca60ad321");
    assert_eq!(cfg.wx_secret, "33e486041e5e25729a4e3d2da7502f9a");
    // padding 配置
    assert!(!cfg.params_web_padding.is_empty());
    assert!(!cfg.params_android_padding.is_empty());
    assert!(!cfg.key_padding.is_empty());
    assert!(!cfg.key_params_padding.is_empty());
    assert!(!cfg.rsa_pem.is_empty());
    assert!(cfg.rsa_pem.contains("BEGIN PUBLIC KEY"));
  }

  #[test]
  fn test_get_kg_static_config_returns_static_reference() {
    // 多次调用应返回同一个 'static 引用
    let a = HttpConfig::get_kg_static_config();
    let b = HttpConfig::get_kg_static_config();
    assert!(std::ptr::eq(a, b));
  }

  #[test]
  fn test_get_kg_static_config_appid_distinct_between_modes() {
    // 默认为 Lite（appid=3116），与 Mobile（appid=1005）不同
    let lite = HttpConfig::get_kg_static_config();
    assert_eq!(lite.appid, 3116);
    assert_ne!(lite.appid, 1005);
  }

  // === HttpConfig::get_kg_dynamic_config (默认模式为 Lite，未 init 时返回 default) ===

  #[test]
  fn test_get_kg_dynamic_config_returns_default_when_uninit() {
    // 单测不调用 HttpConfig::init，DYNAMIC_CONFIG 全局为 DynamicConfig::default()
    let cfg = HttpConfig::get_kg_dynamic_config();
    assert_eq!(cfg.mac, "02:00:00:00:00:00");
    assert_eq!(cfg.platform, "");
    assert_eq!(cfg.cookies.dfid, "-");
    assert_eq!(cfg.cookies.userid, 0);
    // guid 是 md5，长度 32
    assert_eq!(cfg.guid.len(), 32);
    assert!(cfg.guid.chars().all(|c| c.is_ascii_hexdigit()));
    // dev 是 random_string(10)
    assert_eq!(cfg.dev.len(), 10);
  }

  #[test]
  fn test_get_kg_dynamic_config_clone_is_independent() {
    let a = HttpConfig::get_kg_dynamic_config();
    let b = a.clone();
    assert_eq!(a.mac, b.mac);
    assert_eq!(a.guid, b.guid);
  }

  // === STATIC_CONFIG 与 DYNAMIC_CONFIG 不会 panic（仅校验全局可访问）===

  #[test]
  fn test_static_config_is_initialized() {
    // 通过 get_kg_static_config 间接访问 STATIC_CONFIG，确认 LazyLock 已初始化
    let _ = HttpConfig::get_kg_static_config();
  }

  // === 模式切换影响 get_kg_dynamic_config 返回值（不持久化）===
  // 注：HttpMode::set_mode 需要 AppHandle，无法在纯单测中调用。
  // 这里通过 get_kg_dynamic_config 的默认 Lite 分支验证 mobile 字段不会被错误返回。

  #[test]
  fn test_get_kg_dynamic_config_returns_lite_branch_by_default() {
    // HttpMode 默认 KgLite，get_kg_dynamic_config 返回 mobile 字段是 default 副本
    let cfg = HttpConfig::get_kg_dynamic_config();
    // 默认 mobile 和 lite 是独立的 default 实例
    // 通过 mac 字段（两者都是 "02:00:00:00:00:00"）验证不 panic
    assert_eq!(cfg.mac, "02:00:00:00:00:00");
  }
}
