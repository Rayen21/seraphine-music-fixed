use chrono::Utc;
use serde::{de::DeserializeOwned, Serialize};
use serde_json::{json, Map, Value};
use std::fmt::Debug;
use tauri_plugin_http::reqwest::{
  header::{HeaderMap, HeaderName, HeaderValue},
  Method,
};

use crate::{
  http::{
    client::{HttpRequest, HttpRequestOptions},
    config::HttpConfig,
    libs::BASE_URL,
  },
  utils::helper::{sign_key, sign_params_android, sign_params_register, sign_params_web},
};

#[derive(Debug, Clone, Copy)]
pub enum ResponseType {
  Json,
  #[allow(dead_code)]
  Text,
  Bytes,
}

#[derive(Debug, Clone, Copy)]
pub enum EncryptType {
  Web,
  Android,
  #[allow(dead_code)]
  Register,
}

#[derive(Debug)]
pub struct RequestOptions {
  base_url: String,            // 基础URL
  url: String,                 // 请求URL
  method: Method,              // 请求方法, 默认 GET
  header: HeaderMap,           // 请求头
  params: Map<String, Value>,  // 请求参数, 拼接到URL上
  data: Value,                 // 请求体, 放到body中
  response_type: ResponseType, // 响应类型, 默认 Json, !!禁止在 request 中修改
  should_clear_params: bool,   // 是否清除默认参数, 默认 false
  should_signature: bool,      // 是否进行签名, 默认 true
  should_encrypt: bool,        // 是否进行 key 加密, 默认 false
  encrypt_type: EncryptType,   // 加密类型, 默认 Android
}

impl Default for RequestOptions {
  fn default() -> Self {
    Self {
      base_url: String::from(BASE_URL),
      url: String::new(),
      method: Method::GET,
      header: HeaderMap::new(),
      params: Map::new(),
      data: Value::default(),
      response_type: ResponseType::Json,

      should_clear_params: false,
      should_signature: true,
      should_encrypt: false,
      encrypt_type: EncryptType::Android,
    }
  }
}

impl RequestOptions {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn base_url(mut self, base_url: impl Into<String>) -> Self {
    self.base_url = base_url.into();
    self
  }

  pub fn url(mut self, url: impl Into<String>) -> Self {
    self.url = url.into();
    self
  }

  pub fn method(mut self, method: Method) -> Self {
    self.method = method;
    self
  }

  #[allow(dead_code)]
  pub fn header(mut self, header: HeaderMap) -> Self {
    self.header = header;
    self
  }

