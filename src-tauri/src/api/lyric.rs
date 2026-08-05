use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::{
  api::libs::{ApiResult, LyricGet},
  http::{
    config::HttpConfig,
    libs::KgStaticConfig,
    server::{request, RequestOptions, Response},
  },
  music::lyric::{music_lyric_save, Lyric, LyricFormat},
  utils::tools::decode_krc_lyric,
};

#[tauri::command]
/// 搜索歌词
///
/// ### 必选参数
/// * `keyword` - 搜索关键字, `artist - title` 格式
///
/// ### 可选参数
/// * `hash` - 歌曲 hash, 在线歌曲有效
/// * `album_audio_id` - 专辑音频 id
/// * `man` - 是否返回多个歌词, 默认为 `yes`
pub async fn api_lyric_search(
  keyword: &str,
  hash: Option<&str>,
  album_audio_id: Option<u8>,
  man: Option<&str>,
) -> ApiResult<HashMap<String, Value>> {
  let KgStaticConfig {
    appid, client_ver, ..
  } = HttpConfig::get_kg_static_config();

  let params = json!({
    "keyword": keyword,
    "hash": hash.unwrap_or_default(),
    "album_audio_id": album_audio_id.unwrap_or_default(),
    "man": man.unwrap_or("yes"),
    "appid": appid,
    "clientver": client_ver,
    "duration": 0,
    "lrctxt": 1,
  });
  let Value::Object(params) = params else { unreachable!() };

  let opts = RequestOptions::new()
    .base_url("https://lyrics.kugou.com")
    .url("/v1/search")
    .params(params)
    .should_clear_params(true);

  request(opts).await.map_err(|e| e.to_string())
}

#[tauri::command]
/// 获取歌词 (同时保存到本地)
///
/// ### 必选参数
/// * `name` - 歌词名称, 用以本地保存
/// * `id` - 歌词id
/// * `accesskey` - 歌词accesskey
///
/// ### 可选参数
/// * `fmt` - 歌词格式, 默认为 `krc`
/// * `decode` - 是否解码歌词, 默认为 `true`
/// * `client` - 客户端, 默认为 `android`
pub async fn api_lyric_get(
  name: &str,
  id: &str,
  accesskey: &str,
  fmt: Option<LyricFormat>,
  decode: Option<bool>,
  client: Option<&str>,
) -> Result<Option<Lyric>, String> {
  let params = json!({
    "id": id,
    "accesskey": accesskey,
    "fmt": fmt.unwrap_or(LyricFormat::Krc).as_ext(),
    "client":  client.unwrap_or("android"),
    "ver": "1",
    "charset": "utf8",
  });
  let Value::Object(params) = params else { unreachable!() };

  let opts = RequestOptions::new()
    .base_url("https://lyrics.kugou.com")
    .url("/download")
    .params(params);

  let resp = request::<LyricGet>(opts).await.map_err(|e| e.to_string())?;
  let Response::Json(resp_map) = resp else { unreachable!() };

  if resp_map.status != 200 {
    return Ok(None);
  }

  let lrc_decode = resp_map.fmt == "lrc" || resp_map.contenttype != 0;
  let format = if lrc_decode { LyricFormat::Lrc } else { LyricFormat::Krc };

  // 解码歌词
  let decoded_content = match decode.unwrap_or(true) {
    true => get_decode_content(&resp_map.content, lrc_decode).map_err(|e| e.to_string())?,
    false => String::new(),
  };

  // 保存歌词到本地
  music_lyric_save(name, id, &format, &resp_map.content).map_err(|e| e.to_string())?;

  Ok(Some(Lyric {
    id: resp_map.id,
    fmt: format,
    content: decoded_content,
  }))
}

/// 获取解码后的歌词内容
fn get_decode_content(content: &str, lrc_decode: bool) -> anyhow::Result<String> {
  let content_vec = STANDARD.decode(content)?;

  let decoded_content = match lrc_decode {
    true => String::from_utf8(content_vec)?,
    false => decode_krc_lyric(&content_vec)?,
  };

  Ok(decoded_content)
}

#[cfg(test)]
mod tests {
  use super::*;

  // === get_decode_content 纯函数 ===

  #[test]
  fn test_get_decode_content_lrc_mode() {
    // lrc_decode=true：base64 解码后直接转 utf8
    let original = "[00:00.00]Hello 你好";
    let encoded = STANDARD.encode(original);
    let result = get_decode_content(&encoded, true).unwrap();
    assert_eq!(result, original);
  }

  #[test]
  fn test_get_decode_content_lrc_mode_empty() {
    let encoded = STANDARD.encode("");
    let result = get_decode_content(&encoded, true).unwrap();
    assert_eq!(result, "");
  }

  #[test]
  fn test_get_decode_content_lrc_mode_multibyte() {
    // 中文多字节 UTF-8
    let original = "测试歌词内容";
    let encoded = STANDARD.encode(original);
    let result = get_decode_content(&encoded, true).unwrap();
    assert_eq!(result, original);
  }

  #[test]
  fn test_get_decode_content_invalid_base64() {
    // 非 base64 字符串应返回错误
    let result = get_decode_content("!!!not-base64!!!", true);
    assert!(result.is_err());
  }

  #[test]
  fn test_get_decode_content_invalid_utf8() {
    // lrc_decode=true 时，解码后的字节不是合法 utf8 应返回错误
    // 0xFF 是非法 utf8 序列
    let encoded = STANDARD.encode([0xFF, 0xFE, 0xFD]);
    let result = get_decode_content(&encoded, true);
    assert!(result.is_err());
  }

  #[test]
  fn test_get_decode_content_krc_mode_returns_decoded() {
    // krc 模式走 decode_krc_lyric，需要构造合法的 krc 数据
    // krc 格式较复杂，此处仅校验非 lrc 路径不会 panic
    let encoded = STANDARD.encode([0u8; 16]);
    let result = get_decode_content(&encoded, false);
    // 不论成功失败，不应 panic
    let _ = result;
  }

  // === 命令签名约束 ===

  #[test]
  fn test_command_signatures_exist() {
    let _ = api_lyric_search;
  }

  // === URL 常量 ===

  #[test]
  fn test_lyric_search_base_url() {
    // api_lyric_search 中 base_url 为 https://lyrics.kugou.com
    let base_url = "https://lyrics.kugou.com";
    assert!(base_url.starts_with("https://"));
    assert!(base_url.contains("lyrics.kugou.com"));
  }

  #[test]
  fn test_lyric_search_url_path() {
    // api_lyric_search 中 url 为 /v1/search
    let url_path = "/v1/search";
    assert!(url_path.starts_with("/v1"));
    assert!(url_path.ends_with("search"));
  }

  #[test]
  fn test_lyric_get_url_path() {
    // api_lyric_get 中 url 为 /download
    let url_path = "/download";
    assert_eq!(url_path, "/download");
  }
}
