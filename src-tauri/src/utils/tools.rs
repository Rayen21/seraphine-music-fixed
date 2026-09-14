use anyhow::anyhow;
use flate2::read::ZlibDecoder;
use std::io::Read;

use crate::utils::crypto::encrypt_md5;

const RANDOM_STRING: &[u8; 36] = b"1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const INVALID_CHARS: [char; 9] = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

/// 生成 `len` 长度的随机字符串
pub fn random_string(len: usize) -> String {
  (0..len)
    .map(|_| RANDOM_STRING[rand::random_range(..RANDOM_STRING.len())] as char)
    .collect()
}

/// 计算 mid
///
/// 将 MD5 哈希值转换为十进制大整数字符串
pub fn calculate_mid(data: impl AsRef<[u8]>) -> String {
  let Ok(value) = u128::from_str_radix(&encrypt_md5(data), 16) else {
    // 理论上不会发生，因为 MD5 始终是有效的 128 位(32个十六进制)字符
    return String::new();
  };

  value.to_string()
}

/// 是否合法 hash
pub fn is_valid_hash(hash: &str) -> bool {
  if hash.is_empty() || hash.len() >= 256 {
    return false;
  }

  if hash.contains("..") || hash.starts_with('/') || hash.starts_with('\\') {
    return false;
  }

  hash
    .chars()
    .all(|c| c.is_alphanumeric() || c == '_' || c == '-' || c == '.')
}

/// 获取合法路径
pub fn get_valid_path(name: &str) -> String {
  name
    .chars()
    .filter(|c| !c.is_control() && !INVALID_CHARS.contains(c))
    .collect()
}

/// 解码 KRC 歌词
pub fn decode_krc_lyric(encoded_data: &[u8]) -> anyhow::Result<String> {
  if encoded_data.len() < 4 {
    return Err(anyhow!("数据长度不足"));
  }

  const KRC_KEY: [u8; 16] = [
    0x40, 0x47, 0x61, 0x77, 0x5E, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2D, 0xCE, 0xD2, 0x6E, 0x69,
  ];

  let encrypted_data = &encoded_data[4..];

  let mut decrypted_data = Vec::with_capacity(encrypted_data.len());
  for (i, &byte) in encrypted_data.iter().enumerate() {
    decrypted_data.push(byte ^ KRC_KEY[i % KRC_KEY.len()]);
  }

  let mut decoded_data = String::new();
  let mut decoder = ZlibDecoder::new(&decrypted_data[..]);
  decoder.read_to_string(&mut decoded_data)?;

  Ok(decoded_data)
}

#[cfg(test)]
mod tests {
  use super::*;

  // ==================== random_string 测试 ====================

  #[test]
  fn test_random_string_length() {
    let test_lengths = [0, 1, 5, 10, 32, 100, 256];

    for len in test_lengths.iter() {
      let result = random_string(*len);
      assert_eq!(result.len(), *len, "长度应为 {}", len);
    }
  }

  #[test]
  fn test_random_string_valid_chars() {
    let result = random_string(1000);

    for c in result.chars() {
      assert!(c.is_ascii_alphanumeric(), "字符 '{}' 不在允许的字符集中", c);
    }
  }

  #[test]
  fn test_random_string_randomness() {
    let s1 = random_string(32);
    let s2 = random_string(32);

    // 两个随机字符串极大概率不相同
    assert_ne!(s1, s2, "两次生成的随机字符串应该不同");
  }

  #[test]
  fn test_random_string_empty() {
    let result = random_string(0);
    assert_eq!(result, "");
  }

  // ==================== calculate_mid 测试 ====================

  #[test]
  fn test_calculate_mid_basic() {
    let data = b"test";
    let mid = calculate_mid(data);

    // MD5("test") = 098f6bcd4621d373cade4e832627b4f6
    // 转换为 u128 后再转字符串
    assert!(!mid.is_empty());
    assert!(mid.chars().all(|c| c.is_ascii_digit()));
  }

  #[test]
  fn test_calculate_mid_consistency() {
    let data = b"consistent data";
    let mid1 = calculate_mid(data);
    let mid2 = calculate_mid(data);

    assert_eq!(mid1, mid2, "相同数据应生成相同的 mid");
  }

  #[test]
  fn test_calculate_mid_different_data() {
    let mid1 = calculate_mid(b"data1");
    let mid2 = calculate_mid(b"data2");

    assert_ne!(mid1, mid2, "不同数据应生成不同的 mid");
  }

  #[test]
  fn test_calculate_mid_empty() {
    let mid = calculate_mid(b"");
    assert!(!mid.is_empty());
    assert!(mid.chars().all(|c| c.is_ascii_digit()));
  }

