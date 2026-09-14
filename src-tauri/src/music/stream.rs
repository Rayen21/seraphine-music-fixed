use std::{
  fs::File,
  io::{Error, ErrorKind, Read, Result, Seek, SeekFrom},
  sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
  },
  thread,
  time::{Duration, Instant},
};

// 超时时间
const TIMEOUT: Duration = Duration::from_millis(5000);
// 第一次休眠时间
const SLEEP_DURATION: Duration = Duration::from_millis(10);
// 最大休眠时间
const MAX_SLEEP_DURATION: Duration = Duration::from_millis(100);

pub struct StreamFile {
  file: File,
  file_size: u64,
  downloaded_size: Arc<AtomicU64>,
}

impl StreamFile {
  pub fn new(file: File, file_size: u64, downloaded_size: Arc<AtomicU64>) -> Self {
    Self {
      file,
      file_size,
      downloaded_size,
    }
  }

  fn wait_for_data(&self, target_position: u64) -> Result<()> {
    let start_time = Instant::now();
    let mut sleep_duration = SLEEP_DURATION;

    while target_position > self.downloaded_size.load(Ordering::Acquire) {
      if start_time.elapsed() > TIMEOUT {
        return Err(Error::new(
          ErrorKind::TimedOut,
          String::from("等待下载超时"),
        ));
      }

      thread::sleep(sleep_duration);

      if sleep_duration < MAX_SLEEP_DURATION {
        sleep_duration = (sleep_duration * 2).min(MAX_SLEEP_DURATION);
      }
    }

    Ok(())
  }
}

impl Read for StreamFile {
  fn read(&mut self, buf: &mut [u8]) -> Result<usize> {
    if buf.is_empty() {
      return Ok(0);
    }

    let current_pos = self.file.stream_position()?;
    if current_pos >= self.file_size {
      return Ok(0);
    }

    let bytes_to_read = (buf.len() as u64).min(self.file_size - current_pos);
    if bytes_to_read == 0 {
      return Ok(0);
    }

    let next_pos = current_pos + bytes_to_read;
    self.wait_for_data(next_pos)?;

    self.file.read(&mut buf[..bytes_to_read as usize])
  }
}

impl Seek for StreamFile {
  fn seek(&mut self, pos: SeekFrom) -> Result<u64> {
    let target_pos = match pos {
      SeekFrom::Start(offset) => offset.min(self.file_size),
      SeekFrom::Current(offset) => {
        let current = self.file.stream_position()?;
        if offset >= 0 {
          (current + offset as u64).min(self.file_size)
        } else {
          current.saturating_sub(offset.unsigned_abs())
        }
      }
      SeekFrom::End(offset) => {
        if offset <= 0 {
          self
            .file_size
            .saturating_sub(offset.unsigned_abs().min(self.file_size))
        } else {
          self.file_size
        }
      }
    };

    if target_pos >= self.file_size {
      return self.file.seek(SeekFrom::Start(self.file_size));
    }

    self.wait_for_data(target_pos)?;
    self.file.seek(SeekFrom::Start(target_pos))
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::sync::atomic::AtomicU64;
  use std::sync::Arc;
  use tempfile::tempdir;

  #[test]
  fn test_stream_read_empty_buf_returns_zero() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("f.bin");
    std::fs::write(&path, b"0123456789").unwrap();
    let dl = Arc::new(AtomicU64::new(10));
    let mut sf = StreamFile::new(std::fs::File::open(&path).unwrap(), 10, dl.clone());
    let mut buf = [];
    assert_eq!(sf.read(&mut buf).unwrap(), 0);
  }

