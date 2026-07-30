use tauri::{AppHandle, LogicalSize, Runtime, Size, Window};

/// 获取 tauri.conf.json 中的应用版本
#[tauri::command]
pub async fn get_app_version(app: AppHandle) -> Result<String, String> {
  Ok(app.package_info().version.to_string())
}

#[tauri::command]
pub async fn system_setting_restore_window<R: Runtime>(window: Window<R>) -> Result<(), String> {
  window.unmaximize().map_err(|e| e.to_string())?;
  window.set_fullscreen(false).map_err(|e| e.to_string())?;
  window
    .set_size(Size::Logical(LogicalSize {
      width: 1152.0,
      height: 768.0,
    }))
    .map_err(|e| e.to_string())?;
  window.center().map_err(|e| e.to_string())?;

  Ok(())
}
