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
}

impl AppPath {
  pub fn new() -> Self {
    let current_dir = Self::get_current_dir();
    let temp_dir = Self::get_temp_dir(&current_dir);
    let lyric_dir = Self::get_lyric_dir(&temp_dir);
    let cover_dir = Self::get_cover_dir(&temp_dir);

    Self {
      current_dir,
      temp_dir,
      lyric_dir,
      cover_dir,
    }
  }

  fn get_current_dir() -> PathBuf {
    // In sandboxed apps (macOS), current_dir may be "/" which is read-only.
    // Use home directory as base path for cache files.
    env::home_dir().unwrap_or_else(|| env::temp_dir())
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
    ])
  }

  // pub fn current_dir(&self) -> &Path {
  //   self.current_dir.as_ref()
  // }

  pub fn temp_dir(&self) -> &Path {
    self.temp_dir.as_ref()
  }

  pub fn lyric_dir(&self) -> &Path {
    self.lyric_dir.as_ref()
  }

  pub fn cover_dir(&self) -> &Path {
    self.cover_dir.as_ref()
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
