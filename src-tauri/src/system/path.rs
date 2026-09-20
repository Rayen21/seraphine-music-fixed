use std::{
  collections::HashMap,
  env,
  fs,
  path::{Path, PathBuf},
};

use std::sync::{Mutex, OnceLock};

use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

pub struct AppPath {
  current_dir: PathBuf,
  temp_base: PathBuf,
  lyric_dir: PathBuf,
  cover_dir: PathBuf,
  custom_audio_dir: Option<PathBuf>,
  custom_lyric_dir: Option<PathBuf>,
  custom_cover_dir: Option<PathBuf>,
}

/// 从 Tauri Store 持久化存储的路径（跨进程共享）
const PERSISTED_CUSTOM_DIRS_KEY: &str = "system_path_custom_dirs";
static PERSISTED_CUSTOM_DIRS: OnceLock<Mutex<HashMap<String, PathBuf>>> = OnceLock::new();

impl AppPath {
  pub fn new() -> Self {
    let temp_base = Self::get_temp_base();
    let lyric_dir = Self::get_lyric_dir(&temp_base);
    let cover_dir = Self::get_cover_dir(&temp_base);

    let (custom_audio_dir, custom_lyric_dir, custom_cover_dir) =
      Self::get_persisted_custom_dirs();

    Self {
      current_dir: temp_base.clone(),
      temp_base,
      lyric_dir,
      cover_dir,
      custom_audio_dir: custom_audio_dir.map(|p| PathBuf::from(p)),
      custom_lyric_dir: custom_lyric_dir.map(|p| PathBuf::from(p)),
      custom_cover_dir: custom_cover_dir.map(|p| PathBuf::from(p)),
    }
  }

  /// 获取基础目录：优先使用 ~/.seraphine-music，不可写时 fallback 到系统 temp
  fn get_temp_base() -> PathBuf {
    let home_dir = env::home_dir().map(|d| d.join(".seraphine-music"));
    if let Some(path) = home_dir {
      if path.exists() || fs::create_dir_all(&path).is_ok() {
        return path;
      }
    }
    // fallback: 系统临时目录（始终可写）
    env::temp_dir()
  }

  fn get_lyric_dir(temp_base: &PathBuf) -> PathBuf {
    let lyric_dir = temp_base.join("lyrics");
    if !lyric_dir.exists() {
      let _ = fs::create_dir_all(&lyric_dir);
    }
    lyric_dir
  }

  fn get_cover_dir(temp_base: &PathBuf) -> PathBuf {
    let cover_dir = temp_base.join("covers");
    if !cover_dir.exists() {
      let _ = fs::create_dir_all(&cover_dir);
    }
    cover_dir
  }

  fn get_persisted_custom_dirs() -> (Option<PathBuf>, Option<PathBuf>, Option<PathBuf>) {
    let dirs = PERSISTED_CUSTOM_DIRS.get_or_init(|| Mutex::new(HashMap::new())).lock().unwrap();
    (
      dirs.get("audio").cloned(),
      dirs.get("lyric").cloned(),
      dirs.get("cover").cloned(),
    )
  }

  /// 从 Tauri Store 恢复持久化路径
  pub fn load_persisted_custom_dirs(&mut self, app_handle: &AppHandle) {
    let dirs = Self::load_from_store(app_handle);
    for (key, val) in dirs {
      PERSISTED_CUSTOM_DIRS.get_or_init(|| Mutex::new(HashMap::new())).lock().unwrap().insert(key.clone(), PathBuf::from(&val));
      match key.as_str() {
        "audio" => self.custom_audio_dir = Some(PathBuf::from(val)),
        "lyric" => self.custom_lyric_dir = Some(PathBuf::from(val)),
        "cover" => self.custom_cover_dir = Some(PathBuf::from(val)),
        _ => {}
      }
    }
  }

