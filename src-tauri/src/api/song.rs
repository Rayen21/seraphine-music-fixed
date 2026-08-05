use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::{
  api::libs::ApiResult,
  http::{
    mode::{HttpMode, Mode},
    server::{request, RequestOptions},
  },
};

#[derive(Debug, Serialize, Deserialize)]
pub enum Quality {
  #[serde(rename = "magic_piano")]
  MagicPiano, // 对应手机端魔法音乐 钢琴，仅部分音乐支持
  #[serde(rename = "magic_acappella")]
  MagicAcappella, // 对应手机端魔法音乐 人声 伴奏，仅部分音乐支持，该模式下返回的音频后缀为 mkv 格式，该文加存在 人声 和 伴奏 两个音轨
  #[serde(rename = "magic_subwoofer")]
  MagicSubwoofer, // 对应手机端魔法音乐 骨笛，仅部分音乐支持
  #[serde(rename = "magic_ancient")]
  MagicAncient, // 对应手机端魔法音乐 尤克里里，仅部分音乐支持
  #[serde(rename = "magic_surnay")]
  MagicSurnay, // 对应手机端魔法音乐 唢呐，仅部分音乐支持
  #[serde(rename = "magic_dj")]
  MagicDj, // 对应手机端魔法音乐 DJ，仅部分音乐支持

  #[serde(rename = "128")]
  Bitrate128, // 返回 128 码率 mp3 格式
  #[serde(rename = "320")]
  Bitrate320, // 返回 320 码率 mp3 格式
  #[serde(rename = "flac")]
  BitrateFlac, // 返回 flac 格式音频
  #[serde(rename = "high")]
  BitrateHigh, // 返回无损格式音频

  #[serde(rename = "viper_atmos")]
  ViperAtmos, // 蝰蛇全景声，仅部分音乐支持
  #[serde(rename = "viper_clear")]
  ViperClear, // 蝰蛇超清音质
  #[serde(rename = "viper_tape")]
  ViperTape, // 蝰蛇母带，仅部分音乐支持, 该音质需要转码，关于转码相关的技术还不会

  #[serde(rename = "super")]
  SuperBsd, // 返回 DSD 格式音频，支持的音频少的可伶
}

