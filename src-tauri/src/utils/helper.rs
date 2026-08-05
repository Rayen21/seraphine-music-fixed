use serde_json::{Map, Value};

use crate::{http::config::HttpConfig, utils::crypto::encrypt_md5};

/// sign 加密
#[allow(dead_code)]
pub fn sign_params(params: &Map<String, Value>, data: Option<&str>) -> String {
  let padding = HttpConfig::get_kg_static_config().params_padding;

  let mut params_vec: Vec<String> = params
    .iter()
    .map(|(k, v)| match v {
      Value::String(v) => format!("{k}{v}"),
      _ => format!("{k}{}", v.to_string()),
    })
    .collect();
  params_vec.sort_unstable();

  let params_str = params_vec.concat();
  let data = data.unwrap_or("");

  encrypt_md5(format!("{params_str}{data}{padding}"))
}

/// Web版本 signature 加密
pub fn sign_params_web(params: &Map<String, Value>) -> String {
  let padding = HttpConfig::get_kg_static_config().params_web_padding;

  let mut params_vec: Vec<String> = params
    .iter()
    .map(|(k, v)| match v {
      Value::String(v) => format!("{k}={v}"),
      _ => format!("{k}={}", v.to_string()),
    })
    .collect();
  params_vec.sort_unstable();

  let params_str = params_vec.concat();

  encrypt_md5(format!("{padding}{params_str}{padding}"))
}

/// Android版本 signature 加密
pub fn sign_params_android(params: &Map<String, Value>, data: Option<&Value>) -> String {
  let padding = HttpConfig::get_kg_static_config().params_android_padding;

  let mut params_vec: Vec<String> = params
    .iter()
    .map(|(k, v)| match v {
      Value::String(v) => format!("{k}={v}"),
      _ => format!("{k}={}", v.to_string()),
    })
    .collect();
  params_vec.sort_unstable();

  let params_str = params_vec.concat();
  let data_str = match data {
    Some(data) => match data {
      Value::String(s) => s.to_owned(),
      Value::Null => String::new(),
      _ => data.to_string(),
    },
    None => String::new(),
  };

  encrypt_md5(format!("{padding}{params_str}{data_str}{padding}"))
}

/// Register版本 signature 加密
pub fn sign_params_register(params: &Map<String, Value>) -> String {
  let padding = HttpConfig::get_kg_static_config().params_register_padding;

  let mut params_vec: Vec<String> = params
    .iter()
    .map(|(_, v)| match v {
      Value::String(v) => v.to_owned(),
      _ => v.to_string(),
    })
    .collect();
  params_vec.sort_unstable();

  let params_str = params_vec.concat();

  encrypt_md5(format!("{padding}{params_str}{padding}"))
}

/// signKey 加密
pub fn sign_key(hash: &str, mid: &str, userid: Option<&str>, appid: Option<&str>) -> String {
  let kg_params = HttpConfig::get_kg_static_config();
  let padding = kg_params.key_padding;

  let userid = userid.unwrap_or("0");
  let appid = appid.map_or(kg_params.appid.to_string(), |a| a.to_string());

  encrypt_md5(format!("{hash}{padding}{appid}{mid}{userid}"))
}

/// signKey 加密云盘key
#[allow(dead_code)]
pub fn sign_key_cloud(hash: &str, pid: &str) -> String {
  let padding = HttpConfig::get_kg_static_config().key_cloud_padding;

  encrypt_md5(format!("musicclound{hash}{pid}{padding}"))
}

