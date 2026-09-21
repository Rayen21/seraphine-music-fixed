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
  let header = build_cdn_header(&url);
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

/// 构建 CDN 请求头（适配 Kuwo CDN 的 kw_token 参数）
fn build_cdn_header(url: &str) -> HeaderMap {
  let mut header = HeaderMap::new();

  // 判断是否为 Kuwo CDN 请求（img{1-5}.kuwo.cn）
  let is_kuwo = url.contains("kuwo.cn")
    || url.contains("kuwoimg.com");

  if is_kuwo {
    // Kuwo CDN：提取 kw_token 作为 Cookie
    let kw_token = extract_kw_token(url);
    header.insert("Referer", HeaderValue::from_str("https://music.kuwo.cn/").unwrap());
    header.insert(
      "User-Agent",
      HeaderValue::from_str("Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)").unwrap(),
    );
    if let Some(token) = kw_token {
      header.insert("Cookie", HeaderValue::from_str(&format!("kw_token={token}")).unwrap());
    }
  } else {
    // Kugou CDN：使用 Kugou cookies
    let kg_config = HttpConfig::get_kg_dynamic_config();
    header.insert("Referer", HeaderValue::from_str("https://www.kugou.com/").unwrap());
    header.insert(
      "User-Agent",
      HeaderValue::from_static("Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi"),
    );

    let cookies = kg_config.cookies.to_hashmap();
    if !cookies.is_empty() {
      let cookie_str = cookies
        .into_iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("; ");
      header.insert("Cookie", HeaderValue::from_str(&cookie_str).unwrap());
    }
  }

  header
}

/// 从 Kuwo CDN URL 中提取 kw_token 查询参数
fn extract_kw_token(url: &str) -> Option<String> {
  let query = url.split('?').nth(1)?;
  for param in query.split('&') {
    if let Some((key, value)) = param.split_once('=') {
      if key == "kw_token" {
        return Some(value.to_string());
      }
    }
  }
  None
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageData {
  pub url: String,
}
