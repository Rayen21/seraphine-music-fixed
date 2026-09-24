use tauri::{AppHandle, Manager};

/// 隐藏主窗口（回到托盘）
#[tauri::command]
pub fn hide_window(app: AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.hide();
  }
}

/// 隐藏整个应用（回到托盘）
#[tauri::command]
pub fn hide_app(app: AppHandle) {
  let _ = app.hide();
}
