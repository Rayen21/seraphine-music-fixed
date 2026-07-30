use crate::http::client::{HttpRequest, HttpRequestOptions};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_http::reqwest::Method;
use tokio_stream::StreamExt;

const GITHUB_API: &str =
  "https://api.github.com/repos/burenLee/seraphine-music/releases/latest";
const UA: &str = "seraphine-music";

#[derive(Debug, Deserialize)]
struct GitHubRelease {
  tag_name: String,
  assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
  name: String,
  browser_download_url: String,
  size: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
  pub has_update: bool,
  pub current_version: String,
  pub latest_version: String,
  pub download_url: Option<String>,
  pub file_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
  pub downloaded: u64,
  pub total: u64,
  pub speed: f64,
}

/// 将 semver 版本号（可能带 v 前缀）解析为 Version
fn parse_version(version: &str) -> Result<semver::Version, String> {
  let cleaned = version.trim_start_matches('v');
  semver::Version::parse(cleaned).map_err(|_| format!("版本号格式错误: {}", version))
}

/// 检查 GitHub 最新 Release（版本号从 tauri.conf.json 读取）
#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UpdateInfo, String> {
  let current_version = app.package_info().version.to_string();

  let opts = HttpRequestOptions::new()
    .url(GITHUB_API)
    .method(Method::GET)
    .add_header("User-Agent", UA)
    .add_header("Accept", "application/vnd.github+json");

  let resp = HttpRequest::request(opts)
    .await
    .map_err(|e| format!("检查更新失败: {}", e))?;

  if !resp.status().is_success() {
    return Err(format!("GitHub API 返回错误: {}", resp.status()));
  }

  let release: GitHubRelease = resp
    .json()
    .await
    .map_err(|e| format!("解析版本信息失败: {}", e))?;

  let current = parse_version(&current_version)?;
  let latest = parse_version(&release.tag_name)?;

  let nsis_asset = release
    .assets
    .iter()
    .find(|a| a.name.ends_with(".exe"));

  Ok(UpdateInfo {
    has_update: latest > current,
    current_version: format!("v{}", current),
    latest_version: release.tag_name,
    download_url: nsis_asset.map(|a| a.browser_download_url.clone()),
    file_size: nsis_asset.map(|a| a.size),
  })
}

/// 下载更新包到应用数据目录，期间通过事件发送下载进度
#[tauri::command]
pub async fn download_update(
  app: AppHandle,
  download_url: String,
) -> Result<String, String> {
  let client = HttpRequest::get_client();
  let resp = client
    .get(&download_url)
    .header("User-Agent", UA)
    .send()
    .await
    .map_err(|e| format!("下载请求失败: {}", e))?;

  if !resp.status().is_success() {
    return Err(format!("下载链接返回错误: {}", resp.status()));
  }

  let total = resp.content_length().unwrap_or(0);
  let mut downloaded: u64 = 0;
  let start = std::time::Instant::now();
  let mut last_emit = start;
  let mut bytes = Vec::with_capacity(total as usize);

  let mut stream = resp.bytes_stream();

  while let Some(chunk) = stream.next().await {
    let chunk = chunk.map_err(|e| format!("下载失败: {}", e))?;
    bytes.extend_from_slice(&chunk);
    downloaded += chunk.len() as u64;

    let now = std::time::Instant::now();
    if now.duration_since(last_emit).as_millis() >= 100 {
      let elapsed = now.duration_since(start).as_secs_f64();
      let speed = if elapsed > 0.0 {
        downloaded as f64 / elapsed
      } else {
        0.0
      };
      let _ = app.emit(
        "update:download-progress",
        DownloadProgress {
          downloaded,
          total,
          speed,
        },
      );
      last_emit = now;
    }
  }

  // 最后确保 100% 进度
  let elapsed = start.elapsed().as_secs_f64();
  let speed = if elapsed > 0.0 {
    downloaded as f64 / elapsed
  } else {
    0.0
  };
  let _ = app.emit(
    "update:download-progress",
    DownloadProgress {
      downloaded,
      total,
      speed,
    },
  );

  // 保存到应用数据目录
  let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
  std::fs::create_dir_all(&app_data).map_err(|e| format!("创建目录失败: {}", e))?;

  let filename = download_url
    .rsplit('/')
    .next()
    .unwrap_or("seraphine-music-setup.exe");
  let save_path = app_data.join(filename);

  std::fs::write(&save_path, &bytes).map_err(|e| format!("保存文件失败: {}", e))?;

  Ok(save_path.to_string_lossy().to_string())
}

/// 启动下载好的安装程序
#[tauri::command]
pub async fn install_update(save_path: String) -> Result<(), String> {
  std::process::Command::new("cmd")
    .args(["/C", "start", "", &save_path])
    .spawn()
    .map_err(|e| format!("启动安装程序失败: {}", e))?;

  Ok(())
}
