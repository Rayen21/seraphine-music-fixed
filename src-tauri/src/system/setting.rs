use tauri::{LogicalSize, Runtime, Size, Window};

const RESTORE_WIDTH: f64 = 1152.0;
const RESTORE_HEIGHT: f64 = 768.0;

#[tauri::command]
pub async fn system_setting_restore_window<R: Runtime>(window: Window<R>) -> Result<(), String> {
  let _ = window.unmaximize();
  let _ = window.set_fullscreen(false);
  let _ = window.set_size(Size::Logical(LogicalSize {
    width: RESTORE_WIDTH,
    height: RESTORE_HEIGHT,
  }));
  let _ = window.center();

  Ok(())
}
