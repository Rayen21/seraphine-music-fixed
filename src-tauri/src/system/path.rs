use std::{
  collections::HashMap,
  env, fs,
  path::{Path, PathBuf},
};

pub struct AppPath {
  current_dir: PathBuf,
  temp_dir: PathBuf,
  lyric_dir: PathBuf,
  cover_dir: PathBuf,
  custom_audio_dir: Option<PathBuf>,
  custom_lyric_dir: Option<PathBuf>,
  custom_cover_dir: Option<PathBuf>,
}

static CUSTOM_DIRS: std::sync::Mutex<HashMap<String, String>> = std::sync::Mutex::new(HashMap::new());

impl AppPath {
  pub fn new() -> Self {
    let current_dir = Self::get_current_dir();
    let temp_dir = Self::get_temp_dir(&current_dir);
    let lyric_dir = Self::get_lyric_dir(&temp_dir);
    let cover_dir = Self::get_cover_dir(&temp_dir);

    // 检查自定义路径
    let custom_dirs = CUSTOM_DIRS.lock().unwrap();
    let custom_audio_dir = custom_dirs.get("audio").cloned();
    let custom_lyric_dir = custom_dirs.get("lyric").cloned();
    let custom_cover_dir = custom_dirs.get("cover").cloned();
    drop(custom_dirs);

    Self {
      current_dir,
      temp_dir,
      lyric_dir,
      cover_dir,
      custom_audio_dir: custom_audio_dir.map(|p| PathBuf::from(p)),
      custom_lyric_dir: custom_lyric_dir.map(|p| PathBuf::from(p)),
      custom_cover_dir: custom_cover_dir.map(|p| PathBuf::from(p)),
    }
  }

  fn get_current_dir() -> PathBuf {
    env::current_dir().unwrap_or_else(|_| env::home_dir().unwrap_or_else(|| env::temp_dir()))
  }

  fn get_temp_dir(current_dir: &PathBuf) -> PathBuf {
    let temp_dir = current_dir.join("Temp");

    if !temp_dir.exists() {
      if let Err(_) = fs::create_dir_all(&temp_dir) {
        return current_dir.clone();
      }
    }

    temp_dir
  }

  fn get_lyric_dir(temp_dir: &PathBuf) -> PathBuf {
    let lyric_dir = temp_dir.join("lyrics");

    if !lyric_dir.exists() {
      if let Err(_) = fs::create_dir_all(&lyric_dir) {
        return temp_dir.clone();
      }
    }

    lyric_dir
  }

  fn get_cover_dir(temp_dir: &PathBuf) -> PathBuf {
    let cover_dir = temp_dir.join("covers");

    if !cover_dir.exists() {
      if let Err(_) = fs::create_dir_all(&cover_dir) {
        return temp_dir.clone();
      }
    }

    cover_dir
  }

  pub fn to_hashmap(&self) -> HashMap<String, String> {
    HashMap::from_iter([
      (
        String::from("current_dir"),
        self.current_dir.to_string_lossy().to_string(),
      ),
      (
        String::from("temp_dir"),
        self.temp_dir.to_string_lossy().to_string(),
      ),
      (
        String::from("lyric_dir"),
        self.lyric_dir.to_string_lossy().to_string(),
      ),
      (
        String::from("cover_dir"),
        self.cover_dir.to_string_lossy().to_string(),
      ),
      (
        String::from("custom_audio_dir"),
        self.custom_audio_dir
          .as_ref()
          .map(|p| p.to_string_lossy().to_string())
          .unwrap_or_default(),
      ),
      (
        String::from("custom_lyric_dir"),
        self.custom_lyric_dir
          .as_ref()
          .map(|p| p.to_string_lossy().to_string())
          .unwrap_or_default(),
      ),
      (
        String::from("custom_cover_dir"),
        self.custom_cover_dir
          .as_ref()
          .map(|p| p.to_string_lossy().to_string())
          .unwrap_or_default(),
      ),
    ])
  }

  pub fn temp_dir(&self) -> &Path {
    self.temp_dir.as_ref()
  }

  pub fn lyric_dir(&self) -> &Path {
    self.lyric_dir.as_ref()
  }

  pub fn cover_dir(&self) -> &Path {
    self.cover_dir.as_ref()
  }