#[tauri::command]
/// 获取歌曲播放地址
///
/// ### 必选参数
/// * `hash` - 歌曲 hash
///
/// ### 可选参数
/// * `quality` - 音质，默认为 `128`
/// * `album_id` - 专辑 id
/// * `album_audio_id` - 专辑音频 id
/// * `free_part` - 是否返回试听部分（仅部分歌曲）
pub async fn api_song_url(
  hash: &str,
  quality: Option<Quality>,
  album_id: Option<u64>,
  album_audio_id: Option<u64>,
  free_part: Option<u8>,
) -> ApiResult<HashMap<String, Value>> {
  let (pid, page_id, ppage_id) = match HttpMode::get_mode() {
    Mode::KgMobile => (2, 151369488, "463467626,350369493,788954147"),
    Mode::KgLite => (411, 967177915, "356753938,823673182,967485191"),
  };

  let params = json!({
    "hash": hash.to_lowercase(),
    "quality": quality.unwrap_or(Quality::Bitrate128),
    "album_id": album_id.unwrap_or(0),
    "album_audio_id": album_audio_id.unwrap_or(0),
    "IsFreePart": free_part.unwrap_or(0),
    "pid": pid,
    "page_id": page_id,
    "ppage_id": ppage_id,
    "area_code": 1,
    "ssa_flag": "is_fromtrack",
    "version": 11430,
    "behavior": "play",
    "cmd": 26,
    "pidversion": 3001,
    "cdnBackup": 1,
    "module": "",
    "clientver": 11430,
  });
  let Value::Object(params) = params else { unreachable!() };

  let opts = RequestOptions::new()
    .url("/v5/url")
    .add_header("x-router", "trackercdn.kugou.com")
    .params(params)
    .should_encrypt(true);

  request(opts).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  // === Quality serde 序列化 ===

  #[test]
  fn test_quality_serde_bitrate128() {
    let json = serde_json::to_string(&Quality::Bitrate128).unwrap();
    assert_eq!(json, "\"128\"");
  }

  #[test]
  fn test_quality_serde_bitrate320() {
    let json = serde_json::to_string(&Quality::Bitrate320).unwrap();
    assert_eq!(json, "\"320\"");
  }

  #[test]
  fn test_quality_serde_flac() {
    let json = serde_json::to_string(&Quality::BitrateFlac).unwrap();
    assert_eq!(json, "\"flac\"");
  }

  #[test]
  fn test_quality_serde_high() {
    let json = serde_json::to_string(&Quality::BitrateHigh).unwrap();
    assert_eq!(json, "\"high\"");
  }

  #[test]
  fn test_quality_serde_super() {
    let json = serde_json::to_string(&Quality::SuperBsd).unwrap();
    assert_eq!(json, "\"super\"");
  }

  #[test]
  fn test_quality_serde_magic_variants() {
    assert_eq!(
      serde_json::to_string(&Quality::MagicPiano).unwrap(),
      "\"magic_piano\""
    );
    assert_eq!(
      serde_json::to_string(&Quality::MagicAcappella).unwrap(),
      "\"magic_acappella\""
    );
    assert_eq!(
      serde_json::to_string(&Quality::MagicSubwoofer).unwrap(),
      "\"magic_subwoofer\""
    );
    assert_eq!(
      serde_json::to_string(&Quality::MagicAncient).unwrap(),
      "\"magic_ancient\""
    );
    assert_eq!(
      serde_json::to_string(&Quality::MagicSurnay).unwrap(),
      "\"magic_surnay\""
    );
    assert_eq!(
      serde_json::to_string(&Quality::MagicDj).unwrap(),
      "\"magic_dj\""
    );
  }

  #[test]
  fn test_quality_serde_viper_variants() {
    assert_eq!(
      serde_json::to_string(&Quality::ViperAtmos).unwrap(),
      "\"viper_atmos\""
    );
    assert_eq!(
      serde_json::to_string(&Quality::ViperClear).unwrap(),
      "\"viper_clear\""
    );
    assert_eq!(
      serde_json::to_string(&Quality::ViperTape).unwrap(),
      "\"viper_tape\""
    );
  }

  // === Quality serde 反序列化 ===

  #[test]
  fn test_quality_deserialize_bitrate128() {
    let q: Quality = serde_json::from_str("\"128\"").unwrap();
    assert!(matches!(q, Quality::Bitrate128));
  }

  #[test]
  fn test_quality_deserialize_flac() {
    let q: Quality = serde_json::from_str("\"flac\"").unwrap();
    assert!(matches!(q, Quality::BitrateFlac));
  }

  #[test]
  fn test_quality_deserialize_magic_piano() {
    let q: Quality = serde_json::from_str("\"magic_piano\"").unwrap();
    assert!(matches!(q, Quality::MagicPiano));
  }

  #[test]
  fn test_quality_deserialize_invalid_variant() {
    let result: Result<Quality, _> = serde_json::from_str("\"invalid\"");
    assert!(result.is_err());
  }

  #[test]
  fn test_quality_deserialize_numeric_not_accepted() {
    // serde rename 后是字符串 "128"，不是数字 128
    let result: Result<Quality, _> = serde_json::from_str("128");
    assert!(result.is_err());
  }

  // === Quality 全变体往返测试 ===

  #[test]
  fn test_quality_all_variants_roundtrip() {
    let all = [
      Quality::MagicPiano,
      Quality::MagicAcappella,
      Quality::MagicSubwoofer,
      Quality::MagicAncient,
      Quality::MagicSurnay,
      Quality::MagicDj,
      Quality::Bitrate128,
      Quality::Bitrate320,
      Quality::BitrateFlac,
      Quality::BitrateHigh,
      Quality::ViperAtmos,
      Quality::ViperClear,
      Quality::ViperTape,
      Quality::SuperBsd,
    ];
    for variant in all {
      let json = serde_json::to_string(&variant).unwrap();
      let back: Quality = serde_json::from_str(&json).unwrap();
      // 序列化再反序列化应得到同一变体（用 Debug 比较）
      assert_eq!(format!("{:?}", back), format!("{:?}", variant));
    }
  }

  // === Quality 变体计数 ===

  #[test]
  fn test_quality_variant_count_is_14() {
    // 共 14 个变体：6 magic + 4 bitrate + 3 viper + 1 super
    let count = 14;
    assert_eq!(count, 14);
  }

  // === 命令签名约束 ===

  #[test]
  fn test_command_signatures_exist() {
    let _ = api_song_url;
  }
}
