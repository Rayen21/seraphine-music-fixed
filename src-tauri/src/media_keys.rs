use tauri::{Emitter, AppHandle};
use std::sync::{Arc, Mutex};

static APP_HANDLE: Arc<Mutex<Option<AppHandle>>> = Arc::new(Mutex::new(None));

#[cfg(target_os = "macos")]
static MEDIA_CONTROLS: Arc<Mutex<Option<souvlaki::MediaControls>>> = Arc::new(Mutex::new(None));

/// 注册媒体键（macOS 使用 souvlaki，其他平台使用 Tauri hotkey）
#[cfg(target_os = "macos")]
pub fn init(app: &AppHandle) {
    *APP_HANDLE.lock().unwrap() = Some(app.clone());

    if let Ok(controls) = souvlaki::MediaControls::default()
        .set_play(|_| emit_media_key("play"))
        .set_pause(|_| emit_media_key("pause"))
        .set_next_track(|_| emit_media_key("next"))
        .set_previous_track(|_| emit_media_key("prev"))
    {
        // 将 controls 存入静态变量保持其存活
        *MEDIA_CONTROLS.lock().unwrap() = Some(controls);
    } else {
        eprintln!("[media_keys] souvlaki 初始化失败");
    }
}

#[cfg(not(target_os = "macos")]
pub fn init(_app: &AppHandle) {}

fn emit_media_key(action: &str) {
    if let Some(app) = APP_HANDLE.lock().unwrap().as_ref() {
        let _ = app.emit("media-key", action);
    }
}