/// signParams 加密
pub fn sign_key_params(data: &str, appid: Option<&str>, client_ver: Option<&str>) -> String {
  let kg_params = HttpConfig::get_kg_static_config();
  let padding = kg_params.key_params_padding;

  let appid = appid.map_or(kg_params.appid.to_string(), |a| a.to_string());
  let client_ver = client_ver.map_or(kg_params.client_ver.to_string(), |c| c.to_string());

  encrypt_md5(format!("{appid}{padding}{client_ver}{data}"))
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  // ==================== sign_params 测试 ====================

  #[test]
  fn test_sign_params_basic() {
    let mut params = Map::new();
    params.insert("key1".to_string(), json!("value1"));
    params.insert("key2".to_string(), json!("value2"));

    let result = sign_params(&params, None);
    assert_eq!(result.len(), 32);
    assert!(result.chars().all(|c| c.is_ascii_hexdigit()));
  }

  #[test]
  fn test_sign_params_with_data() {
    let mut params = Map::new();
    params.insert("a".to_string(), json!("1"));

    let result1 = sign_params(&params, Some("extra_data"));
    let result2 = sign_params(&params, None);

    assert_eq!(result1.len(), 32);
    assert_eq!(result2.len(), 32);
    assert_ne!(result1, result2, "有 data 和无 data 应产生不同结果");
  }

  #[test]
  fn test_sign_params_consistency() {
    let mut params = Map::new();
    params.insert("z".to_string(), json!("1"));
    params.insert("a".to_string(), json!("2"));
    params.insert("m".to_string(), json!("3"));

    let result1 = sign_params(&params, Some("data"));
    let result2 = sign_params(&params, Some("data"));

    assert_eq!(result1, result2, "相同输入应产生相同签名");
  }

  #[test]
  fn test_sign_params_order_independent() {
    // params 内部会排序，所以插入顺序不同应产生相同结果
    let mut params1 = Map::new();
    params1.insert("a".to_string(), json!("1"));
    params1.insert("b".to_string(), json!("2"));

    let mut params2 = Map::new();
    params2.insert("b".to_string(), json!("2"));
    params2.insert("a".to_string(), json!("1"));

    let result1 = sign_params(&params1, None);
    let result2 = sign_params(&params2, None);

    assert_eq!(result1, result2, "参数排序后应产生相同签名");
  }

  #[test]
  fn test_sign_params_different_value_types() {
    let mut params = Map::new();
    params.insert("str_key".to_string(), json!("string_value"));
    params.insert("num_key".to_string(), json!(12345));
    params.insert("bool_key".to_string(), json!(true));

    let result = sign_params(&params, None);
    assert_eq!(result.len(), 32);
    assert!(result.chars().all(|c| c.is_ascii_hexdigit()));
  }

  #[test]
  fn test_sign_params_empty() {
    let params = Map::new();
    let result = sign_params(&params, None);
    assert_eq!(result.len(), 32);
    assert!(result.chars().all(|c| c.is_ascii_hexdigit()));
  }

  // ==================== sign_params_web 测试 ====================

  #[test]
  fn test_sign_params_web_basic() {
    let mut params = Map::new();
    params.insert("key1".to_string(), json!("value1"));
    params.insert("key2".to_string(), json!(123));

    let result = sign_params_web(&params);
    assert_eq!(result.len(), 32);
    assert!(result.chars().all(|c| c.is_ascii_hexdigit()));
  }

  #[test]
  fn test_sign_params_web_consistency() {
    let mut params = Map::new();
    params.insert("c".to_string(), json!("3"));
    params.insert("a".to_string(), json!("1"));

    let result1 = sign_params_web(&params);
    let result2 = sign_params_web(&params);

    assert_eq!(result1, result2, "相同输入应产生相同 web 签名");
  }

  #[test]
  fn test_sign_params_web_empty() {
    let params = Map::new();
    let result = sign_params_web(&params);
    assert_eq!(result.len(), 32);
    assert!(result.chars().all(|c| c.is_ascii_hexdigit()));
  }

  #[test]
  fn test_sign_params_vs_web_different() {
    let mut params = Map::new();
    params.insert("k".to_string(), json!("v"));

    let result_params = sign_params(&params, None);
    let result_web = sign_params_web(&params);

    // 使用不同的 padding，结果应不同
    assert_ne!(result_params, result_web);
  }

  // ==================== sign_params_android 测试 ====================

  #[test]
  fn test_sign_params_android_basic() {
    let mut params = Map::new();
    params.insert("api_key".to_string(), json!("api_value"));

    let result = sign_params_android(&params, None);
    assert_eq!(result.len(), 32);
    assert!(result.chars().all(|c| c.is_ascii_hexdigit()));
  }

  #[test]
  fn test_sign_params_android_with_data() {
    let mut params = Map::new();
    params.insert("k".to_string(), json!("v"));

    let result1 = sign_params_android(&params, Some(&json!("body_data")));
    let result2 = sign_params_android(&params, Some(&Value::Null));
    let result3 = sign_params_android(&params, None);

    assert_eq!(result1.len(), 32);
    assert_eq!(result2.len(), 32);
    assert_eq!(result3.len(), 32);
    // Null 和 None 都被处理为空字符串，应相同
    assert_eq!(result2, result3);
  }

  #[test]
  fn test_sign_params_android_with_string_data() {
    let mut params = Map::new();
    params.insert("a".to_string(), json!("1"));

    let result1 = sign_params_android(&params, Some(&json!("string_body")));
    let result2 = sign_params_android(&params, None);

    assert_ne!(result1, result2, "有 body 和无 body 应产生不同结果");
  }

  #[test]
  fn test_sign_params_android_with_non_string_data() {
    let mut params = Map::new();
    params.insert("a".to_string(), json!("1"));

    // 非字符串非 Null 的 Value，应使用 to_string()
    let result = sign_params_android(&params, Some(&json!({"key": "value"})));
    assert_eq!(result.len(), 32);
    assert!(result.chars().all(|c| c.is_ascii_hexdigit()));
  }

  #[test]
  fn test_sign_params_android_consistency() {
    let mut params = Map::new();
    params.insert("p1".to_string(), json!("v1"));

    let result1 = sign_params_android(&params, Some(&json!("data")));
    let result2 = sign_params_android(&params, Some(&json!("data")));

    assert_eq!(result1, result2);
  }

  // ==================== sign_params_register 测试 ====================

  #[test]
  fn test_sign_params_register_basic() {
    let mut params = Map::new();
    params.insert("a".to_string(), json!("val_a"));
    params.insert("b".to_string(), json!("val_b"));

    let result = sign_params_register(&params);
    assert_eq!(result.len(), 32);
    assert!(result.chars().all(|c| c.is_ascii_hexdigit()));
  }

  #[test]
  fn test_sign_params_register_consistency() {
    let mut params = Map::new();
    params.insert("x".to_string(), json!("y"));

    let result1 = sign_params_register(&params);
    let result2 = sign_params_register(&params);

    assert_eq!(result1, result2);
  }

  #[test]
  fn test_sign_params_register_empty() {
    let params = Map::new();
    let result = sign_params_register(&params);
    assert_eq!(result.len(), 32);
    assert!(result.chars().all(|c| c.is_ascii_hexdigit()));
  }

  #[test]
  fn test_sign_params_register_ignores_keys() {
    // register 版本只使用 value，不使用 key
    let mut params1 = Map::new();
    params1.insert("same_key".to_string(), json!("same_value"));

    let mut params2 = Map::new();
    params2.insert("different_key".to_string(), json!("same_value"));

    let result1 = sign_params_register(&params1);
    let result2 = sign_params_register(&params2);

    assert_eq!(
      result1, result2,
      "相同 value 不同 key 在 register 模式下应产生相同签名"
    );
  }

  // ==================== sign_key 测试 ====================

  #[test]
  fn test_sign_key_basic() {
    let result = sign_key("hashvalue", "midvalue", None, None);
    assert_eq!(result.len(), 32);
    assert!(result.chars().all(|c| c.is_ascii_hexdigit()));
  }

  #[test]
  fn test_sign_key_with_all_params() {
    let result = sign_key("somehash", "somemid", Some("user123"), Some("app999"));
    assert_eq!(result.len(), 32);
    assert!(result.chars().all(|c| c.is_ascii_hexdigit()));
  }

  #[test]
  fn test_sign_key_with_partial_params() {
    let result_default = sign_key("hash", "mid", None, None);
    let result_with_user = sign_key("hash", "mid", Some("user1"), None);
    let result_with_app = sign_key("hash", "mid", None, Some("app1"));
    let result_both = sign_key("hash", "mid", Some("user1"), Some("app1"));

    assert_eq!(result_default.len(), 32);
    assert_eq!(result_with_user.len(), 32);
    assert_eq!(result_with_app.len(), 32);
    assert_eq!(result_both.len(), 32);

    // 不同参数组合应产生不同结果
    assert_ne!(result_default, result_with_user);
    assert_ne!(result_default, result_with_app);
    assert_ne!(result_with_user, result_both);
    assert_ne!(result_with_app, result_both);
  }

  #[test]
  fn test_sign_key_consistency() {
    let result1 = sign_key("h", "m", Some("u"), Some("a"));
    let result2 = sign_key("h", "m", Some("u"), Some("a"));
    assert_eq!(result1, result2);
  }

  // ==================== sign_key_cloud 测试 ====================

  #[test]
  fn test_sign_key_cloud_basic() {
    let result = sign_key_cloud("hashvalue", "pidvalue");
    assert_eq!(result.len(), 32);
    assert!(result.chars().all(|c| c.is_ascii_hexdigit()));
  }

  #[test]
  fn test_sign_key_cloud_consistency() {
    let result1 = sign_key_cloud("h1", "p1");
    let result2 = sign_key_cloud("h1", "p1");
    assert_eq!(result1, result2);
  }

  #[test]
  fn test_sign_key_cloud_different() {
    let result1 = sign_key_cloud("hash1", "pid1");
    let result2 = sign_key_cloud("hash2", "pid1");
    let result3 = sign_key_cloud("hash1", "pid2");

    assert_ne!(result1, result2, "不同 hash 应产生不同结果");
    assert_ne!(result1, result3, "不同 pid 应产生不同结果");
  }

  #[test]
  fn test_sign_key_cloud_empty() {
    let result = sign_key_cloud("", "");
    assert_eq!(result.len(), 32);
    assert!(result.chars().all(|c| c.is_ascii_hexdigit()));
  }

  // ==================== sign_key_params 测试 ====================

  #[test]
  fn test_sign_key_params_basic() {
    let result = sign_key_params("some_data", None, None);
    assert_eq!(result.len(), 32);
    assert!(result.chars().all(|c| c.is_ascii_hexdigit()));
  }

  #[test]
  fn test_sign_key_params_with_all_params() {
    let result = sign_key_params("data", Some("custom_appid"), Some("1.0.0"));
    assert_eq!(result.len(), 32);
    assert!(result.chars().all(|c| c.is_ascii_hexdigit()));
  }

  #[test]
  fn test_sign_key_params_different_combinations() {
    let result_default = sign_key_params("d", None, None);
    let result_with_appid = sign_key_params("d", Some("app1"), None);
    let result_with_ver = sign_key_params("d", None, Some("ver1"));
    let result_both = sign_key_params("d", Some("app1"), Some("ver1"));

    assert_eq!(result_default.len(), 32);
    assert_eq!(result_with_appid.len(), 32);
    assert_eq!(result_with_ver.len(), 32);
    assert_eq!(result_both.len(), 32);

    // 不同参数应产生不同结果
    assert_ne!(result_default, result_with_appid);
    assert_ne!(result_default, result_with_ver);
    assert_ne!(result_with_appid, result_both);
    assert_ne!(result_with_ver, result_both);
  }

  #[test]
  fn test_sign_key_params_consistency() {
    let result1 = sign_key_params("data", Some("a"), Some("v"));
    let result2 = sign_key_params("data", Some("a"), Some("v"));
    assert_eq!(result1, result2);
  }

  #[test]
  fn test_sign_key_params_different_data() {
    let result1 = sign_key_params("data1", None, None);
    let result2 = sign_key_params("data2", None, None);
    assert_ne!(result1, result2, "不同 data 应产生不同结果");
  }
}
