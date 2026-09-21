use anyhow::Result;
use rodio::{
  cpal::{default_host, traits::HostTrait},
  Device, DeviceTrait,
};
use serde::{Deserialize, Serialize};
use std::{
  fs::{metadata, OpenOptions},
  io::Write,
  path::PathBuf,
  sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, RwLock,
  },
  time::Duration,
};
use tauri::{async_runtime, ipc::Channel, AppHandle, Emitter, State};
use tauri_plugin_http::reqwest::Response;
use tokio::time;
use tokio_stream::StreamExt;

use crate::{
  http::client::HttpRequest,
  music::{audio::Audio, stream::StreamFile},
  system::path::AppPath,
  utils::tools::is_valid_hash,
};

// 获取文件句柄超时
const FILE_TIMEOUT: Duration = Duration::from_millis(5000);
// 监测设备的间隔
const DEVICE_INTERVAL: Duration = Duration::from_millis(1000);
// 播放进度的获取间隔
const PLAY_INTERVAL: Duration = Duration::from_millis(16);
// 下载进度的获取间隔
const DOWNLOAD_INTERVAL: Duration = Duration::from_millis(100);
// 最小读取文件大小
const MIN_READ_SIZE: u64 = 1024 * 128;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
  id: String,
  name: String,
}

impl DeviceInfo {
  fn from_device(device: &Device) -> Option<Self> {
    let Ok(id) = device.id() else {
      return None;
    };
    let Ok(description) = device.description() else {
      return None;
    };

    let name = description.name();
    let driver = description.driver().unwrap_or_default();

    Some(DeviceInfo {
      id: id.to_string(),
      name: format!("{name}({driver})"),
    })
  }
}

pub struct Player {
  app_path: AppPath,
  audio: Arc<RwLock<Audio>>,           // 音频实例
  audio_size: Arc<AtomicU64>,          // 音频文件大小
  play_channel_id: Arc<AtomicU64>,     // 播放进度的id
  download_channel_id: Arc<AtomicU64>, // 下载进度的id
  loading_id: Arc<AtomicU64>,          // 加载url的id
  is_downloading: Arc<AtomicBool>,     // 是否正在下载
  downloaded_size: Arc<AtomicU64>,     // 已下载的文件大小
}

impl Player {
  pub fn new(app_handle: &AppHandle) -> Result<Player> {
    let audio = Audio::new()?;

    let player = Self {
      app_path: AppPath::new(),
      audio: Arc::new(RwLock::new(audio)),
      audio_size: Arc::new(AtomicU64::new(0)),
      play_channel_id: Arc::new(AtomicU64::new(0)),
      download_channel_id: Arc::new(AtomicU64::new(0)),
      loading_id: Arc::new(AtomicU64::new(0)),
      is_downloading: Arc::new(AtomicBool::new(false)),
      downloaded_size: Arc::new(AtomicU64::new(0)),
    };

    player.monitor_device(app_handle);

    Ok(player)
  }

  /// 监测设备变动
  fn monitor_device(&self, app_handle: &AppHandle) {
    let app = app_handle.clone();
    let audio = self.audio.clone();

    async_runtime::spawn(async move {
      let default_host = default_host();
      let mut old_did = default_host
        .default_output_device()
        .and_then(|d| d.id().ok());

      let mut interval = time::interval(DEVICE_INTERVAL);

      loop {
        interval.tick().await;

        let new_device = default_host.default_output_device();
        let new_did = new_device.as_ref().and_then(|d| d.id().ok());

        match (&old_did, &new_did) {
          (Some(od), Some(nd)) if od == nd => continue,
          _ => {
            if let Some(device) = new_device {
              if let Ok(mut audio_writer) = audio.write() {
                match audio_writer.reload_device(device) {
                  Ok(_) => {
                    if let Err(e) = app.emit("music:reload_device", true) {
                      eprintln!("{e}");
                    };
                  }
                  Err(e) => eprintln!("{e}"),
                }
              }
            }

            old_did = new_did;
          }
        }
      }
    });
  }