  #[test]
  fn test_calculate_mid_string_input() {
    let data = String::from("hello world");
    let mid1 = calculate_mid(&data);
    let mid2 = calculate_mid(b"hello world");

    assert_eq!(mid1, mid2, "字符串和字节切片输入应产生相同结果");
  }

  // ==================== is_valid_hash 测试 ====================

  #[test]
  fn test_is_valid_hash_valid() {
    assert!(is_valid_hash("abc123"));
    assert!(is_valid_hash("ABC_DEF-123.xyz"));
    assert!(is_valid_hash("a"));
    assert!(is_valid_hash("hash_with_underscore"));
    assert!(is_valid_hash("hash-with-dash"));
    assert!(is_valid_hash("hash.with.dot"));
  }

  #[test]
  fn test_is_valid_hash_empty() {
    assert!(!is_valid_hash(""), "空字符串应为无效 hash");
  }

  #[test]
  fn test_is_valid_hash_too_long() {
    let long_hash = "a".repeat(256);
    assert!(!is_valid_hash(&long_hash), "长度 >= 256 应为无效 hash");

    let valid_hash = "a".repeat(255);
    assert!(is_valid_hash(&valid_hash), "长度 255 应为有效 hash");
  }

  #[test]
  fn test_is_valid_hash_contains_double_dot() {
    assert!(!is_valid_hash("path/../escape"), "包含 '..' 应为无效 hash");
    assert!(!is_valid_hash("..start"), "包含 '..' 应为无效 hash");
    assert!(!is_valid_hash("end.."), "包含 '..' 应为无效 hash");
  }

  #[test]
  fn test_is_valid_hash_starts_with_slash() {
    assert!(!is_valid_hash("/etc/passwd"), "以 '/' 开头应为无效 hash");
    assert!(
      !is_valid_hash("\\windows\\path"),
      "以 '\\' 开头应为无效 hash"
    );
  }

  #[test]
  fn test_is_valid_hash_invalid_chars() {
    assert!(!is_valid_hash("hash with space"), "空格应为无效字符");
    assert!(!is_valid_hash("hash@symbol"), "@ 应为无效字符");
    assert!(!is_valid_hash("hash#symbol"), "# 应为无效字符");
    assert!(!is_valid_hash("hash$symbol"), "$ 应为无效字符");
    assert!(!is_valid_hash("hash&symbol"), "& 应为无效字符");
    assert!(!is_valid_hash("hash+symbol"), "+ 应为无效字符");
    assert!(!is_valid_hash("hash=symbol"), "= 应为无效字符");
    assert!(!is_valid_hash("hash,symbol"), ", 应为无效字符");
    assert!(!is_valid_hash("hash;symbol"), "; 应为无效字符");
    assert!(!is_valid_hash("hash:symbol"), ": 应为无效字符");
  }

  // ==================== get_valid_path 测试 ====================

  #[test]
  fn test_get_valid_path_normal() {
    let result = get_valid_path("normal_filename.txt");
    assert_eq!(result, "normal_filename.txt");
  }

  #[test]
  fn test_get_valid_path_remove_invalid_chars() {
    let result = get_valid_path("file:<name>\"with\"/invalid\\chars?yes*no|maybe");
    assert_eq!(result, "filenamewithinvalidcharsyesnomaybe");
  }

  #[test]
  fn test_get_valid_path_all_invalid_chars() {
    let result = get_valid_path("<>:\"/\\|?*");
    assert_eq!(result, "");
  }

  #[test]
  fn test_get_valid_path_remove_control_chars() {
    let input = format!("file{}name", 0x07 as char); // 包含 BEL 控制字符
    let result = get_valid_path(&input);
    assert_eq!(result, "filename");
  }

  #[test]
  fn test_get_valid_path_empty() {
    let result = get_valid_path("");
    assert_eq!(result, "");
  }

  #[test]
  fn test_get_valid_path_chinese() {
    let result = get_valid_path("我是一个文件名.txt");
    assert_eq!(result, "我是一个文件名.txt");
  }

  #[test]
  fn test_get_valid_path_with_spaces() {
    let result = get_valid_path("my file name.txt");
    assert_eq!(result, "my file name.txt", "空格是允许的");
  }

  // ==================== decode_krc_lyric 测试 ====================

  #[test]
  fn test_decode_krc_lyric_data_too_short() {
    // 数据长度不足 4
    let test_cases = vec![vec![], vec![0x00], vec![0x00, 0x01], vec![0x00, 0x01, 0x02]];

    for data in test_cases {
      let result = decode_krc_lyric(&data);
      assert!(result.is_err(), "长度不足 4 应该返回错误");
    }
  }
}
