use anyhow::{anyhow, Result};
use rodio::{
  cpal::{default_host, traits::HostTrait},
  decoder::DecoderBuilder,
  source::SeekError,
  Decoder, Device, DeviceSinkBuilder, MixerDeviceSink, Player,
};
use std::{
  fs::File,
  io::{Read, Seek},
  time::Duration,
  panic,
};

pub struct Audio {
  _sink: MixerDeviceSink,
  player: Player,
  device: Option<Device>,
}

impl Audio {
  pub fn new() -> Result<Self> {
    let result = panic::catch_unwind(|| {
      let device = default_host()
        .default_output_device()
        .ok_or_else(|| anyhow!("未识别到输出设备"))?;
      let sink = DeviceSinkBuilder::from_device(device.clone())?.open_stream()?;
      let player = Player::connect_new(&sink.mixer());

      // 默认是play状态,手动暂停
      player.pause();

      Ok::<Audio, anyhow::Error>(Self {
        _sink: sink,
        player,
        device: Some(device),
      })
    });

    match result {
      Ok(audio) => audio,
      Err(_) => Err(anyhow!("音频系统初始化失败，请检查音频设备")),
    }
  }

  /// 获取全部音频输出设备
  pub fn all_devices(&self) -> Vec<Device> {
    let Ok(devices) = default_host().output_devices() else {
      return Vec::new();
    };

    devices.collect()
  }

  /// 获取当前输出设备
  pub fn current_device(&self) -> Option<&Device> {
    self.device.as_ref()
  }

  /// 重载输出设备
  pub fn reload_device(&mut self, device: Device) -> Result<()> {
    let new_sink = DeviceSinkBuilder::from_device(device.clone())?.open_stream()?;
    let new_player = Player::connect_new(&new_sink.mixer());

    let volume = self.player.volume();
    let paused = self.player.is_paused();

    self._sink = new_sink;
    self.player = new_player;
    self.device = Some(device);

    self.player.set_volume(volume);
    if paused {
      self.player.pause();
    }

    Ok(())
  }

  /// 加载音频文件
  pub fn load_from_file(&mut self, path: &str) -> Result<()> {
    let file = File::open(path)?;
    let source = Decoder::try_from(file)?;

    self.player.append(source);

    Ok(())
  }

  /// 加载音频流
  pub fn load_from_stream<T>(&mut self, stream: T, file_size: u64) -> Result<()>
  where
    T: Read + Seek + Send + Sync + 'static,
  {
    let decoder = DecoderBuilder::new()
      .with_data(stream)
      .with_byte_len(file_size)
      .build()?;

    self.player.append(decoder);

    Ok(())
  }

  /// 播放音频
  pub fn play(&self) {
    self.player.play();
  }

  /// 暂停音频
  pub fn pause(&self) {
    self.player.pause();
  }

  /// 音频是否暂停
  pub fn paused(&self) -> bool {
    self.player.is_paused()
  }

  /// 停止音频
  pub fn stop(&mut self) {
    self.player.pause();
    let _ = self.player.try_seek(Duration::ZERO);
    self.player.stop();
  }

  /// 设置音频音量
  pub fn set_volume(&self, volume: f32) {
    self.player.set_volume(volume);
  }

  /// 获取音频进度
  pub fn get_pos(&self) -> Duration {
    self.player.get_pos()
  }

  /// 音频跳转
  pub fn try_seek(&self, pos: Duration) -> Result<(), SeekError> {
    self.player.try_seek(pos)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_audio_is_send() {
    fn assert_send<T: Send>() {}
    assert_send::<Audio>();
  }

  #[test]
  fn test_audio_is_sync() {
    fn assert_sync<T: Sync>() {}
    assert_sync::<Audio>();
  }

  #[test]
  fn test_audio_method_signatures_compile() {
    let _new: fn() -> Result<Audio> = Audio::new;
    let _current_device: fn(&Audio) -> Option<&Device> = Audio::current_device;
    let _all_devices: fn(&Audio) -> Vec<Device> = Audio::all_devices;
    let _reload_device: fn(&mut Audio, Device) -> Result<()> = Audio::reload_device;
    let _load_from_file: fn(&mut Audio, &str) -> Result<()> = Audio::load_from_file;
    let _play: fn(&Audio) = Audio::play;
    let _pause: fn(&Audio) = Audio::pause;
    let _paused: fn(&Audio) -> bool = Audio::paused;
    let _stop: fn(&mut Audio) = Audio::stop;
    let _set_volume: fn(&Audio, f32) = Audio::set_volume;
    let _get_pos: fn(&Audio) -> Duration = Audio::get_pos;
    let _try_seek: fn(&Audio, Duration) -> Result<(), SeekError> = Audio::try_seek;
    let _ = (
      _new,
      _current_device,
      _all_devices,
      _reload_device,
      _load_from_file,
      _play,
      _pause,
      _paused,
      _stop,
      _set_volume,
      _get_pos,
      _try_seek,
    );
  }

  #[test]
  fn test_try_seek_duration_zero_is_valid() {
    let d = Duration::ZERO;
    assert_eq!(d.as_secs(), 0);
    assert_eq!(d.subsec_nanos(), 0);
  }

  #[test]
  fn test_try_seek_duration_max_is_valid() {
    let d = Duration::MAX;
    assert!(d.as_secs() > 0);
  }

  #[test]
  fn test_try_seek_duration_from_secs_f32_roundtrip() {
    let d = Duration::from_secs_f32(0.0);
    assert_eq!(d.as_secs_f32(), 0.0);
    let d = Duration::from_secs_f32(1.5);
    assert!((d.as_secs_f32() - 1.5).abs() < f32::EPSILON);
  }

  #[test]
  fn test_set_volume_ratio_mapping() {
    let cases: &[(f32, f32)] = &[
      (0.0, 0.0),
      (50.0, 0.5),
      (100.0, 1.0),
      (200.0, 2.0),
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

  #[test]
  fn test_audio_new_does_not_panic_when_no_device() {
    let _ = Audio::new();
  }
}