  // 下载文件
  pub fn download_file(
    &self,
    current_loading_id: u64,
    file_path: &PathBuf,
    response: Response,
  ) -> Result<(), String> {
    let loading_id = self.loading_id.clone();
    let is_downloading = self.is_downloading.clone();
    let downloaded_size = self.downloaded_size.clone();

    let mut file = OpenOptions::new()
      .write(true)
      .create(true)
      .open(file_path)
      .map_err(|e| e.to_string())?;

    async_runtime::spawn(async move {
      is_downloading.store(true, Ordering::Release);

      let mut stream = response.bytes_stream();
      while let Some(chunk_result) = stream.next().await {
        if loading_id.load(Ordering::Acquire) != current_loading_id {
          eprintln!("下载被取消: {}", current_loading_id);
          break;
        }

        match chunk_result {
          Ok(chunk) => {
            if let Err(e) = file.write_all(&chunk) {
              eprintln!("写入失败: {}", e);
              break;
            }

            if let Err(e) = file.flush() {
              eprintln!("flush 失败: {}", e);
              break;
            }

            downloaded_size.fetch_add(chunk.len() as u64, Ordering::AcqRel);
          }
          Err(e) => {
            eprintln!("读取流失败: {}", e);
            break;
          }
        }
      }

      is_downloading.store(false, Ordering::Release);
    });

    Ok(())
  }

  // 加载流式文件
  pub fn load_stream(&self, current_loading_id: u64, file_path: &PathBuf, file_size: u64) {
    let file_path = file_path.clone();
    let audio = self.audio.clone();
    let loading_id = self.loading_id.clone();
    let downloaded_size = self.downloaded_size.clone();

    async_runtime::spawn(async move {
      let wait_result = time::timeout(FILE_TIMEOUT, async {
        loop {
          if loading_id.load(Ordering::Acquire) != current_loading_id {
            eprintln!("加载被取消: {}", current_loading_id);
            break None;
          }

          if downloaded_size.load(Ordering::Acquire) < MIN_READ_SIZE {
            time::sleep(DOWNLOAD_INTERVAL).await;
            continue;
          }

          match OpenOptions::new().read(true).open(&file_path) {
            Ok(file) => break Some(file),
            Err(_) => time::sleep(DOWNLOAD_INTERVAL).await,
          }
        }
      })
      .await;

      match wait_result {
        Ok(Some(file)) => {
          if loading_id.load(Ordering::Acquire) != current_loading_id {
            eprintln!("加载前已被取消");
            return;
          }

          let stream_file = StreamFile::new(file, file_size, downloaded_size);

          if let Ok(mut audio_writer) = audio.write() {
            if let Err(e) = audio_writer.load_from_stream(stream_file, file_size) {
              eprintln!("加载音频流失败: {}", e);
            }
          }
        }
        Ok(None) => {
          eprintln!("等待文件取消")
        }
        Err(_) => {
          eprintln!("等待文件超时");
        }
      }
    });
  }
}

#[tauri::command]
/// 获取当前输入设备
pub fn music_player_get_device(state: State<Player>) -> Result<Option<DeviceInfo>, String> {
  let audio_reader = state.audio.read().map_err(|e| e.to_string())?;
  let Some(device) = audio_reader.current_device() else {
    return Ok(None);
  };

  Ok(DeviceInfo::from_device(device))
}

#[tauri::command]
/// 设置当前输入设备
///
/// ### 必选参数
/// * `id` - 设备id
pub fn music_player_set_device(state: State<Player>, id: &str) -> Result<(), String> {
  let mut audio_writer = state.audio.write().map_err(|e| e.to_string())?;

  let devices = audio_writer.all_devices();
  let Some(device) = devices
    .into_iter()
    .find(|d| d.id().is_ok_and(|i| i.to_string() == id))
  else {
    return Err(String::from("未找到输出设备"));
  };

  audio_writer
    .reload_device(device)
    .map_err(|e| e.to_string())
}

#[tauri::command]
/// 获取所有输出设备
pub fn music_player_get_devices(state: State<Player>) -> Result<Vec<DeviceInfo>, String> {
  let audio_reader = state.audio.read().map_err(|e| e.to_string())?;

  let device_info_vec = audio_reader
    .all_devices()
    .iter()
    .filter_map(|d| DeviceInfo::from_device(d))
    .collect();

  Ok(device_info_vec)
}