  pub fn set_custom_dir(&mut self, name: &str, dir: &str) -> Result<(), String> {
    if dir.trim().is_empty() {
      return Err(String::from("目录路径不能为空"));
    }
    let path = Path::new(dir);
    if !path.exists() {
      return Err(String::from("目录不存在"));
    }
    if !path.is_dir() {
      return Err(String::from("不是目录路径"));
    }
    if !path.is_absolute() {
      return Err(String::from("路径必须为绝对路径"));
    }

    match name {
      "audio" => self.custom_audio_dir = Some(path.to_path_buf()),
      "lyric" => self.custom_lyric_dir = Some(path.to_path_buf()),
      "cover" => self.custom_cover_dir = Some(path.to_path_buf()),
      _ => return Err(format!("未知的目录类型: {}", name)),
    }

    // 写入静态存储，使同一进程内后续 AppPath 实例生效
    let mut dirs = CUSTOM_DIRS.lock().unwrap();
    dirs.insert(name.to_string(), dir.to_string());

    Ok(())
  }

  pub fn get_audio_dir(&self) -> &Path {
    self
      .custom_audio_dir
      .as_ref()
      .map(|p| p.as_path())
      .unwrap_or(self.temp_dir.as_path())
  }

  pub fn get_lyric_dir_path(&self) -> &Path {
    self
      .custom_lyric_dir
      .as_ref()
      .map(|p| p.as_path())
      .unwrap_or(self.lyric_dir.as_path())
  }

  pub fn get_cover_dir_path(&self) -> &Path {
    self
      .custom_cover_dir
      .as_ref()
      .map(|p| p.as_path())
      .unwrap_or(self.cover_dir.as_path())
  }

  pub fn reset_custom_dirs(&mut self) {
    self.custom_audio_dir = None;
    self.custom_lyric_dir = None;
    self.custom_cover_dir = None;
    let mut dirs = CUSTOM_DIRS.lock().unwrap();
    dirs.clear();
  }
}

#[tauri::command]
/// 获取所有目录路径
pub fn system_path_all() -> HashMap<String, String> {
  AppPath::new().to_hashmap()
}

#[tauri::command]
/// 清理目录下的文件
pub fn system_path_clear(dir_path: &str) -> Result<(), String> {
  if dir_path.trim().is_empty() {
    return Err(String::from("目录路径不能为空"));
  }

  let path = Path::new(dir_path);
  if !path.exists() {
    return Err(String::from("目录不存在"));
  }
  if !path.is_dir() {
    return Err(String::from("不是目录路径"));
  }

  let entries = fs::read_dir(path).map_err(|_| String::from("读取目录失败"))?;
  for entry in entries {
    let entry = entry.map_err(|_| String::from("读取目录项失败"))?;
    let path = entry.path();
    // 仅删除文件
    if path.is_file() {
      fs::remove_file(&path).map_err(|_| format!("删除文件失败: {}", path.display()))?;
    }
  }

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_app_path_to_hashmap_has_all_keys() {
    let paths = AppPath::new().to_hashmap();
    assert!(paths.contains_key("current_dir"));
    assert!(paths.contains_key("temp_dir"));
    assert!(paths.contains_key("lyric_dir"));
    assert!(paths.contains_key("cover_dir"));
    assert!(paths.contains_key("custom_audio_dir"));
    assert!(paths.contains_key("custom_lyric_dir"));
    assert!(paths.contains_key("custom_cover_dir"));
  }

  #[test]
  fn test_custom_dirs_are_empty_by_default() {
    let paths = AppPath::new().to_hashmap();
    assert_eq!(paths["custom_audio_dir"], "");
    assert_eq!(paths["custom_lyric_dir"], "");
    assert_eq!(paths["custom_cover_dir"], "");
  }

  #[test]
  fn test_set_custom_dir_rejects_empty() {
    let mut paths = AppPath::new();
    assert!(paths.set_custom_dir("audio", "").is_err());
  }

  #[test]
  fn test_set_custom_dir_rejects_relative_path() {
    let mut paths = AppPath::new();
    let result = paths.set_custom_dir("audio", "foo/bar");
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("绝对路径"));
  }

  #[test]
  fn test_set_custom_dir_rejects_nonexistent() {
    let mut paths = AppPath::new();
    let result = paths.set_custom_dir("audio", "/nonexistent/path/12345");
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("不存在"));
  }

  #[test]
  fn test_set_custom_dir_rejects_file() {
    let mut paths = AppPath::new();
    let result = paths.set_custom_dir("audio", "/etc/hosts");
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("不是目录路径"));
  }

  #[test]
  fn test_reset_custom_dirs_clears_all() {
    let mut paths = AppPath::new();
    paths.reset_custom_dirs();
    let map = paths.to_hashmap();
    assert_eq!(map["custom_audio_dir"], "");
    assert_eq!(map["custom_lyric_dir"], "");
    assert_eq!(map["custom_cover_dir"], "");
  }
}

#[tauri::command]
/// 设置自定义缓存目录
pub fn system_path_set_custom_dir(name: &str, dir: &str) -> Result<(), String> {
  let mut paths = AppPath::new();
  paths.set_custom_dir(name, dir)
}