  #[test]
  fn test_stream_read_position_at_end_returns_zero() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("f.bin");
    std::fs::write(&path, b"0123456789").unwrap();
    let dl = Arc::new(AtomicU64::new(10));
    let mut sf = StreamFile::new(std::fs::File::open(&path).unwrap(), 10, dl.clone());
    sf.file.seek(SeekFrom::Start(10)).unwrap();
    let mut buf = [0u8; 5];
    assert_eq!(sf.read(&mut buf).unwrap(), 0);
  }

  #[test]
  fn test_stream_read_when_past_eof_returns_zero() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("f.bin");
    std::fs::write(&path, b"0123456789").unwrap();
    let dl = Arc::new(AtomicU64::new(10));
    let mut sf = StreamFile::new(std::fs::File::open(&path).unwrap(), 10, dl.clone());
    // Seek 到 file_size 之外，被 Read 分支的 current_pos >= file_size 处理
    sf.file.seek(SeekFrom::Start(12)).unwrap();
    let mut buf = [0u8; 5];
    assert_eq!(sf.read(&mut buf).unwrap(), 0);
  }

  #[test]
  fn test_stream_read_full_buf_capped_at_remaining() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("f.bin");
    std::fs::write(&path, b"ABCDEFGH").unwrap();
    let dl = Arc::new(AtomicU64::new(8));
    let mut sf = StreamFile::new(std::fs::File::open(&path).unwrap(), 8, dl.clone());
    sf.file.seek(SeekFrom::Start(5)).unwrap();
    let mut buf = [0u8; 100]; // 大缓冲区
    let n = sf.read(&mut buf).unwrap();
    assert_eq!(n, 3);
    assert_eq!(&buf[..3], b"FGH");
  }

  #[test]
  fn test_stream_read_small_buf_exact_count() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("f.bin");
    std::fs::write(&path, b"0123456789").unwrap();
    let dl = Arc::new(AtomicU64::new(10));
    let mut sf = StreamFile::new(std::fs::File::open(&path).unwrap(), 10, dl.clone());
    let mut buf = [0u8; 3];
    let n = sf.read(&mut buf).unwrap();
    assert_eq!(n, 3);
    assert_eq!(&buf, b"012");
    let n = sf.read(&mut buf).unwrap();
    assert_eq!(n, 3);
    assert_eq!(&buf, b"345");
  }

  // --- Seek 纯逻辑分支（无等待时，因 downloaded_size >= file_size）

  #[test]
  fn test_stream_seek_start_within_range() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("f.bin");
    std::fs::write(&path, b"0123456789").unwrap();
    let dl = Arc::new(AtomicU64::new(10));
    let mut sf = StreamFile::new(std::fs::File::open(&path).unwrap(), 10, dl.clone());
    let pos = sf.seek(SeekFrom::Start(3)).unwrap();
    assert_eq!(pos, 3);
    let mut buf = [0u8; 4];
    sf.read(&mut buf).unwrap();
    assert_eq!(&buf, b"3456");
  }

  #[test]
  fn test_stream_seek_start_beyond_size_clamps() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("f.bin");
    std::fs::write(&path, b"0123456789").unwrap();
    let dl = Arc::new(AtomicU64::new(10));
    let mut sf = StreamFile::new(std::fs::File::open(&path).unwrap(), 10, dl.clone());
    let pos = sf.seek(SeekFrom::Start(999)).unwrap();
    assert_eq!(pos, 10);
  }

  #[test]
  fn test_stream_seek_current_positive() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("f.bin");
    std::fs::write(&path, b"0123456789").unwrap();
    let dl = Arc::new(AtomicU64::new(10));
    let mut sf = StreamFile::new(std::fs::File::open(&path).unwrap(), 10, dl.clone());
    sf.seek(SeekFrom::Start(2)).unwrap();
    let pos = sf.seek(SeekFrom::Current(5)).unwrap();
    assert_eq!(pos, 7);
  }

  #[test]
  fn test_stream_seek_current_positive_clamps_to_end() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("f.bin");
    std::fs::write(&path, b"0123456789").unwrap();
    let dl = Arc::new(AtomicU64::new(10));
    let mut sf = StreamFile::new(std::fs::File::open(&path).unwrap(), 10, dl.clone());
    sf.seek(SeekFrom::Start(5)).unwrap();
    let pos = sf.seek(SeekFrom::Current(1000)).unwrap();
    assert_eq!(pos, 10);
  }

  #[test]
  fn test_stream_seek_current_negative() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("f.bin");
    std::fs::write(&path, b"0123456789").unwrap();
    let dl = Arc::new(AtomicU64::new(10));
    let mut sf = StreamFile::new(std::fs::File::open(&path).unwrap(), 10, dl.clone());
    sf.seek(SeekFrom::Start(8)).unwrap();
    let pos = sf.seek(SeekFrom::Current(-3)).unwrap();
    assert_eq!(pos, 5);
  }

  #[test]
  fn test_stream_seek_current_negative_saturates_at_zero() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("f.bin");
    std::fs::write(&path, b"0123456789").unwrap();
    let dl = Arc::new(AtomicU64::new(10));
    let mut sf = StreamFile::new(std::fs::File::open(&path).unwrap(), 10, dl.clone());
    sf.seek(SeekFrom::Start(2)).unwrap();
    let pos = sf.seek(SeekFrom::Current(-1000)).unwrap();
    assert_eq!(pos, 0);
  }

  #[test]
  fn test_stream_seek_end_negative() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("f.bin");
    std::fs::write(&path, b"0123456789").unwrap();
    let dl = Arc::new(AtomicU64::new(10));
    let mut sf = StreamFile::new(std::fs::File::open(&path).unwrap(), 10, dl.clone());
    let pos = sf.seek(SeekFrom::End(-3)).unwrap();
    assert_eq!(pos, 7);
    let mut buf = [0u8; 3];
    sf.read(&mut buf).unwrap();
    assert_eq!(&buf, b"789");
  }

  #[test]
  fn test_stream_seek_end_zero_is_eof() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("f.bin");
    std::fs::write(&path, b"0123456789").unwrap();
    let dl = Arc::new(AtomicU64::new(10));
    let mut sf = StreamFile::new(std::fs::File::open(&path).unwrap(), 10, dl.clone());
    let pos = sf.seek(SeekFrom::End(0)).unwrap();
    assert_eq!(pos, 10);
    let mut buf = [0u8; 5];
    assert_eq!(sf.read(&mut buf).unwrap(), 0);
  }

  #[test]
  fn test_stream_seek_end_positive_clamps_to_size() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("f.bin");
    std::fs::write(&path, b"0123456789").unwrap();
    let dl = Arc::new(AtomicU64::new(10));
    let mut sf = StreamFile::new(std::fs::File::open(&path).unwrap(), 10, dl.clone());
    let pos = sf.seek(SeekFrom::End(7)).unwrap();
    assert_eq!(pos, 10);
  }

  #[test]
  fn test_stream_seek_end_negative_saturates_at_zero() {
    // 从末端回退超过长度 -> 0
    let dir = tempdir().unwrap();
    let path = dir.path().join("f.bin");
    std::fs::write(&path, b"0123456789").unwrap();
    let dl = Arc::new(AtomicU64::new(10));
    let mut sf = StreamFile::new(std::fs::File::open(&path).unwrap(), 10, dl.clone());
    let pos = sf.seek(SeekFrom::End(-9999)).unwrap();
    assert_eq!(pos, 0);
  }

  // === Read + Seek 综合场景 ===

  #[test]
  fn test_stream_seek_start_and_read_two_chunks() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("f.bin");
    let data: Vec<u8> = (0u8..=255).collect();
    std::fs::write(&path, &data).unwrap();
    let dl = Arc::new(AtomicU64::new(256));
    let mut sf = StreamFile::new(std::fs::File::open(&path).unwrap(), 256, dl.clone());
    // 从位置 100 读 10 字节
    sf.seek(SeekFrom::Start(100)).unwrap();
    let mut buf = [0u8; 10];
    sf.read(&mut buf).unwrap();
    assert_eq!(buf, [100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
    // 再从位置 200 读 10 字节
    sf.seek(SeekFrom::Start(200)).unwrap();
    sf.read(&mut buf).unwrap();
    assert_eq!(buf, [200, 201, 202, 203, 204, 205, 206, 207, 208, 209]);
  }

  // === 超时：wait_for_data 无法在无真实并发下触发（除非把 timeout 调得非常短）
  // 为避免用真实 thread::sleep 拖慢单测，这里不再覆盖 TimedOut 分支。
}
