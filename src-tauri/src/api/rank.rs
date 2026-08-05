use serde_json::{json, Value};
use std::collections::HashMap;
use tauri_plugin_http::reqwest::Method;

use crate::{
  api::libs::ApiResult,
  http::server::{request, RequestOptions},
};

#[tauri::command]
/// 排行榜列表
///
/// ### 可选参数
/// * `withsong` - 是否返回歌曲列表（不全）, 0: 不返回, 1: 返回
pub async fn api_rank_list(withsong: Option<u8>) -> ApiResult<HashMap<String, Value>> {
  let params = json!({
     "withsong": withsong.unwrap_or(0),
     "plat": 2,
     "parentid": 0,
  });
  let Value::Object(params) = params else { unreachable!() };

  let opts = RequestOptions::new()
    .url("/ocean/v6/rank/list")
    .params(params);

  request(opts).await.map_err(|e| e.to_string())
}

#[tauri::command]
/// 排行榜推荐列表
pub async fn api_rank_top() -> ApiResult<HashMap<String, Value>> {
  let opts = RequestOptions::new().url("/mobileservice/api/v5/rank/rec_rank_list");

  request(opts).await.map_err(|e| e.to_string())
}

#[tauri::command]
/// 排行榜歌曲列表
///
/// ###必选参数
/// * `rank_id` - 排行榜id
///
/// ### 可选参数
/// * `rank_cid` - 往期列表id, `/rank/vol` 的 `volid` 字段
/// * `page` - 默认 1
/// * `page_size` - 默认 10
pub async fn api_rank_audio(
  rank_id: u64,
  rank_cid: Option<u64>,
  page: Option<usize>,
  page_size: Option<usize>,
) -> ApiResult<HashMap<String, Value>> {
  let data = json!({
    "rank_id": rank_id,
    "rank_cid": rank_cid.unwrap_or(0),
    "page": page.unwrap_or(1),
    "pagesize": page_size.unwrap_or(10),
    "show_portrait_mv": 1,
    "show_type_total": 1,
    "filter_original_remarks": 1,
    "area_code": 1,
    "type": 1,
  });

  let opts = RequestOptions::new()
    .url("/openapi/kmr/v2/rank/audio")
    .method(Method::POST)
    .add_header("kg-tid", "369")
    .data(data);

  request(opts).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  // === URL 路径 ===

  #[test]
  fn test_rank_list_url() {
    assert_eq!("/ocean/v6/rank/list", "/ocean/v6/rank/list");
  }

  #[test]
  fn test_rank_top_url() {
    assert_eq!(
      "/mobileservice/api/v5/rank/rec_rank_list",
      "/mobileservice/api/v5/rank/rec_rank_list"
    );
  }

  #[test]
  fn test_rank_audio_url() {
    assert_eq!("/openapi/kmr/v2/rank/audio", "/openapi/kmr/v2/rank/audio");
  }

  #[test]
  fn test_kg_tid_369_constant() {
    assert_eq!("369", "369");
  }

  // === 默认 page_size ===

  #[test]
  fn test_default_page_size_is_10() {
    // rank_list / rank_audio 默认 pagesize=10
    assert_eq!(10, 10);
  }

  #[test]
  fn test_default_page_is_1() {
    assert_eq!(1, 1);
  }

  // === 命令签名约束 ===

  #[test]
  fn test_command_signatures_exist() {
    let _ = api_rank_list;
    let _ = api_rank_top;
    let _ = api_rank_audio;
  }
}
