use tauri::Emitter;

#[cfg(target_os = "macos")]
pub fn init(app_handle: &tauri::AppHandle) {
    use souvlaki::{MediaControlEvent, MediaControls, PlatformConfig};

    let config = PlatformConfig {
        dbus_name: "seraphine-music",
        display_name: "Seraphine Music",
        hwnd: None, // macOS 不需要 HWND
    };

    if let Ok(mut controls) = MediaControls::new(config) {
        // 设置 Now Playing 状态，macOS 才会把媒体按键路由给当前应用
        if let Err(e) = controls.set_metadata(souvlaki::MediaMetadata {
            title: Some("Seraphine Music"),
            artist: Some("“爱悩乐园”"),
            ..Default::default()
        }) {
            eprintln!("Failed to set metadata: {:?}", e);
        }

        // 监听媒体按键事件
        if let Err(e) = controls.attach(move |event| match event {
            MediaControlEvent::Toggle => {
                app_handle.emit("media-key", "playpause").ok();
            }
            MediaControlEvent::Next => {
                app_handle.emit("media-key", "nexttrack").ok();
            }
            MediaControlEvent::Previous => {
                app_handle.emit("media-key", "previoustrack").ok();
            }
            _ => {}
        }) {
            eprintln!("Failed to attach media controls: {:?}", e);
        }
    } else {
        eprintln!("Failed to initialize MediaControls");
    }
}

#[cfg(not(target_os = "macos"))]
pub fn init(_app_handle: &tauri::AppHandle) {}
