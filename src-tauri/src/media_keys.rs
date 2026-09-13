use media_keyboard::{MediaKey, MediaKeys};
use tauri::Emitter;

pub fn init(app_handle: &tauri::AppHandle) {
    let app = app_handle.clone();

    // 注册媒体按键回调，跨平台统一处理
    if let Some(mut keys) = MediaKeys::new() {
        let _handler = keys.on_event(move |key| match key {
            MediaKey::Play => {
                let _ = app.emit("music:play", ());
            }
            MediaKey::Pause => {
                let _ = app.emit("music:pause", ());
            }
            MediaKey::Next => {
                let _ = app.emit("music:next", ());
            }
            MediaKey::Prev => {
                let _ = app.emit("music:prev", ());
            }
            _ => {}
        });

        // 保持 handler 存活（不 drop）
        std::mem::forget(_handler);
    }
}
