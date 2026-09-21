//! 图片代理：通过后端获取 CDN 图片（解决 WebView 跨域/Referer 限制）

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use tauri_plugin_http::reqwest::header::{HeaderMap, HeaderName, HeaderValue};

use crate::http::{
  client::HttpRequest,
  config::HttpConfig,
  libs::DOMAIN,
};

/// 前端调用的 fetch_image 命令
#[tauri::command]
pub async fn fetch_image(url: String) -> Result<ImageData, String> {
  let header = build_cdn_header();

  let response = HttpRequest::request(
    tauri_plugin_http::reqwest::Request::get(&url)
      .headers(header)
      .build()
      .map_err(|e| format!("Invalid URL: {}", e))?,
  )
  .await
  .map_err(|e| format!("Fetch failed: {}", e))?;

  let bytes = response.bytes().await.map_err(|e| format!("Read bytes failed: {}", e))?;

  // 检测 content-type
  let content_type = response
    .headers()
    .get("content-type")
    .and_then(|v| v.to_str().ok())
    .unwrap_or("image/jpeg");

  let data_url = format!(
    "data:{contentType};base64,{encoded}",
    contentType = content_type,
    encoded = STANDARD.encode(&bytes)
  );

  Ok(ImageData { url: data_url })
}

/// 构建 CDN 请求头
fn build_cdn_header() -> HeaderMap {
  let kg_config = HttpConfig::get_kg_dynamic_config();

  let mut header = HeaderMap::new();
  header.insert("Referer", HeaderValue::from_str(&format!("https://www.kugou.com/")).unwrap());
  header.insert(
    "User-Agent",
    HeaderValue::from_static("Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi"),
  );

  // 尝试设置 cookie
  let cookies = kg_config.kg.lite.cookies.to_hashmap();
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