  /// 从 Store 读取持久化路径
  fn load_from_store(app_handle: &AppHandle) -> HashMap<String, String> {
    const STORE_PATH: &str = "config.json";
    let Ok(store) = app_handle.store(STORE_PATH) else {
      return HashMap::new();
    };
    match store.get(PERSISTED_CUSTOM_DIRS_KEY) {
      Some(val) => {
        if let Ok(map) = serde_json::from_value::<HashMap<String, String>>(val) {
          map
        } else {
          HashMap::new()
        }
      }
      None => HashMap::new(),
    }
  }

  /// 将自定义路径写入 Store
  fn save_to_store(app_handle: &AppHandle, dirs: &HashMap<String, String>) {
    const STORE_PATH: &str = "config.json";
    let Ok(store) = app_handle.store(STORE_PATH) else {
      return;
    };
    store.set(PERSISTED_CUSTOM_DIRS_KEY, serde_json::json!(dirs));
    let _ = store.save();
  }

  pub fn to_hashmap(&self) -> HashMap<String, String> {
    HashMap::from_iter([
      (
        String::from("current_dir"),
        self.current_dir.to_string_lossy().to_string(),
      ),
      (
        String::from("temp_dir"),
        self.temp_base.to_string_lossy().to_string(),
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
    self.temp_base.as_ref()
  }

  pub fn lyric_dir(&self) -> &Path {
    self.lyric_dir.as_ref()
  }

  pub fn cover_dir(&self) -> &Path {
    self.cover_dir.as_ref()
  }

  pub fn set_custom_dir(
    &mut self,
    app_handle: &AppHandle,
    name: &str,
    dir: &str,
  ) -> Result<(), String> {
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

    // 更新当前实例
    match name {
      "audio" => self.custom_audio_dir = Some(path.to_path_buf()),
      "lyric" => self.custom_lyric_dir = Some(path.to_path_buf()),
      "cover" => self.custom_cover_dir = Some(path.to_path_buf()),
      _ => return Err(format!("未知的目录类型: {}", name)),
    }

    // 更新内存缓存
    let mut dirs = PERSISTED_CUSTOM_DIRS.get_or_init(|| Mutex::new(HashMap::new())).lock().unwrap();
    dirs.insert(name.to_string(), path.to_path_buf());

    // 持久化到 Tauri Store（跨进程共享）
    Self::save_to_store(app_handle, &dirs);

    Ok(())
  }

  pub fn get_audio_dir(&self) -> &Path {
    self
      .custom_audio_dir
      .as_ref()
      .map(|p| p.as_path())
      .unwrap_or(self.temp_base.as_path())
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

  pub fn reset_custom_dirs(&mut self, app_handle: &AppHandle) {
    let mut dirs = PERSISTED_CUSTOM_DIRS.get_or_init(|| Mutex::new(HashMap::new())).lock().unwrap();
    dirs.clear();
    self.custom_audio_dir = None;
    self.custom_lyric_dir = None;
    self.custom_cover_dir = None;

    // 清除 Store 中的持久化数据
    const STORE_PATH: &str = "config.json";
    let Ok(store) = app_handle.store(STORE_PATH) else {
      return;
    };
    store.set(PERSISTED_CUSTOM_DIRS_KEY, serde_json::json!({}));
    let _ = store.save();
  }
}

#[tauri::command]
/// 获取所有目录路径（含持久化的自定义路径）
pub fn system_path_all(app_handle: tauri::AppHandle) -> HashMap<String, String> {
  let mut paths = AppPath::new();
  paths.load_persisted_custom_dirs(&app_handle);
  paths.to_hashmap()
}

#[tauri::command]
/// 设置自定义缓存目录（持久化到 Tauri Store）
pub fn system_path_set_custom_dir(
  app_handle: tauri::AppHandle,
  name: &str,
  dir: &str,
) -> Result<(), String> {
  let mut paths = AppPath::new();
  paths.load_persisted_custom_dirs(&app_handle);
  paths.set_custom_dir(&app_handle, name, dir)
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
