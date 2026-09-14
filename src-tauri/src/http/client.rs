use serde::Deserialize;
use serde_json::{Map, Value};
use std::{
  collections::HashMap,
  str::FromStr,
  sync::{Arc, LazyLock, OnceLock},
};
use tauri_plugin_http::reqwest::{
  cookie::{CookieStore, Jar},
  header::{HeaderMap, HeaderName, HeaderValue},
  Client, Method, Response, Url,
};

use crate::http::libs::{KgCookies, BASE_URL, DOMAIN};

/// HTTP 客户端实例
static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();
/// Cookie jar
static COOKIE_JAR: LazyLock<Arc<Jar>> = LazyLock::new(|| Arc::new(Jar::default()));

#[derive(Debug, Default)]
pub struct HttpRequestOptions {
  url: String,
  method: Method,
  header: HeaderMap,
  params: Map<String, Value>,
  data: Value,
}

impl HttpRequestOptions {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn url(mut self, url: impl Into<String>) -> Self {
    self.url = url.into();
    self
  }

  pub fn method(mut self, method: Method) -> Self {
    self.method = method;
    self
  }

  pub fn header(mut self, header: HeaderMap) -> Self {
    self.header = header;
    self
  }

  #[allow(dead_code)]
  pub fn add_header(mut self, key: impl AsRef<str>, value: impl AsRef<str>) -> Self {
    let Ok(name) = HeaderName::from_bytes(key.as_ref().as_bytes()) else {
      return self;
    };

    let Ok(value) = HeaderValue::from_str(value.as_ref()) else {
      return self;
    };

    self.header.insert(name, value);
    self
  }

  pub fn params(mut self, params: Map<String, Value>) -> Self {
    self.params = params;
    self
  }

  #[allow(dead_code)]
  pub fn add_param(mut self, key: impl Into<String>, value: Value) -> Self {
    self.params.insert(key.into(), value);
    self
  }

  pub fn data(mut self, data: Value) -> Self {
    self.data = data;
    self
  }
}

pub struct HttpRequest;

