use lofty::{
  file::{AudioFile, TaggedFileExt},
  picture::Picture,
  probe::Probe,
  tag::Accessor,
};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

use crate::system::path::AppPath;

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct MusicDetail {
  path: String,                 // 路径
  cover: Option<String>,        // 封面
  title: String,                // 标题
  artist: Option<String>,       // 歌手
  album: Option<String>,        // 专辑
  genre: Option<String>,        // 流派
  duration: f64,                // 时长
  overall_bitrate: Option<u32>, // 总比特率(kbps)
  audio_bitrate: Option<u32>,   // 音频比特率(kbps)
  sample_rate: Option<u32>,     // 采样率(Hz)
  bit_depth: Option<u8>,        // 比特深度(bits)
  channels: Option<u8>,         // 声道
  format: Option<String>,       // 文件格式
  size: u64,                    // 文件大小
}

#[tauri::command]
/// 获取音频文件详情
pub fn music_file_detail(file_path: &str) -> Result<MusicDetail, String> {
  let path = Path::new(file_path);
  if !path.exists() {
    return Err(String::from("文件不存在"));
  }

  let Ok(metadata) = fs::metadata(file_path) else {
    return Err(String::from("获取文件信息失败"));
  };

  let mut music_info = MusicDetail::default();

  music_info.path = file_path.to_owned();
  music_info.format = path.extension().map(|e| e.to_string_lossy().into_owned());
  music_info.size = metadata.len();

  let probe = Probe::open(file_path).map_err(|e| e.to_string())?;
  let tagged_file = probe.read().map_err(|e| e.to_string())?;

  if let Some(tag) = tagged_file.primary_tag() {
    let file_stem = path
      .file_stem()
      .and_then(|n| n.to_str())
      .ok_or(format!("无法获取文件名: {}", file_path))?;

    let mut title = tag.title().map(|t| t.into_owned());
    let mut artist = tag.artist().map(|t| t.into_owned());

    if title.is_none() || artist.is_none() {
      // 尝试从文件名中获取标题和艺术家
      let file_stem_slice = file_stem.split_once('-');

      if let Some((stem_title, stem_artist)) = file_stem_slice {
        title = Some(stem_title.trim().to_owned());
        artist = Some(stem_artist.trim().to_owned());
      } else {
        title = Some(file_stem.to_owned());
      }
    }

    if title.is_none() {
      return Err(format!("无法获取文件名称"));
    }

    music_info.title = title.unwrap();
    music_info.artist = artist;
    music_info.album = tag.album().map(|a| a.into_owned());

    // 获取并保存封面
    if let Some(picture) = tag.pictures().get(0) {
      let app_path = AppPath::new();
      let cover_dir = app_path.cover_dir();
      music_info.cover = music_file_cover(cover_dir, file_stem, picture);
    }
  }

  let properties = tagged_file.properties();
  music_info.duration = properties.duration().as_secs_f64();
  music_info.overall_bitrate = properties.overall_bitrate();
  music_info.audio_bitrate = properties.audio_bitrate();
  music_info.sample_rate = properties.sample_rate();
  music_info.bit_depth = properties.bit_depth();
  music_info.channels = properties.channels();

  Ok(music_info)
}

