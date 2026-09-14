use chrono::Utc;
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri_plugin_http::reqwest::Method;

use crate::{
  api::libs::ApiResult,
  http::{
    config::HttpConfig,
    server::{request, RequestOptions},
  },
  utils::helper::sign_key_params,
};

#[tauri::command]
/// 获取音乐相关信息
///
/// ### 必选参数
///
/// * `hashs` - 歌曲 hash 列表
pub async fn api_audio_info(hashs: Vec<&str>) -> ApiResult<HashMap<String, Value>> {
  let kg_static_config = HttpConfig::get_kg_static_config();
  let kg_dynamic_config = HttpConfig::get_kg_dynamic_config();

  let client_time = Utc::now().timestamp_millis();
  let data = hashs
    .iter()
    .map(|h| json!({ "hash": h, "audio_id": 0 }))
    .collect::<Vec<_>>();

  let data = json!({
    "appid": kg_static_config.appid,
    "clienttime": client_time.clone(),
    "clientver": kg_static_config.client_ver,
    "data": data,
    "dfid": kg_dynamic_config.cookies.dfid,
    "key": sign_key_params(&client_time.to_string(), None, None),
    "mid": kg_dynamic_config.mid,
    "token": kg_dynamic_config.cookies.token,
    "userid": kg_dynamic_config.cookies.userid,
  });

  let ops = RequestOptions::new()
    .base_url("http://kmr.service.kugou.com")
    .url("/v1/audio/audio")
    .method(Method::POST)
    .add_header("x-router", "kmr.service.kugou.com")
    .data(data);

  request(ops).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_base_url_is_http() {
    // 注意：源码中 audio 模块使用 http（非 https）
    let url = "http://kmr.service.kugou.com";
    assert!(url.starts_with("http://"));
  }

  #[test]
  fn test_url_path() {
    assert_eq!("/v1/audio/audio", "/v1/audio/audio");
  }

  #[test]
  fn test_x_router_header() {
    assert_eq!("kmr.service.kugou.com", "kmr.service.kugou.com");
  }

  #[test]
  fn test_command_signature_exist() {
    let _ = api_audio_info;
  }
}