  pub fn add_header(mut self, key: impl AsRef<str>, value: impl AsRef<str>) -> Self {
    let Ok(name) = HeaderName::from_bytes(key.as_ref().as_bytes()) else {
      return self;
    };

    let Ok(value) = HeaderValue::from_bytes(value.as_ref().as_bytes()) else {
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

  pub fn response_type(mut self, response_type: ResponseType) -> Self {
    self.response_type = response_type;
    self
  }

  pub fn should_clear_params(mut self, should_clear: bool) -> Self {
    self.should_clear_params = should_clear;
    self
  }

  #[allow(dead_code)]
  pub fn should_signature(mut self, should_sign: bool) -> Self {
    self.should_signature = should_sign;
    self
  }

  pub fn should_encrypt(mut self, should_encrypt: bool) -> Self {
    self.should_encrypt = should_encrypt;
    self
  }

  pub fn encrypt_type(mut self, encrypt_type: EncryptType) -> Self {
    self.encrypt_type = encrypt_type;
    self
  }
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum Response<T>
where
  T: Serialize + DeserializeOwned,
{
  Json(T),
  Text(String),
  Bytes(Vec<u8>),
}

pub async fn request<T>(opts: RequestOptions) -> anyhow::Result<Response<T>>
where
  T: Serialize + DeserializeOwned,
{
  let kg_dynamic_config = HttpConfig::get_kg_dynamic_config();
  let kg_static_config = HttpConfig::get_kg_static_config();

  let appid = kg_static_config.appid;
  let client_ver = kg_static_config.client_ver;

  let dfid = kg_dynamic_config.cookies.dfid;
  let userid = kg_dynamic_config.cookies.userid;
  let token = kg_dynamic_config.cookies.token;
  let mid = kg_dynamic_config.mid;
  let uuid = "-";

  let client_time = Utc::now().timestamp();

  // 构建 url
  let mut url = format!("{}{}", opts.base_url, opts.url);

  // 构建请求头
  let mut header = HeaderMap::from_iter([
    (
      HeaderName::from_static("dfid"),
      HeaderValue::from_str(&dfid)?,
    ),
    (
      HeaderName::from_static("clienttime"),
      HeaderValue::from_str(&client_time.to_string())?,
    ),
    (HeaderName::from_static("mid"), HeaderValue::from_str(&mid)?),
    (
      HeaderName::from_static("kg-rc"),
      HeaderValue::from_static("1"),
    ),
    (
      HeaderName::from_static("kg-thash"),
      HeaderValue::from_static("5d816a0"),
    ),
    (
      HeaderName::from_static("kg-rec"),
      HeaderValue::from_static("1"),
    ),
    (
      HeaderName::from_static("kg-rf"),
      HeaderValue::from_static("B9EDA08A64250DEFFBCADDEE00F8F25F"),
    ),
    (
      HeaderName::from_static("user-agent"),
      HeaderValue::from_static("Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi"),
    ),
  ]);

  header.extend(opts.header);

  // 构建请求参数
  let mut params = if opts.should_clear_params {
    opts.params
  } else {
    let params = json!({
      "dfid": dfid,
      "mid": mid,
      "uuid": uuid,
      "appid": appid,
      "clientver": client_ver,
      "clienttime": client_time,
    });

    let Value::Object(mut default_params) = params else { unreachable!() };

    if token != "" {
      default_params.insert(String::from("token"), json!(token));
    }

    if userid != 0 {
      default_params.insert(String::from("userid"), json!(userid));
    }

    default_params.extend(opts.params);

    default_params
  };

  // 添加 key 字段
  if opts.should_encrypt {
    let hash = params.get("hash").map_or(String::from(""), |v| match v {
      Value::String(v) => v.to_owned(),
      _ => v.to_string(),
    });
    let mid = params.get("mid").map_or(String::from(""), |v| match v {
      Value::String(v) => v.to_owned(),
      _ => v.to_string(),
    });
    let userid = params.get("userid").map_or(String::from("0"), |v| match v {
      Value::String(v) => v.to_owned(),
      _ => v.to_string(),
    });
    let appid = params.get("appid").map_or(appid.to_string(), |v| match v {
      Value::String(v) => v.to_owned(),
      _ => v.to_string(),
    });

    let key = sign_key(&hash, &mid, Some(&userid), Some(&appid));
    params.insert(String::from("key"), json!(key));
  }

  // 添加 signature 字段
  if opts.should_signature && params.get("signature").is_none() {
    let signature = match opts.encrypt_type {
      EncryptType::Web => sign_params_web(&params),
      EncryptType::Android => sign_params_android(&params, Some(&opts.data)),
      EncryptType::Register => sign_params_register(&params),
    };

    params.insert(String::from("signature"), json!(signature));
  }

  // TODO: 不清楚为什么手动拼接
  if opts.base_url.contains("openapicdn") {
    let params_str = params
      .iter()
      .map(|(k, v)| format!("{}={}", k, v))
      .collect::<Vec<_>>()
      .join("&");

    url = format!("{}?{}", &url, params_str);
    params.clear();
  }

  let http_opts = HttpRequestOptions::new()
    .url(url)
    .method(opts.method)
    .header(header)
    .params(params)
    .data(opts.data);

  let http_response = HttpRequest::request(http_opts).await?;

  let response = match opts.response_type {
    ResponseType::Json => {
      // 使用 reqwest 的 json 方法解析的报错太笼统了
      let bytes = http_response.bytes().await?;
      let json = serde_json::from_slice::<T>(&bytes)?;

      Response::Json(json)
    }
    ResponseType::Text => {
      let text = http_response.text().await?;

      dbg!(&text);

      Response::Text(text)
    }
    ResponseType::Bytes => {
      let bytes = http_response.bytes().await?;

      Response::Bytes(bytes.to_vec())
    }
  };

  Ok(response)
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::{json, Map, Value};
  use tauri_plugin_http::reqwest::{
    header::{HeaderMap, HeaderValue},
    Method,
  };

  // === BASE_URL ===

  #[test]
  fn test_base_url_is_kugou_gateway() {
    assert_eq!(BASE_URL, "https://gateway.kugou.com");
  }

  // === ResponseType / EncryptType Debug ===

  #[test]
  fn test_response_type_debug_contains_name() {
    assert!(format!("{:?}", ResponseType::Json).contains("Json"));
    assert!(format!("{:?}", ResponseType::Text).contains("Text"));
    assert!(format!("{:?}", ResponseType::Bytes).contains("Bytes"));
  }

  #[test]
  fn test_encrypt_type_debug_contains_name() {
    assert!(format!("{:?}", EncryptType::Web).contains("Web"));
    assert!(format!("{:?}", EncryptType::Android).contains("Android"));
    assert!(format!("{:?}", EncryptType::Register).contains("Register"));
  }

  // === RequestOptions 默认值 ===

  #[test]
  fn test_request_options_defaults() {
    let opts = RequestOptions::default();
    assert_eq!(opts.base_url, BASE_URL);
    assert_eq!(opts.url, "");
    assert_eq!(opts.method.as_str(), "GET");
    assert!(opts.header.is_empty());
    assert!(opts.params.is_empty());
    assert!(opts.data.is_null());
    assert!(matches!(opts.response_type, ResponseType::Json));
    assert!(!opts.should_clear_params);
    assert!(opts.should_signature);
    assert!(!opts.should_encrypt);
    assert!(matches!(opts.encrypt_type, EncryptType::Android));
  }

  #[test]
  fn test_request_options_new_same_as_default() {
    let a = RequestOptions::new();
    let b = RequestOptions::default();
    assert_eq!(a.base_url, b.base_url);
    assert_eq!(a.url, b.url);
    assert_eq!(a.method, b.method);
    assert_eq!(a.should_signature, b.should_signature);
  }

  // === RequestOptions builders ===

  #[test]
  fn test_request_options_base_url_builder() {
    let opts = RequestOptions::new().base_url("https://example.com");
    assert_eq!(opts.base_url, "https://example.com");
  }

  #[test]
  fn test_request_options_url_builder() {
    let opts = RequestOptions::new().url("/v1/search");
    assert_eq!(opts.url, "/v1/search");
  }

  #[test]
  fn test_request_options_method_builder() {
    let opts = RequestOptions::new().method(Method::POST);
    assert_eq!(opts.method.as_str(), "POST");
    let opts = RequestOptions::new().method(Method::DELETE);
    assert_eq!(opts.method.as_str(), "DELETE");
  }

  #[test]
  fn test_request_options_add_header_valid() {
    let opts = RequestOptions::new()
      .add_header("X-Custom", "abc")
      .add_header("Accept", "application/json");
    assert_eq!(opts.header.len(), 2);
    assert_eq!(opts.header.get("X-Custom").unwrap(), "abc");
    assert_eq!(opts.header.get("Accept").unwrap(), "application/json");
  }

  #[test]
  fn test_request_options_add_header_invalid_name_is_ignored() {
    // HeaderName 不允许空格等字符，非法名称应被忽略
    let opts = RequestOptions::new().add_header("bad name with space", "val");
    assert!(opts.header.is_empty());
  }

  #[test]
  fn test_request_options_add_header_invalid_value_is_ignored() {
    // HeaderValue 不允许包含 \n 控制字符
    let opts = RequestOptions::new().add_header("X", "bad\nvalue");
    assert!(opts.header.is_empty());
  }

  #[test]
  fn test_request_options_header_replace_same_key() {
    let opts = RequestOptions::new()
      .add_header("X-One", "a")
      .add_header("X-One", "b");
    assert_eq!(opts.header.get("X-One").unwrap(), "b");
    assert_eq!(opts.header.len(), 1);
  }

  #[test]
  fn test_request_options_header_setter_overrides() {
    let a = HeaderMap::new();
    let mut b = HeaderMap::new();
    b.insert("X-Other", HeaderValue::from_static("v"));
    let opts = RequestOptions::new().header(a).header(b);
    assert!(opts.header.contains_key("X-Other"));
    assert!(!opts.header.contains_key("X-Empty"));
  }

  #[test]
  fn test_request_options_add_param_inserts() {
    let opts = RequestOptions::new()
      .add_param("k1", json!("v1"))
      .add_param("k2", json!(42));
    assert_eq!(opts.params.len(), 2);
    assert_eq!(opts.params.get("k1").unwrap(), &json!("v1"));
    assert_eq!(opts.params.get("k2").unwrap(), &json!(42));
  }

  #[test]
  fn test_request_options_add_param_overrides_same_key() {
    let opts = RequestOptions::new()
      .add_param("x", json!("old"))
      .add_param("x", json!("new"));
    assert_eq!(opts.params.len(), 1);
    assert_eq!(opts.params.get("x").unwrap(), &json!("new"));
  }

  #[test]
  fn test_request_options_params_setter_overrides() {
    let mut m1 = Map::new();
    m1.insert("a".into(), json!(1));
    let mut m2 = Map::new();
    m2.insert("b".into(), json!(2));
    let opts = RequestOptions::new().params(m1).params(m2);
    assert_eq!(opts.params.len(), 1);
    assert_eq!(opts.params.get("b").unwrap(), &json!(2));
  }

  #[test]
  fn test_request_options_data_builder_string() {
    let opts = RequestOptions::new().data(Value::String("body".into()));
    assert!(opts.data.is_string());
    assert_eq!(opts.data.as_str(), Some("body"));
  }

  #[test]
  fn test_request_options_data_builder_object() {
    let opts = RequestOptions::new().data(json!({"k":"v"}));
    assert!(opts.data.is_object());
    assert_eq!(opts.data["k"], json!("v"));
  }

  #[test]
  fn test_request_options_data_builder_null() {
    let opts = RequestOptions::new().data(Value::Null);
    assert!(opts.data.is_null());
  }

  #[test]
  fn test_request_options_response_type_all_variants() {
    for rt in [ResponseType::Json, ResponseType::Text, ResponseType::Bytes] {
      let opts = RequestOptions::new().response_type(rt);
      match opts.response_type {
        ResponseType::Json => assert!(matches!(rt, ResponseType::Json)),
        ResponseType::Text => assert!(matches!(rt, ResponseType::Text)),
        ResponseType::Bytes => assert!(matches!(rt, ResponseType::Bytes)),
      }
    }
  }

  #[test]
  fn test_request_options_flags_builders() {
    let opts = RequestOptions::new()
      .should_clear_params(true)
      .should_signature(false)
      .should_encrypt(true);
    assert!(opts.should_clear_params);
    assert!(!opts.should_signature);
    assert!(opts.should_encrypt);
  }

  #[test]
  fn test_request_options_encrypt_type_all_variants() {
    assert!(matches!(
      RequestOptions::new()
        .encrypt_type(EncryptType::Web)
        .encrypt_type,
      EncryptType::Web
    ));
    assert!(matches!(
      RequestOptions::new()
        .encrypt_type(EncryptType::Android)
        .encrypt_type,
      EncryptType::Android
    ));
    assert!(matches!(
      RequestOptions::new()
        .encrypt_type(EncryptType::Register)
        .encrypt_type,
      EncryptType::Register
    ));
  }

  #[test]
  fn test_request_options_builder_chaining_order_independent() {
    let a = RequestOptions::new()
      .url("u1")
      .method(Method::POST)
      .add_param("p", json!(1));
    let b = RequestOptions::new()
      .add_param("p", json!(1))
      .method(Method::POST)
      .url("u1");
    assert_eq!(a.url, b.url);
    assert_eq!(a.method, b.method);
    assert_eq!(a.params, b.params);
  }

  #[test]
  fn test_request_options_debug_format() {
    let s = format!("{:?}", RequestOptions::new());
    assert!(s.contains("RequestOptions"));
  }
}