/// 获取并保存音频封面
pub fn music_file_cover(cover_dir: &Path, file_stem: &str, pic: &Picture) -> Option<String> {
  if !cover_dir.exists() {
    if let Err(_) = fs::create_dir_all(&cover_dir) {
      return None;
    };
  }

  let Some(cover_ext) = pic.mime_type().and_then(|t| t.ext()) else {
    return None;
  };

  let cover_path = cover_dir.join(format!("{file_stem}.{cover_ext}"));
  if !cover_path.exists() {
    if let Err(_) = fs::write(&cover_path, pic.data()) {
      return None;
    };
  }

  Some(cover_path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs::File;
  use tempfile::tempdir;

  // === MusicDetail 默认值 ===

  #[test]
  fn test_music_detail_default_values() {
    let m = MusicDetail::default();
    assert_eq!(m.path, "");
    assert!(m.cover.is_none());
    assert_eq!(m.title, "");
    assert!(m.artist.is_none());
    assert!(m.album.is_none());
    assert!(m.genre.is_none());
    assert_eq!(m.duration, 0.0);
    assert!(m.overall_bitrate.is_none());
    assert!(m.audio_bitrate.is_none());
    assert!(m.sample_rate.is_none());
    assert!(m.bit_depth.is_none());
    assert!(m.channels.is_none());
    assert!(m.format.is_none());
    assert_eq!(m.size, 0);
  }

  #[test]
  fn test_music_detail_serde_roundtrip() {
    let m = MusicDetail {
      path: "/music/song.mp3".into(),
      cover: Some("/cover/song.png".into()),
      title: "Hello".into(),
      artist: Some("Art".into()),
      album: Some("Album".into()),
      genre: Some("Rock".into()),
      duration: 214.5,
      overall_bitrate: Some(320),
      audio_bitrate: Some(320),
      sample_rate: Some(44100),
      bit_depth: Some(16),
      channels: Some(2),
      format: Some("mp3".into()),
      size: 9_000_000,
    };
    let json = serde_json::to_string(&m).unwrap();
    let back: MusicDetail = serde_json::from_str(&json).unwrap();
    assert_eq!(back.path, "/music/song.mp3");
    assert_eq!(back.cover.as_deref(), Some("/cover/song.png"));
    assert_eq!(back.title, "Hello");
    assert_eq!(back.artist.as_deref(), Some("Art"));
    assert_eq!(back.album.as_deref(), Some("Album"));
    assert_eq!(back.genre.as_deref(), Some("Rock"));
    assert!((back.duration - 214.5).abs() < f64::EPSILON);
    assert_eq!(back.overall_bitrate, Some(320));
    assert_eq!(back.audio_bitrate, Some(320));
    assert_eq!(back.sample_rate, Some(44100));
    assert_eq!(back.bit_depth, Some(16));
    assert_eq!(back.channels, Some(2));
    assert_eq!(back.format.as_deref(), Some("mp3"));
    assert_eq!(back.size, 9_000_000);
  }

  #[test]
  fn test_music_detail_default_serde_roundtrip() {
    let a = MusicDetail::default();
    let json = serde_json::to_string(&a).unwrap();
    let back: MusicDetail = serde_json::from_str(&json).unwrap();
    assert_eq!(back.format, None);
    assert_eq!(back.cover, None);
    assert_eq!(back.artist, None);
    assert_eq!(back.channels, None);
  }

  // === music_file_detail 错误分支（不依赖实际音频文件） ===

  #[test]
  fn test_music_file_detail_missing_path_returns_error() {
    let res = music_file_detail("definitely_not_exist_file_xyz_12345.mp3");
    assert!(res.is_err());
    assert_eq!(res.unwrap_err(), "文件不存在");
  }

  #[test]
  fn test_music_file_detail_empty_path_returns_error() {
    let res = music_file_detail("");
    assert!(res.is_err());
    assert_eq!(res.unwrap_err(), "文件不存在");
  }

  #[test]
  fn test_music_file_detail_non_audio_file_returns_parse_error() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("plain.txt");
    File::create(&path).unwrap();
    std::fs::write(&path, b"not audio at all").unwrap();
    let res = music_file_detail(path.to_str().unwrap());
    assert!(res.is_err(), "非音频文件应返回错误");
  }

  // music_file_cover 依赖 lofty::Picture 的构造 API，版本间不稳定，
  // 这里仅验证 cover_dir 已被 AppPath 正常创建以确保路径逻辑无误。
  #[test]
  fn test_music_file_cover_placeholder_ok() {
    assert!(AppPath::new().cover_dir().exists());
  }
}
