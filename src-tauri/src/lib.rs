
use tauri::icon::Icon;
use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
  AppHandle, Manager, Result,
};

use crate::{
  api::{
    album, artist, audio, image, login, lyric as api_lyric, music as api_music, personal,
    playlist, privilege, rank, register, search, song, top, user, youth,
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
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { prevent_default, .. } = event {
        // 阻止默认关闭行为，改为隐藏窗口（应用继续运行在托盘）
        window.hide();
        *prevent_default = true;
      }
    })
    .tray_icon(
      TrayIconBuilder::new()
        .id("tray-icon")
        .icon(Icon::from_rgb_bytes(&[0, 0, 0, 0], 1, 1).unwrap())
        .show_menu_on_left_click(false),
    )
    .setup(|app| {
      let app_handle = app.app_handle();
      // 更新托盘图标的实际图标和菜单（builder 链中只放了占位图标）
      if let Some(tray) = app.get_tray_icon("tray-icon") {
        let show = MenuItem::with_id(&app_handle, "show", "显示窗口", true, None::<&str>)?;
        let quit = MenuItem::with_id(&app_handle, "quit", "退出", true, None::<&str>)?;
        let menu = Menu::with_items(&app_handle, &[&show, &quit])?;
        tray.set_menu(Some(&menu))?;
        tray.set_icon(app_handle.default_window_icon().cloned().unwrap_or(
          Icon::from_rgb_bytes(&[0, 0, 0, 0], 1, 1).unwrap(),
        ))?;
        tray.set_on_menu_event({
          let app_handle = app_handle.clone();
          move |app, event| match event.id.as_ref() {
            "show" => show_main_window(&app_handle),
            "quit" => app.exit(0),
            _ => {}
          }
        });
        tray.set_on_tray_icon_event({
          let app_handle = app_handle.clone();
          move |tray, event| match event {
            TrayIconEvent::Click { .. } => show_main_window(tray.app_handle()),
            _ => {}
          }
        });
      }

      // HttpMode 需要比 HttpConfig 先初始化
      mode::HttpMode::init(&app_handle);
      config::HttpConfig::init(&app_handle);

      let player = player::Player::new(app_handle)?;

      app.manage(player);

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      config::http_config_clear,
      setting::system_setting_restore_window,
      path::system_path_all,
      path::system_path_clear,
      path::system_path_set_custom_dir,
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
      // api_personal_fm,
      // api_images_audio,
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
      image::fetch_image
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

// 显示主窗口（迷你播放器打开时跳过）
fn show_main_window(app: &AppHandle) {
  if app.get_webview_window("mini-player").is_some() {
    return;
  }
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.set_focus();
  }
}