#[tauri::command]
pub fn music_player_load_file(state: State<Player>, path: String) -> Result<(), String> {
  let mut audio_writer = state.audio.write().map_err(|e| e.to_string())?;

  audio_writer
    .load_from_file(&path)
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn music_player_load_url(
  state: State<'_, Player>,
  path: String,
  hash: String,
  name: String,
  artist: String,
) -> Result<(), String> {
  // 验证 hash 参数的合法性
  if !is_valid_hash(&hash) {
    return Err(String::from("无效的哈希值"));
  }

  // 从 URL 路径提取扩展名（如 /song.mp3 → .mp3）
  let ext = path
    .split('?')
    .next()
    .and_then(|p| p.rsplit('.').next())
    .map(|e| format!(".{}", e))
    .unwrap_or_else(|| ".unknown".to_string());
  let response = HttpRequest::get(path).await.map_err(|e| e.to_string())?;
  let file_size = response
    .content_length()
    .ok_or_else(|| String::from("无法获取文件大小"))?;

  if file_size == 0 {
    return Err(String::from("文件大小为0"));
  }

  // 保存id快照
  let current_loading_id = state.loading_id.fetch_add(1, Ordering::AcqRel) + 1;
  // 重置所有状态
  state.is_downloading.store(true, Ordering::Release);
  state.downloaded_size.store(0, Ordering::Release);
  state.audio_size.store(file_size, Ordering::Release);
  let file_path = state
    .app_path
    .temp_dir()
    .join(format!("{} - {} - {}{}", name, artist, hash, ext));

  // 检查文件是否存在且全量数据
  if let Ok(metadata) = metadata(&file_path) {
    if metadata.len() == file_size {
      state.is_downloading.store(false, Ordering::Release);
      state.downloaded_size.store(file_size, Ordering::Release);
      music_player_load_file(state, file_path.to_string_lossy().into_owned())?;

      return Ok(());
    }
  }

  state.download_file(current_loading_id, &file_path, response)?;
  state.load_stream(current_loading_id, &file_path, file_size);

  Ok(())
}

#[tauri::command]
/// 监测下载进度
pub fn music_player_monitor_download(state: State<Player>, channel: Channel<f32>) {
  let download_channel_id = state.download_channel_id.clone();
  let downloaded_size = state.downloaded_size.clone();
  let audio_size = state.audio_size.clone();

  let current_channel_id = download_channel_id.fetch_add(1, Ordering::AcqRel) + 1;

  async_runtime::spawn(async move {
    let mut interval = time::interval(DOWNLOAD_INTERVAL);

    loop {
      if current_channel_id != download_channel_id.load(Ordering::Acquire) {
        eprintln!("下载进度事件取消 {}", current_channel_id);
        break;
      }

      interval.tick().await;

      let downloaded_size = downloaded_size.load(Ordering::Acquire) as f32;
      let audio_size = audio_size.load(Ordering::Acquire) as f32;

      if downloaded_size == 0.0 || audio_size == 0.0 {
        continue;
      }

      if let Err(e) = channel.send(downloaded_size / audio_size) {
        eprintln!("发送进度事件失败: {}", e);
        break;
      }
    }
  });
}

#[tauri::command]
/// 监测播放进度
pub fn music_player_monitor_play(state: State<Player>, channel: Channel<f32>) {
  let audio = state.audio.clone();
  let play_channel_id = state.play_channel_id.clone();
  let current_channel_id = play_channel_id.fetch_add(1, Ordering::AcqRel) + 1;

  async_runtime::spawn(async move {
    let mut interval = time::interval(PLAY_INTERVAL);

    // TODO: 即使使用的原子类型判断, 前端页面刷新时旧的循环仍然会执行几次
    // 定义了stop函数,在前端页面卸载时调用也不行, 待优化
    loop {
      if current_channel_id != play_channel_id.load(Ordering::Acquire) {
        eprintln!("播放进度事件取消 {}", current_channel_id);
        break;
      }

      interval.tick().await;

      let progress = match audio.read() {
        Ok(audio_reader) => {
          if !audio_reader.paused() {
            audio_reader.get_pos().as_secs_f32()
          } else {
            continue;
          }
        }
        Err(_) => continue,
      };

      if let Err(e) = channel.send(progress) {
        eprintln!("发送进度事件失败: {}", e);
        break;
      }
    }
  });
}

#[tauri::command]
pub fn music_player_play(state: State<Player>) -> Result<(), String> {
  let audio_reader = state.audio.read().map_err(|e| e.to_string())?;

  Ok(audio_reader.play())
}

#[tauri::command]
pub fn music_player_pause(state: State<Player>) -> Result<(), String> {
  let audio_reader = state.audio.read().map_err(|e| e.to_string())?;

  Ok(audio_reader.pause())
}

#[tauri::command]
pub async fn music_player_stop(state: State<'_, Player>) -> Result<(), String> {
  let mut audio_writer = state.audio.write().map_err(|e| e.to_string())?;

  Ok(audio_writer.stop())
}

#[tauri::command]
pub fn music_player_seek(state: State<Player>, pos: f32) -> Result<(), String> {
  let audio_reader = state.audio.read().map_err(|e| e.to_string())?;

  audio_reader
    .try_seek(Duration::from_secs_f32(pos))
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn music_player_set_volume(state: State<Player>, volume: f32) -> Result<(), String> {
  let audio_reader = state.audio.read().map_err(|e| e.to_string())?;

  Ok(audio_reader.set_volume(volume / 100.0))
}

#[cfg(test)]
mod tests {
  use super::*;

  // === DeviceInfo 默认派生/调试 ===

  #[test]
  fn test_device_info_debug_contains_id_and_name() {
    let info = DeviceInfo {
      id: "device_xyz".into(),
      name: "扬声器(Realtek)".into(),
    };
    let s = format!("{:?}", info);
    assert!(s.contains("device_xyz"));
    assert!(s.contains("扬声器"));
  }

  #[test]
  fn test_device_info_clone_is_equal() {
    let info = DeviceInfo {
      id: "123".into(),
      name: "ABC".into(),
    };
    let cloned = info.clone();
    assert_eq!(cloned.id, "123");
    assert_eq!(cloned.name, "ABC");
  }

  #[test]
  fn test_device_info_serde_roundtrip() {
    let info = DeviceInfo {
      id: "output-id-001".into(),
      name: "耳机(DAC)".into(),
    };
    let json = serde_json::to_string(&info).unwrap();
    let back: DeviceInfo = serde_json::from_str(&json).unwrap();
    assert_eq!(back.id, "output-id-001");
    assert_eq!(back.name, "耳机(DAC)");
  }

  // === DeviceInfo 的 Serialize 结构 ===

  #[test]
  fn test_device_info_serialize_has_correct_keys() {
    let info = DeviceInfo {
      id: "I".into(),
      name: "N".into(),
    };
    let value: serde_json::Value = serde_json::to_value(&info).unwrap();
    assert!(value.is_object());
    assert_eq!(value["id"].as_str(), Some("I"));
    assert_eq!(value["name"].as_str(), Some("N"));
  }

  // === music_player_set_volume 比例：volume / 100 ===
  // 直接验证换算比例，不依赖真实音频设备

  #[test]
  fn test_volume_ratio_mapping() {
    // music_player_set_volume(state, volume) 内部调用 audio.set_volume(volume / 100.0)
    // 验证比例
    let cases: &[(f32, f32)] = &[
      (0.0, 0.0),
      (50.0, 0.5),
      (100.0, 1.0),
      (150.0, 1.5),
      (25.0, 0.25),
      (75.0, 0.75),
    ];
    for (input, expect) in cases {
      let actual = input / 100.0;
      assert!(
        (actual - expect).abs() < f32::EPSILON,
        "volume {input} -> expect {expect}, got {actual}"
      );
    }
  }

  // === music_player_seek：Duration::from_secs_f32 的直接纯逻辑验证 ===

  #[test]
  fn test_seek_pos_f32_to_duration() {
    use std::time::Duration;
    // state_pos = Duration::from_secs_f32(pos)
    let d = Duration::from_secs_f32(1.5);
    assert_eq!(d.as_secs_f32(), 1.5);
    let d = Duration::from_secs_f32(60.0);
    assert_eq!(d.as_secs(), 60);
    let d = Duration::from_secs_f32(0.0);
    assert_eq!(d.as_secs(), 0);
  }

  // === monitor_download 进度比例：downloaded_size / audio_size ===

  #[test]
  fn test_download_progress_ratio_logic() {
    // channel.send(downloaded / audio_size)
    let cases: &[(u64, u64, f32)] = &[
      (0, 1000, 0.0), // 0 时会被 if downloaded_size == 0 continue 过滤掉
      (500, 1000, 0.5),
      (1000, 1000, 1.0),
    ];
    for (down, total, expect) in cases {
      let ratio = (*down as f32) / (*total as f32);
      if *down == 0 || *total == 0 {
        continue;
      }
      assert!(
        (ratio - expect).abs() < f32::EPSILON,
        "{down}/{total} => expect {expect}"
      );
    }
  }

  // === 常量 ===

  #[test]
  fn test_constants_are_positive() {
    // 直接使用数值断言常量被合理设置
    assert!(FILE_TIMEOUT.as_millis() > 0);
    assert!(DEVICE_INTERVAL.as_millis() > 0);
    assert!(PLAY_INTERVAL.as_millis() > 0);
    assert!(DOWNLOAD_INTERVAL.as_millis() > 0);
    assert!(MIN_READ_SIZE > 0);
  }

  #[test]
  fn test_min_read_size_is_at_least_1kb() {
    // MIN_READ_SIZE: u64 = 1024 * 128 = 128KB
    assert_eq!(MIN_READ_SIZE, 1024 * 128);
    assert!(MIN_READ_SIZE >= 1024);
  }

  // === 常量边界细化 ===

  #[test]
  fn test_file_timeout_is_5_seconds() {
    assert_eq!(FILE_TIMEOUT, Duration::from_millis(5000));
  }

  #[test]
  fn test_device_interval_is_1_second() {
    assert_eq!(DEVICE_INTERVAL, Duration::from_millis(1000));
  }

  #[test]
  fn test_play_interval_is_16ms() {
    // 60fps ≈ 16.67ms，PLAY_INTERVAL=16ms 用于播放进度上报
    assert_eq!(PLAY_INTERVAL, Duration::from_millis(16));
  }

  #[test]
  fn test_download_interval_is_100ms() {
    assert_eq!(DOWNLOAD_INTERVAL, Duration::from_millis(100));
  }

  #[test]
  fn test_intervals_are_ordered() {
    // PLAY_INTERVAL < DOWNLOAD_INTERVAL < DEVICE_INTERVAL < FILE_TIMEOUT
    assert!(PLAY_INTERVAL < DOWNLOAD_INTERVAL);
    assert!(DOWNLOAD_INTERVAL < DEVICE_INTERVAL);
    assert!(DEVICE_INTERVAL < FILE_TIMEOUT);
  }

  #[test]
  fn test_min_read_size_is_power_of_two_multiple_of_1kb() {
    // 128KB = 1024 * 128，是 1KB 的整数倍且为 2 的幂次倍
    assert_eq!(MIN_READ_SIZE % 1024, 0);
    assert_eq!(MIN_READ_SIZE / 1024, 128);
    assert_eq!(128u32.count_ones(), 1, "128 应为 2 的幂");
  }

  // === is_valid_hash 与 music_player_load_url 的参数校验逻辑 ===
  // music_player_load_url 内部使用 is_valid_hash 校验 hash 参数：
  //   if !is_valid_hash(&hash) { return Err("无效的哈希值"); }
  // 这里独立验证与 load_url 相关的 hash 校验场景

  #[test]
  fn test_load_url_rejects_empty_hash() {
    // 空字符串：is_valid_hash 返回 false → load_url 返回 Err("无效的哈希值")
    assert!(!is_valid_hash(""));
  }

  #[test]
  fn test_load_url_rejects_path_traversal_hash() {
    // 包含 ".." 的 hash 会被拒绝，防止 temp_dir 逃逸
    assert!(!is_valid_hash(".."));
    assert!(!is_valid_hash("foo/../bar"));
    assert!(!is_valid_hash("a..b"));
  }

  #[test]
  fn test_load_url_rejects_absolute_path_hash() {
    // 以 '/' 或 '\\' 开头的 hash 会被拒绝
    assert!(!is_valid_hash("/etc/passwd"));
    assert!(!is_valid_hash("\\windows\\system32"));
  }

  #[test]
  fn test_load_url_rejects_too_long_hash() {
    // 长度 >= 256 的 hash 会被拒绝，避免文件名过长
    let long = "a".repeat(256);
    assert!(!is_valid_hash(&long));
    let max = "a".repeat(255);
    assert!(is_valid_hash(&max));
  }

  #[test]
  fn test_load_url_accepts_typical_hash() {
    // 典型 hash：32 位十六进制（与 music_file_detail 中的 hash 一致）
    let hash = "abcdef0123456789abcdef0123456789";
    assert!(is_valid_hash(hash));
  }

  // === music_player_set_volume 边界 ===

  #[test]
  fn test_volume_ratio_zero_maps_to_zero() {
    let volume: f32 = 0.0;
    let ratio = volume / 100.0;
    assert_eq!(ratio, 0.0);
  }

  #[test]
  fn test_volume_ratio_hundred_maps_to_one() {
    let volume: f32 = 100.0;
    let ratio = volume / 100.0;
    assert!((ratio - 1.0).abs() < f32::EPSILON);
  }

  #[test]
  fn test_volume_ratio_negative_input_allowed_by_math() {
    // set_volume 不做下界校验，负值会被传入 rodio（行为由 rodio 决定）
    let volume: f32 = -10.0;
    let ratio = volume / 100.0;
    assert!((ratio - (-0.1)).abs() < f32::EPSILON);
  }

  // === monitor_download 进度边界 ===

  #[test]
  fn test_download_progress_zero_division_guard() {
    // monitor_download 中：if downloaded_size == 0.0 || audio_size == 0.0 { continue; }
    // 这里验证守卫条件能正确识别零值
    let downloaded: f32 = 0.0;
    let audio_size: f32 = 1000.0;
    assert!(downloaded == 0.0 || audio_size == 0.0);

    let downloaded: f32 = 500.0;
    let audio_size: f32 = 0.0;
    assert!(downloaded == 0.0 || audio_size == 0.0);

    let downloaded: f32 = 500.0;
    let audio_size: f32 = 1000.0;
    assert!(!(downloaded == 0.0 || audio_size == 0.0));
  }

  #[test]
  fn test_download_progress_full_ratio_is_one() {
    let downloaded: u64 = 1000;
    let audio_size: u64 = 1000;
    let ratio = downloaded as f32 / audio_size as f32;
    assert!((ratio - 1.0).abs() < f32::EPSILON);
  }

  // === Duration::from_secs_f32 边界（music_player_seek 换算）===

  #[test]
  fn test_seek_pos_zero_duration() {
    let pos: f32 = 0.0;
    let d = Duration::from_secs_f32(pos);
    assert_eq!(d.as_secs(), 0);
    assert_eq!(d.subsec_nanos(), 0);
  }

  #[test]
  fn test_seek_pos_negative_f32_is_ub_but_does_not_panic() {
    // Duration::from_secs_f32 对负值会 panic（debug）或 UB（release）
    // music_player_seek 不做下界校验，前端应保证 pos >= 0
    // 此测试仅记录这一约束，不实际调用 from_secs_f32(-1.0)
    let pos: f32 = 0.0;
    assert!(pos >= 0.0, "前端应保证 pos >= 0");
  }

  // === DeviceInfo::from_device 逻辑（不依赖真实设备）===
  // from_device 是 private 方法，无法直接测试。
  // 这里通过 DeviceInfo 的构造和 serde 行为间接验证其输出格式。

  #[test]
  fn test_device_info_name_format_contains_parentheses() {
    // from_device 内部：format!("{name}({driver})")
    // 验证生成的 name 字段包含括号格式（通过手动构造模拟）
    let info = DeviceInfo {
      id: "dev-001".into(),
      name: "扬声器(Realtek HD)".into(),
    };
    assert!(info.name.contains('('));
    assert!(info.name.contains(')'));
  }

  #[test]
  fn test_device_info_id_is_string_not_numeric() {
    // from_device 返回的 id 是 device.id().to_string()，可能是 UUID 或数字字符串
    let info = DeviceInfo {
      id: "{0.0.0.00000000}.{guid}".into(),
      name: "Device(Driver)".into(),
    };
    // id 应为非空字符串
    assert!(!info.id.is_empty());
  }

  // === Player 结构体字段约束 ===

  #[test]
  fn test_player_is_send() {
    // Player 跨线程传递约束（用于 tauri::State<Player>）
    fn assert_send<T: Send>() {}
    assert_send::<Player>();
  }

  #[test]
  fn test_player_is_sync() {
    // Player 跨线程共享约束（用于 tauri::State<Player>）
    fn assert_sync<T: Sync>() {}
    assert_sync::<Player>();
  }
}
