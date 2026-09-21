//! 图片代理：通过后端获取 CDN 图片（解决 WebView 跨域/Referer 限制）

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use tauri_plugin_http::reqwest::header::{HeaderMap, HeaderValue};

use crate::http::{
  client::{HttpRequest, HttpRequestOptions},
  config::HttpConfig,
};

use tauri_plugin_http::reqwest::Method;

/// 前端调用的 fetch_image 命令
#[tauri::command]
pub async fn fetch_image(url: String) -> Result<ImageData, String> {
  let header = build_cdn_header();
  let resp = HttpRequest::request(
    HttpRequestOptions::new()
      .url(url)
      .method(Method::GET)
      .header(header)
  )
  .await
  .map_err(|e| format!("Fetch failed: {e}"))?;

  // 先读取 headers（bytes() 会 consume resp），克隆字符串避免借用
  let content_type = resp
    .headers()
    .get("content-type")
    .and_then(|v| v.to_str().ok())
    .map(|s| s.to_owned())
    .unwrap_or_else(|| String::from("image/jpeg"));
  let bytes = resp.bytes().await.map_err(|e| format!("Read bytes failed: {e}"))?;

  let data_url = format!(
    "data:{contentType};base64,{encoded}",
    contentType = content_type,
    encoded = STANDARD.encode(&bytes),
  );

  Ok(ImageData { url: data_url })
}

/// 构建 CDN 请求头
fn build_cdn_header() -> HeaderMap {
  let kg_config = HttpConfig::get_kg_dynamic_config();

  let mut header = HeaderMap::new();
  header.insert("Referer", HeaderValue::from_str("https://www.kugou.com/").unwrap());
  header.insert(
    "User-Agent",
    HeaderValue::from_static("Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi"),
  );

  // 尝试设置 cookie
  let cookies = kg_config.cookies.to_hashmap();
  if !cookies.is_empty() {
    let cookie_str = cookies
      .into_iter()
      .map(|(k, v)| format!("{k}={v}"))
      .collect::<Vec<_>>()
      .join("; ");
    header.insert("Cookie", HeaderValue::from_str(&cookie_str).unwrap());
  }

  header
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageData {
  pub url: String,
}