impl HttpRequest {
  fn client() -> &'static Client {
    HTTP_CLIENT.get_or_init(|| {
      let cookie_jar = COOKIE_JAR.clone();

      Client::builder()
        .cookie_provider(cookie_jar)
        .gzip(true)
        .build()
        .unwrap_or_default()
    })
  }

  pub async fn request(opts: HttpRequestOptions) -> anyhow::Result<Response> {
    let mut request_builder = Self::client().request(opts.method, &opts.url);

    if !opts.header.is_empty() {
      request_builder = request_builder.headers(opts.header);
    }
    if !opts.params.is_empty() {
      request_builder = request_builder.query(&opts.params);
    }
    if !opts.data.is_null() {
      request_builder = match opts.data {
        Value::String(s) => request_builder.body(s),
        Value::Object(_) => request_builder.json(&opts.data),
        _ => request_builder.body(opts.data.to_string()),
      }
    }

    let response = request_builder.send().await?;

    Ok(response)
  }

  pub async fn get(url: String) -> anyhow::Result<Response> {
    let resp = Self::client().get(url).send().await?;

    Ok(resp)
  }

  pub async fn get_json<T>(url: String) -> anyhow::Result<T>
  where
    T: for<'de> Deserialize<'de>,
  {
    let resp = Self::client().get(url).send().await?;
    let res_json = resp.json::<T>().await?;

    Ok(res_json)
  }

  #[allow(dead_code)]
  pub fn get_cookies(url: &str) -> Option<HeaderValue> {
    let url = url
      .parse::<Url>()
      .unwrap_or_else(|_| Url::from_str(BASE_URL).unwrap());

    COOKIE_JAR.cookies(&url)
  }
  #[allow(dead_code)]
  pub fn add_cookie(url: &str, key: &str, value: &str) {
    let url = url
      .parse::<Url>()
      .unwrap_or_else(|_| Url::from_str(BASE_URL).unwrap());

    let cookie_str = format!("{key}={value}; Path=/; Domain={DOMAIN}");
    COOKIE_JAR.add_cookie_str(&cookie_str, &url);
  }

  pub fn set_cookies(url: &str, cookies: HashMap<String, String>) {
    let url = url
      .parse::<Url>()
      .unwrap_or_else(|_| Url::from_str(BASE_URL).unwrap());

    for (key, value) in cookies {
      let cookie_str = format!("{key}={value}; Path=/; Domain={DOMAIN}");
      COOKIE_JAR.add_cookie_str(&cookie_str, &url);
    }
  }

  pub fn clear_cookies(url: &str) {
    let url = url
      .parse::<Url>()
      .unwrap_or_else(|_| Url::from_str(BASE_URL).unwrap());

    let default_cookies = KgCookies::default();
    for (key, value) in default_cookies.to_hashmap() {
      let cookie_str = format!("{key}={value}; Path=/; Domain={DOMAIN}");
      COOKIE_JAR.add_cookie_str(&cookie_str, &url);
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::{json, Map, Value};
  use std::collections::HashMap;

  // === HttpRequestOptions 默认值 ===

  #[test]
  fn test_http_request_options_defaults() {
    let opts = HttpRequestOptions::default();
    assert_eq!(opts.url, "");
    assert_eq!(opts.method.as_str(), "GET");
    assert!(opts.header.is_empty());
    assert!(opts.params.is_empty());
    assert!(opts.data.is_null());
  }

  #[test]
  fn test_http_request_options_new_same_as_default() {
    let a = HttpRequestOptions::new();
    let b = HttpRequestOptions::default();
    assert_eq!(a.url, b.url);
    assert_eq!(a.method, b.method);
  }

  // === HttpRequestOptions builders ===

  #[test]
  fn test_http_request_options_url_builder() {
    let opts = HttpRequestOptions::new().url("https://example.com/path");
    assert_eq!(opts.url, "https://example.com/path");
  }

  #[test]
  fn test_http_request_options_url_builder_into_string() {
    // 接受实现 Into<String> 的任意类型
    let url: String = String::from("https://u.org");
    let opts = HttpRequestOptions::new().url(url);
    assert_eq!(opts.url, "https://u.org");
  }

  #[test]
  fn test_http_request_options_method_builder() {
    let opts = HttpRequestOptions::new().method(Method::POST);
    assert_eq!(opts.method.as_str(), "POST");
    let opts = HttpRequestOptions::new().method(Method::PUT);
    assert_eq!(opts.method.as_str(), "PUT");
    let opts = HttpRequestOptions::new().method(Method::PATCH);
    assert_eq!(opts.method.as_str(), "PATCH");
  }

  #[test]
  fn test_http_request_options_add_header_valid() {
    let opts = HttpRequestOptions::new()
      .add_header("X-Key", "val")
      .add_header("Accept-Language", "zh-CN");
    assert_eq!(opts.header.len(), 2);
    assert_eq!(opts.header.get("X-Key").unwrap(), "val");
    assert_eq!(opts.header.get("Accept-Language").unwrap(), "zh-CN");
  }

  #[test]
  fn test_http_request_options_add_header_invalid_name_skipped() {
    // HeaderName::from_bytes 对含空格字符的名称返回 Err
    let opts = HttpRequestOptions::new().add_header("Illegal Name", "v");
    assert!(opts.header.is_empty());
  }

  #[test]
  fn test_http_request_options_add_header_invalid_value_skipped() {
    // HeaderValue::from_str 对含控制字符（如 \r）返回 Err
    let opts = HttpRequestOptions::new().add_header("X", "\r\nbreak");
    assert!(opts.header.is_empty());
  }

  #[test]
  fn test_http_request_options_add_header_override_same_key() {
    let opts = HttpRequestOptions::new()
      .add_header("X-Num", "1")
      .add_header("X-Num", "2");
    assert_eq!(opts.header.len(), 1);
    assert_eq!(opts.header.get("X-Num").unwrap(), "2");
  }

  #[test]
  fn test_http_request_options_header_setter_replaces() {
    let mut first = HeaderMap::new();
    first.insert("A", HeaderValue::from_static("1"));
    let mut second = HeaderMap::new();
    second.insert("B", HeaderValue::from_static("2"));

    let opts = HttpRequestOptions::new().header(first).header(second);
    assert!(opts.header.contains_key("B"));
    assert!(!opts.header.contains_key("A"));
  }

  #[test]
  fn test_http_request_options_add_param_inserts() {
    let opts = HttpRequestOptions::new()
      .add_param("k", json!("v"))
      .add_param("n", json!(100));
    assert_eq!(opts.params.len(), 2);
    assert_eq!(opts.params.get("k").unwrap(), &json!("v"));
    assert_eq!(opts.params.get("n").unwrap(), &json!(100));
  }

  #[test]
  fn test_http_request_options_add_param_override_same_key() {
    let opts = HttpRequestOptions::new()
      .add_param("x", json!("old"))
      .add_param("x", json!("new"));
    assert_eq!(opts.params.len(), 1);
    assert_eq!(opts.params.get("x").unwrap(), &json!("new"));
  }

  #[test]
  fn test_http_request_options_params_setter_replaces() {
    let mut m1 = Map::new();
    m1.insert("a".into(), json!(1));
    let mut m2 = Map::new();
    m2.insert("b".into(), json!(2));

    let opts = HttpRequestOptions::new().params(m1).params(m2);
    assert_eq!(opts.params.len(), 1);
    assert_eq!(opts.params.get("b").unwrap(), &json!(2));
  }

  #[test]
  fn test_http_request_options_data_builder_string() {
    let opts = HttpRequestOptions::new().data(Value::String("body".into()));
    assert!(opts.data.is_string());
    assert_eq!(opts.data.as_str(), Some("body"));
  }

  #[test]
  fn test_http_request_options_data_builder_object() {
    let opts = HttpRequestOptions::new().data(json!({"k":"v"}));
    assert!(opts.data.is_object());
    assert_eq!(opts.data["k"], json!("v"));
  }

  #[test]
  fn test_http_request_options_data_builder_null() {
    let opts = HttpRequestOptions::new().data(Value::Null);
    assert!(opts.data.is_null());
  }

  #[test]
  fn test_http_request_options_builder_chaining() {
    let mut hdrs = HeaderMap::new();
    hdrs.insert("Authorization", HeaderValue::from_static("Bearer x"));

    let opts = HttpRequestOptions::new()
      .url("https://api.example.com/v1")
      .method(Method::POST)
      .header(hdrs)
      .add_header("X", "1")
      .add_param("p", json!(1))
      .data(json!({"body": true}));

    assert_eq!(opts.url, "https://api.example.com/v1");
    assert_eq!(opts.method.as_str(), "POST");
    assert_eq!(opts.header.len(), 2); // Authorization + X
    assert_eq!(opts.header.get("X").unwrap(), "1");
    assert_eq!(opts.params.len(), 1);
    assert!(opts.data["body"].as_bool().unwrap());
  }

  #[test]
  fn test_http_request_options_debug_format() {
    let s = format!("{:?}", HttpRequestOptions::new());
    assert!(s.contains("HttpRequestOptions"));
  }

  // === KgCookies::to_hashmap 与 set_cookies 输入参数格式兼容 ===

  #[test]
  fn test_set_cookies_hashmap_compatible() {
    // 用一个 HashMap 表示 set_cookies 的入参结构；这里只验证不会 panics（不触发真实网络）
    let mut m: HashMap<String, String> = HashMap::new();
    m.insert("dfid".into(), "A".into());
    m.insert("token".into(), "T".into());
    // 调用不会 panic（内部 COOKIE_JAR 内部可处理）
    HttpRequest::set_cookies(BASE_URL, m);
  }

  #[test]
  fn test_add_cookie_invalid_url_falls_back_to_base() {
    // 非法 URL 不会 panic，应回退到 BASE_URL
    HttpRequest::add_cookie("not a valid url", "k", "v");
  }

  #[test]
  fn test_set_cookies_invalid_url_falls_back_to_base() {
    HttpRequest::set_cookies("xxx::invalid", HashMap::new());
  }

  #[test]
  fn test_get_cookies_invalid_url_falls_back_to_base() {
    // 非法 URL 不会 panic
    let _ = HttpRequest::get_cookies("ftp://bad url");
  }

  #[test]
  fn test_clear_cookies_invalid_url_falls_back_to_base() {
    HttpRequest::clear_cookies("not_url");
  }
}
