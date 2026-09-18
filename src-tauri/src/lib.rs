// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
  App,
  Emitter,
  Listener,
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
  Manager,
};

use crate::{
  api::{
    album, artist, audio, login, lyric as api_lyric, music as api_music, personal, playlist,
    privilege, rank, register, search, song, top, user, youth,
  },
  http::{config, mode},
  music::{file, lyric as music_lyric, player, scan},
  system::{path, setting},
};

mod api;
mod http;
mod music;
mod system;
mod utils;

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_autostart::Builder::new().build())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .setup(|app: &mut App| {
      create_tray_icon(app.app_handle())?;
      mode::HttpMode::init(app.app_handle().clone());
      config::HttpConfig::init(app.app_handle().clone());

      // Defer player creation to app://ready event.
      // 音频初始化可能 panic（cpal::default_host），用 match 替代 expect
      let app_handle = app.app_handle().clone();
      app.listen("app://ready", move |event: Event| {
        tauri::async_runtime::spawn(async move {
          let player = match player::Player::new(app_handle) {
            Ok(p) => p,
            Err(e) => {
              eprintln!("音频初始化失败，跳过播放功能: {}", e);
              return;
            }
          };
          app_handle.manage(player);
          app_handle.emit("player://ready", ());
        });
      });

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      config::http_config_clear,
      setting::system_setting_restore_window,
      path::system_path_all,
      path::system_path_clear,
      scan::music_scan_dir,
      scan::music_scan_type,
      scan::music_scan_file,
      scan::music_scan_cancel,
      file::music_file_detail,
      player::music_player_get_device,
      player::music_player_set_device,
      player::music_player_get_devices,
      player::music_player_load_file,
      player::music_player_load_url,
      player::music_player_monitor_download,
      player::music_player_monitor_play,
      player::music_player_play,
      player::music_player_pause,
      player::music_player_stop,
      player::music_player_seek,
      player::music_player_set_volume,
      music_lyric::music_lyric_get,
      mode::http_mode_list,
      mode::http_mode_get,
      mode::http_mode_set,
      api_lyric::api_lyric_search,
      api_lyric::api_lyric_get,
      api_music::api_music_everyday,
      personal::api_personal_fm,
      top::api_top_album,
      top::api_top_card,
      top::api_top_playlist,
      rank::api_rank_list,
      rank::api_rank_top,
      rank::api_rank_audio,
      register::api_register_dev,
      search::api_search,
      search::api_search_complex,
      song::api_song_url,
      album::api_album_songs,
      artist::api_artist_list,
      artist::api_artist_audios,
      audio::api_audio_info,
      playlist::api_playlist_tags,
      playlist::api_playlist_user,
      playlist::api_playlist_detail,
      playlist::api_playlist_add,
      playlist::api_playlist_del,
      playlist::api_playlist_tracks_all,
      playlist::api_playlist_tracks_all_new,
      playlist::api_playlist_tracks_add,
      playlist::api_playlist_tracks_del,
      privilege::api_privilege_lite,
      login::api_login_qr_key,
      login::api_login_qr_create,
      login::api_login_qr_check,
      login::api_login_wx_create,
      login::api_login_wx_check,
      login::api_login_openplat,
      login::api_login_captcha,
      login::api_login_cellphone,
      login::api_login_token,
      login::api_login_device,
      login::api_login_device_kick,
      login::api_login_out,
      user::api_user_detail,
      youth::api_youth_union_vip,
      youth::api_youth_day_vip,
      youth::api_youth_day_upgrade,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

fn get_player(app_handle: AppHandle) -> tauri::Result<&player::Player> {
  app_handle
    .try_state::<player::Player>()
    .ok_or_else(|| {
      tauri::Error::from(std::io::Error::new(std::io::ErrorKind::Other, "player not initialized yet"))
    })
    .map_err(|e| tauri::Error::from(e))
}

fn show_main_window(app_handle: &AppHandle) {
  if app_handle.get_webview_window("mini-player").is_some() {
    return;
  }
  if let Some(window) = app_handle.get_webview_window("main") {
    let _ = window.show();
    let _ = window.set_focus();
  }
}

fn create_tray_icon(app_handle: &AppHandle) -> tauri::Result<TrayIcon> {
  let icon = app_handle.default_window_icon().unwrap().clone();
  let show = MenuItem::with_id(app_handle, "show", "显示窗口", true, None::<&str>)?;
  let quit = MenuItem::with_id(app_handle, "quit", "退出", true, None::<&str>)?;

  let menu = Menu::with_items(app_handle, &[&show, &quit])?;

  let tray = TrayIconBuilder::new()
    .icon(icon)
    .menu(&menu)
    .show_menu_on_left_click(false)
    .on_menu_event(|app_handle, event| match event.id.as_ref() {
      "show" => show_main_window(app_handle),
      "quit" => app_handle.exit(0),
      _ => {}
    })
    .on_tray_icon_event(|tray, event| match event {
      TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
      } => {
        let h = tray.app_handle();
        if h.get_webview_window("mini-player").is_some() {
          return;
        }
        if let Some(window) = h.get_webview_window("main") {
          let _ = window.show();
          let _ = window.set_focus();
        }
      }
      _ => {}
    })
    .build(app_handle)?;

  Ok(tray)
}
