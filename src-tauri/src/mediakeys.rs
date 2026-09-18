use tauri::AppHandle;

/// 媒体键盘状态（macOS 媒体按键 F7/F8/F9）
pub struct MediaKeyState {
    _app_handle: Option<AppHandle>,
}

impl MediaKeyState {
    pub fn new() -> Self {
        Self {
            _app_handle: None,
        }
    }

    /// 注册 macOS 媒体键盘事件
    ///
    /// F7 = 播放/暂停 (play/pause)
    /// F8 = 上一首 (previous)
    /// F9 = 下一首 (next)
    pub fn register(&mut self, app_handle: &AppHandle) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            use media_keys::MediaKey;

            let app_handle = app_handle.clone();

            media_keys::register(move |event| {
                match event {
                    MediaKey::PlayPause => {
                        let _ = app_handle.emit("music:mediakeys:play", ());
                    }
                    MediaKey::Next => {
                        let _ = app_handle.emit("music:mediakeys:next", ());
                    }
                    MediaKey::Previous => {
                        let _ = app_handle.emit("music:mediakeys:prev", ());
                    }
                    _ => {}
                }
            })
            .map_err(|e| format!("media key register failed: {}", e))?;

            eprintln!("Media keys registered successfully");
        }

        #[cfg(not(target_os = "macos"))]
        {
            eprintln!("Media keys are only supported on macOS");
        }

        self._app_handle = Some(app_handle.clone());
        Ok(())
    }
}
