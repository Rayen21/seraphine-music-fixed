use crate::http::server::{request, RequestOptions};
use tauri_plugin_http::reqwest::Method;

/// 通过后端代理下载图片（使用 Cookie）
#[tauri::command]
pub async fn api_download_image(url: String) -> Result<String, String> {
  let opts = RequestOptions::new()
    .url(&url)
    .method(Method::GET);

  let resp = request(opts).await.map_err(|e| e.to_string())?;

  // 返回 base64 编码的图片数据
  let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
  Ok(base64_encode(&bytes))
}

fn base64_encode(bytes: &[u8]) -> String {
  use std::string::String as StdString;
  let mut result = String::new();
  for chunk in bytes.chunks(3) {
    let b0 = chunk[0] as u32;
    let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
    let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };

    let triple = (b0 << 16) | (b1 << 8) | b2;
    for i in (0..4).rev() {
      let idx = ((triple >> (i * 6)) & 0x3F) as usize;
      result.push(ENCODE_TABLE[idx]);
    }
  }

  // Add padding
  let remainder = bytes.len() % 3;
  if remainder == 1 {
    for _ in 0..2 {
      result.push('=');
    }
  } else if remainder == 2 {
    result.push('=');
  }

  result
}

const ENCODE_TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_base64_encode_empty() {
    assert_eq!(base64_encode(&[]), "");
  }

  #[test]
  fn test_base64_encode_single_byte() {
    // "A" -> "QQ=="
    let result = base64_encode(&[b'A']);
    assert_eq!(result, "QQ==");
  }

  #[test]
  fn test_base64_encode_two_bytes() {
    // "AB" -> "QUI="
    let result = base64_encode(&[b'A', b'B']);
    assert_eq!(result, "QUI=");
  }

  #[test]
  fn test_base64_encode_three_bytes() {
    // "ABC" -> "QUJD"
    let result = base64_encode(&[b'A', b'B', b'C']);
    assert_eq!(result, "QUJD");
  }

  #[test]
  fn test_command_exists() {
    let _ = api_download_image;
  }
}
