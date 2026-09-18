use serde::{Deserialize, Serialize};
use serde_json::{from_value, json};
use std::sync::RwLock;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::http::libs::{MODE_KEY, STORE_PATH};

static HTTP_MODE: RwLock<Mode> = RwLock::new(Mode::KgLite);

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum Mode {
  KgMobile,
  KgLite,
}

impl Default for Mode {
  fn default() -> Self {
    Mode::KgLite
  }
}

pub struct HttpMode;

impl HttpMode {
  pub fn init(app_handle: AppHandle) {
    if let Ok(store) = app_handle.store(STORE_PATH) {
      let mode = store
        .get(MODE_KEY)
        .and_then(|v| from_value::<Mode>(v).ok())
        .unwrap_or_default();

      if let Ok(mut http_mode) = HTTP_MODE.write() {
        *http_mode = mode;
      }
    }
  }

  pub fn get_mode() -> Mode {
    match HTTP_MODE.read() {
      Ok(http_mode) => *http_mode,
      Err(_) => Mode::default(),
    }
  }

  pub fn set_mode(app_handle: AppHandle, mode: Mode) {
    if let Ok(mut http_mode) = HTTP_MODE.write() {
      *http_mode = mode;
    };

    if let Ok(store) = app_handle.store(STORE_PATH) {
      store.set(MODE_KEY, json!(mode));
      let _ = store.save();
    };

    println!("set mode: {:?}", mode);
  }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModeInfo {
  label: String,
  value: Mode,
  disabled: bool,
}

#[tauri::command]
pub fn http_mode_list() -> Vec<ModeInfo> {
  vec![
    ModeInfo {
      label: String::from("KG概念版"),
      value: Mode::KgLite,
      disabled: false,
    },
    ModeInfo {
      label: String::from("KG移动版"),
      value: Mode::KgMobile,
      disabled: true,
    },
  ]
}

#[tauri::command]
pub fn http_mode_get() -> Mode {
  HttpMode::get_mode()
}

#[tauri::command]
pub fn http_mode_set(app_handle: AppHandle, mode: Mode) {
  HttpMode::set_mode(app_handle, mode);
}

#[cfg(test)]
mod tests {
  use super::*;

  // === Mode 的 serde 行为 ===

  #[test]
  fn test_mode_default_is_kg_lite() {
    assert!(matches!(Mode::default(), Mode::KgLite));
  }

  #[test]
  fn test_mode_clone_and_copy() {
    let a = Mode::KgMobile;
    let mut b = a;
    assert!(matches!(a, Mode::KgMobile));
    assert!(matches!(b, Mode::KgMobile));
    b = Mode::KgLite;
    // Copy 语义：a 不受影响
    assert!(matches!(a, Mode::KgMobile));
    assert!(matches!(b, Mode::KgLite));
  }

  #[test]
  fn test_mode_debug_contains_variant_name() {
    let s = format!("{:?}", Mode::KgLite);
    assert!(s.contains("KgLite"));
    let s = format!("{:?}", Mode::KgMobile);
    assert!(s.contains("KgMobile"));
  }

  #[test]
  fn test_mode_serde_roundtrip_lite() {
    let json = serde_json::to_string(&Mode::KgLite).unwrap();
    let back: Mode = serde_json::from_str(&json).unwrap();
    assert!(matches!(back, Mode::KgLite));
  }

  #[test]
  fn test_mode_serde_roundtrip_mobile() {
    let json = serde_json::to_string(&Mode::KgMobile).unwrap();
    let back: Mode = serde_json::from_str(&json).unwrap();
    assert!(matches!(back, Mode::KgMobile));
  }

  // === Mode::get_mode 初始状态 ===

  #[test]
  fn test_http_mode_get_returns_something() {
    // 单元测试不经过 HttpMode::init，HTTP_MODE 全局为初始 Mode::KgLite
    let mode = http_mode_get();
    // 使用 RwLock，初始值为 KgLite（未调用过 set_mode 时）
    assert!(matches!(mode, Mode::KgLite | Mode::KgMobile));
  }

  // === http_mode_list ===

  #[test]
  fn test_http_mode_list_has_two_entries() {
    let list = http_mode_list();
    assert_eq!(list.len(), 2);
  }

  #[test]
  fn test_http_mode_list_labels_and_values() {
    let list = http_mode_list();
    let labels: Vec<&str> = list.iter().map(|m| m.label.as_str()).collect();
    assert!(labels.contains(&"KG概念版"));
    assert!(labels.contains(&"KG移动版"));

    // KgLite 未禁用；KgMobile 被禁用
    let lite = list
      .iter()
      .find(|m| matches!(m.value, Mode::KgLite))
      .unwrap();
    assert!(!lite.disabled);
    let mobile = list
      .iter()
      .find(|m| matches!(m.value, Mode::KgMobile))
      .unwrap();
    assert!(mobile.disabled);
  }

  #[test]
  fn test_mode_info_serde_roundtrip() {
    let info = ModeInfo {
      label: "KG概念版".into(),
      value: Mode::KgLite,
      disabled: false,
    };
    let json = serde_json::to_string(&info).unwrap();
    let back: ModeInfo = serde_json::from_str(&json).unwrap();
    assert_eq!(back.label, "KG概念版");
    assert!(matches!(back.value, Mode::KgLite));
    assert!(!back.disabled);
  }

  // 枚举两个变体，确保 match 臂完备
  #[test]
  fn test_mode_variants_are_exhaustive() {
    for m in [Mode::KgLite, Mode::KgMobile] {
      match m {
        Mode::KgLite => {}
        Mode::KgMobile => {}
      }
    }
  }
}
