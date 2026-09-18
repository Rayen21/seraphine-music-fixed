// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
  manager::WindowListener,
  App,
  Manager,
  Runtime,
  WebviewUrl,
  WebviewWindowBuilder,
};

mod lib;

pub fn main() {
  tauri::Builder::default()
    .setup(|app| {
      create_main_window(app)?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

fn create_main_window<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
  let builder = WebviewWindowBuilder::new(
    app,
    "main",
    WebviewUrl::App("index.html".into()),
  )
  .inner_size(1024.0, 768.0)
  .resizable(false);

  // macOS 14+ specific: use .minimize() instead of .minimizable(true)
  #[cfg(target_os = "macos")]
  let builder = builder.minimize();

  // macOS 14+ specific: use .maximize() instead of .maximizable(true)
  #[cfg(target_os = "macos")]
  let builder = builder.maximize();

  let builder = builder
    .visible(false)
    .title("Seraphine Music")
    .focused(true)
    .skip_taskbar(true)
    .always_on_top(true);

  builder.build()?;
  Ok(())
}
