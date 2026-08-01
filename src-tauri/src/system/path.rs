use std::{
  env,
  fs::{self, read_dir, remove_file},
  path::{Path, PathBuf},
  process::Command,
};

use serde::{Deserialize, Serialize};

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
    env::current_dir().unwrap_or_else(|_| env::home_dir().unwrap_or_else(|| env::temp_dir()))
  }

  fn get_temp_dir(current_dir: &Path) -> PathBuf {
    let temp_dir = current_dir.join("Temp");

    if !temp_dir.exists() {
      if let Err(_) = fs::create_dir_all(&temp_dir) {
        return env::temp_dir();
      }
    }

    temp_dir
  }

  fn get_lyric_dir(temp_dir: &Path) -> PathBuf {
    let lyric_dir = temp_dir.join("lyrics");

    if !lyric_dir.exists() {
      if let Err(_) = fs::create_dir_all(&lyric_dir) {
        return temp_dir.to_path_buf();
      }
    }

    lyric_dir
  }

  fn get_cover_dir(temp_dir: &Path) -> PathBuf {
    let cover_dir = temp_dir.join("covers");

    if !cover_dir.exists() {
      if let Err(_) = fs::create_dir_all(&cover_dir) {
        return temp_dir.to_path_buf();
      }
    }

    cover_dir
  }

  pub fn temp_dir(&self) -> &Path {
    &self.temp_dir
  }

  pub fn lyric_dir(&self) -> &Path {
    &self.lyric_dir
  }

  pub fn cover_dir(&self) -> &Path {
    &self.cover_dir
  }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppPathMap {
  temp: String,
  lyric: String,
  cover: String,
}

#[tauri::command]
pub async fn system_path_all() -> Result<AppPathMap, String> {
  let app_path = AppPath::new();

  Ok(AppPathMap {
    temp: app_path.temp_dir().to_string_lossy().to_string(),
    lyric: app_path.lyric_dir().to_string_lossy().to_string(),
    cover: app_path.cover_dir().to_string_lossy().to_string(),
  })
}

#[tauri::command]
/// 打开文件所在位置
pub fn system_path_file_open(path: &str) -> Result<(), String> {
  if path.trim().is_empty() {
    return Err(String::from("文件路径不能为空"));
  }

  #[cfg(target_os = "windows")]
  {
    Command::new("explorer")
      .args(["/select,", path])
      .spawn()
      .map_err(|_| String::from("打开失败"))?;
  };

  #[cfg(target_os = "macos")]
  {
    Command::new("open")
      .arg("-R")
      .arg(path)
      .spawn()
      .map_err(|_| String::from("打开失败"))?;
  };

  #[cfg(target_os = "linux")]
  {
    let parent = Path::new(path)
      .parent()
      .ok_or_else(|| String::from("打开失败"))?;
    Command::new("xdg-open")
      .arg(parent)
      .spawn()
      .map_err(|_| String::from("打开失败"))?;
  };

  Ok(())
}

#[tauri::command]
/// 打开目录
pub fn system_path_dir_open(path: &str) -> Result<(), String> {
  if path.trim().is_empty() {
    return Err(String::from("目录路径不能为空"));
  }

  #[cfg(target_os = "windows")]
  {
    Command::new("explorer")
      .arg(path)
      .spawn()
      .map_err(|_| String::from("打开失败"))?;
  };

  #[cfg(target_os = "macos")]
  {
    Command::new("open")
      .arg(path)
      .spawn()
      .map_err(|_| String::from("打开失败"))?;
  };

  #[cfg(target_os = "linux")]
  {
    Command::new("xdg-open")
      .arg(path)
      .spawn()
      .map_err(|_| String::from("打开失败"))?;
  };

  Ok(())
}

#[tauri::command]
/// 清理目录下的文件
pub fn system_path_dir_clear(dir_path: &str) -> Result<(), String> {
  if dir_path.trim().is_empty() {
    return Err(String::from("目录路径不能为空"));
  }

  let dir = Path::new(dir_path);
  if !dir.exists() {
    return Err(String::from("目录不存在"));
  }
  if !dir.is_dir() {
    return Err(String::from("不是目录路径"));
  }

  let entries = read_dir(dir).map_err(|_| String::from("读取目录失败"))?;
  for entry in entries {
    let entry = entry.map_err(|_| String::from("读取目录项失败"))?;
    let path = entry.path();
    // 仅删除文件
    if path.is_file() {
      remove_file(&path).map_err(|_| format!("删除文件失败: {}", path.display()))?;
    }
  }

  Ok(())
}
