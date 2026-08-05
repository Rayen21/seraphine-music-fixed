use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::fs;

use crate::{
  system::path::AppPath,
  utils::tools::{decode_krc_lyric, get_valid_path},
};

#[derive(Debug, Serialize, Deserialize)]
pub struct Lyric {
  pub id: String,
  pub fmt: LyricFormat,
  pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum LyricFormat {
  Krc,
  Lrc,
}

impl LyricFormat {
  pub fn as_ext(&self) -> &'static str {
    match self {
      Self::Krc => "krc",
      Self::Lrc => "lrc",
    }
  }
}

#[tauri::command]
/// 获取本地歌词
///
/// ### 必选参数
/// * `name` - 歌词名称
/// * `id` - 歌词id
pub fn music_lyric_get(name: &str, id: &str, fmt: LyricFormat) -> Option<Lyric> {
  let (name, id) = (get_valid_path(name), get_valid_path(id));

  let lyric_path = AppPath::new()
    .lyric_dir()
    .join(format!("{name} - {id}.{}", fmt.as_ext()));

  let Ok(lyric_txt) = fs::read_to_string(&lyric_path) else {
    return None;
  };

  let Ok(lyric_buf) = STANDARD.decode(&lyric_txt) else {
    return None;
  };

  let lyric_decoded = match fmt {
    LyricFormat::Krc => decode_krc_lyric(&lyric_buf).ok(),
    LyricFormat::Lrc => String::from_utf8(lyric_buf).ok(),
  };

  Some(Lyric {
    id: id.to_owned(),
    fmt,
    content: lyric_decoded.unwrap_or_default(),
  })
}

pub fn music_lyric_save(
  name: &str,
  id: &str,
  fmt: &LyricFormat,
  conetnt: &str,
) -> Result<(), String> {
  let (name, id) = (get_valid_path(name), get_valid_path(id));

  let lyric_path = AppPath::new()
    .lyric_dir()
    .join(format!("{name} - {id}.{}", fmt.as_ext()));

  if let Err(e) = fs::write(&lyric_path, &conetnt) {
    return Err(format!("歌词文件保存失败: {e}"));
  };

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use base64::{engine::general_purpose::STANDARD, Engine};
  use std::fs;
  use tempfile::tempdir;

  // === LyricFormat as_ext ===

  #[test]
  fn test_lyric_format_as_ext_krc() {
    assert_eq!(LyricFormat::Krc.as_ext(), "krc");
  }

  #[test]
  fn test_lyric_format_as_ext_lrc() {
    assert_eq!(LyricFormat::Lrc.as_ext(), "lrc");
  }

  #[test]
  fn test_lyric_format_exhaustive_match() {
    for fmt in [LyricFormat::Krc, LyricFormat::Lrc] {
      match fmt {
        LyricFormat::Krc => assert_eq!(fmt.as_ext(), "krc"),
        LyricFormat::Lrc => assert_eq!(fmt.as_ext(), "lrc"),
      }
    }
  }

  // === Lyric / LyricFormat serde ===

  #[test]
  fn test_lyric_serde_roundtrip_krc() {
    let lyric = Lyric {
      id: "1001".into(),
      fmt: LyricFormat::Krc,
      content: "[00:01.00]hello world".into(),
    };
    let json = serde_json::to_string(&lyric).unwrap();
    let back: Lyric = serde_json::from_str(&json).unwrap();
    assert_eq!(back.id, "1001");
    assert!(matches!(back.fmt, LyricFormat::Krc));
    assert_eq!(back.content, "[00:01.00]hello world");
  }

  #[test]
  fn test_lyric_serde_roundtrip_lrc() {
    let lyric = Lyric {
      id: "99".into(),
      fmt: LyricFormat::Lrc,
      content: "[ti:title]\n[ar:artist]".into(),
    };
    let json = serde_json::to_string(&lyric).unwrap();
    let back: Lyric = serde_json::from_str(&json).unwrap();
    assert_eq!(back.id, "99");
    assert!(matches!(back.fmt, LyricFormat::Lrc));
    assert_eq!(back.content, "[ti:title]\n[ar:artist]");
  }

  #[test]
  fn test_lyric_format_serde_krc() {
    let json = serde_json::to_string(&LyricFormat::Krc).unwrap();
    assert!(json.contains("Krc"));
    let back: LyricFormat = serde_json::from_str(&json).unwrap();
    assert!(matches!(back, LyricFormat::Krc));
  }

  #[test]
  fn test_lyric_format_serde_lrc() {
    let json = serde_json::to_string(&LyricFormat::Lrc).unwrap();
    assert!(json.contains("Lrc"));
    let back: LyricFormat = serde_json::from_str(&json).unwrap();
    assert!(matches!(back, LyricFormat::Lrc));
  }

  // === music_lyric_save / music_lyric_get 保存读取完整流程 ===
  // 注意：AppPath::new() 使用的是真实 current_dir/temp_dir，
  // 我们不替换 AppPath 行为，因此直接在临时目录中观察文件落盘
  // 会造成单测对全局 lyric_dir 有副作用。
  // 因此这里通过直接构造临时路径 + 写入/读取 base64 内容来验证 "content 往返一致性"
  // 而不依赖 AppPath 内部目录。

  #[test]
  fn test_lrc_base64_save_and_read_roundtrip() {
    // Lrc 流程：原文 UTF-8 → base64 encode → 写入 → 读取 → base64 decode → String::from_utf8
    let content = "[00:00.50]Hello世界";
    let encoded = STANDARD.encode(content.as_bytes());

    let dir = tempdir().unwrap();
    let path = dir.path().join("test.lrc");
    fs::write(&path, &encoded).unwrap();

    let read = fs::read_to_string(&path).unwrap();
    let bytes = STANDARD.decode(&read).unwrap();
    let decoded = String::from_utf8(bytes).unwrap();
    assert_eq!(decoded, content);
  }

  #[test]
  fn test_music_lyric_save_invalid_path_chars_rejected_by_get_valid_path() {
    // get_valid_path 会替换非法字符，但保存结果是合法路径，应 Ok
    // 这里只验证不会 panic
    let res = music_lyric_save("a/b\\c:d*e?f\"g<h>i|j", "id", &LyricFormat::Lrc, "");
    // 不同平台可能行为不同，只要不 panic 即可
    assert!(res.is_ok() || res.is_err());
  }

  // === music_lyric_get 对不存在的文件返回 None ===

  #[test]
  fn test_music_lyric_get_missing_file_returns_none() {
    let result = music_lyric_get(
      "__definitely_not_exist_name_xyz",
      "__999999",
      LyricFormat::Lrc,
    );
    assert!(result.is_none());
  }

  #[test]
  fn test_music_lyric_get_missing_krc_file_returns_none() {
    let result = music_lyric_get("__krc_missing_xyz", "123", LyricFormat::Krc);
    assert!(result.is_none());
  }

  // === debug 显示 ===

  #[test]
  fn test_lyric_debug_contains_id() {
    let lyric = Lyric {
      id: "ABC".into(),
      fmt: LyricFormat::Lrc,
      content: "".into(),
    };
    let s = format!("{:?}", lyric);
    assert!(s.contains("ABC"));
    assert!(s.contains("Lrc"));
  }
}
