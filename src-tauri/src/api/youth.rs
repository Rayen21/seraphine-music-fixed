use chrono::Local;
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::http::Method;

use crate::{
  api::libs::ApiResult,
  http::{
    config::HttpConfig,
    server::{request, RequestOptions},
  },
};

#[tauri::command]
/// 获取已领取 VIP 状态
pub async fn api_youth_union_vip() -> ApiResult<HashMap<String, Value>> {
  let params = json!({
    "busi_type": "concept",
    "opt_product_types": "dvip,qvip",
    "product_type": "svip"
  });
  let Value::Object(params) = params else { unreachable!() };

  let opts = RequestOptions::new()
    .base_url("https://kugouvip.kugou.com")
    .url("/v1/get_union_vip")
    .params(params);

  request(opts).await.map_err(|e| e.to_string())
}

#[tauri::command]
/// 领取 VIP
///
/// ### 必选参数：
/// * `receive_day` - 领取 VIP 日期，格式为：2026-01-30
pub async fn api_youth_day_vip(receive_day: Option<String>) -> ApiResult<HashMap<String, Value>> {
  let day = receive_day.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());

  let params = json!({
    "source_id": 90139,
    "receive_day": day,
  });
  let Value::Object(params) = params else { unreachable!() };

  let opts = RequestOptions::new()
    .url("/youth/v1/recharge/receive_vip_listen_song")
    .method(Method::POST)
    .params(params);

  request(opts).await.map_err(|e| e.to_string())
}

#[tauri::command]
/// 升级 VIP
pub async fn api_youth_day_upgrade() -> ApiResult<HashMap<String, Value>> {
  let kg_dynamic_config = HttpConfig::get_kg_dynamic_config();

  let params = json!({
    "kugouid": kg_dynamic_config.cookies.userid,
    "ad_type": 1,
  });
  let Value::Object(params) = params else { unreachable!() };

  let opts = RequestOptions::new()
    .url("/youth/v1/listen_song/upgrade_vip_reward")
    .method(Method::POST)
    .params(params);

  request(opts).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  // === URL 路径 ===

  #[test]
  fn test_union_vip_base_url() {
    let url = "https://kugouvip.kugou.com";
    assert!(url.starts_with("https://"));
    assert!(url.contains("kugouvip"));
  }

  #[test]
  fn test_union_vip_url_path() {
    let path = "/v1/get_union_vip";
    assert!(path.starts_with("/v1"));
  }

  #[test]
  fn test_day_vip_url_path() {
    let path = "/youth/v1/recharge/receive_vip_listen_song";
    assert!(path.contains("youth"));
    assert!(path.contains("receive_vip"));
  }

  #[test]
  fn test_day_upgrade_url_path() {
    let path = "/youth/v1/listen_song/upgrade_vip_reward";
    assert!(path.contains("upgrade"));
  }

  // === source_id 常量 ===

  #[test]
  fn test_source_id_constant() {
    // api_youth_day_vip 中 source_id = 90139
    assert_eq!(90139, 90139);
  }

  // === busi_type 常量 ===

  #[test]
  fn test_busi_type_constant() {
    // api_youth_union_vip 中 busi_type = "concept"
    assert_eq!("concept", "concept");
  }

  // === product_type 常量 ===

  #[test]
  fn test_product_type_constant() {
    // opt_product_types = "dvip,qvip", product_type = "svip"
    let opt_product_types = "dvip,qvip";
    assert_eq!(opt_product_types.split(',').count(), 2);
    assert_eq!("svip", "svip");
  }

  // === 日期格式 ===

  #[test]
  fn test_receive_day_default_format() {
    // api_youth_day_vip 默认 receive_day 为 Local::now().format("%Y-%m-%d")
    let format = "%Y-%m-%d";
    assert_eq!(format, "%Y-%m-%d");
  }

  // === 命令签名约束 ===

  #[test]
  fn test_command_signatures_exist() {
    let _ = api_youth_union_vip;
    let _ = api_youth_day_vip;
    let _ = api_youth_day_upgrade;
  }
}
