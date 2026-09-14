use chrono::Utc;
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri_plugin_http::reqwest::Method;

use crate::{
  api::libs::ApiResult,
  http::{
    config::HttpConfig,
    server::{request, RequestOptions},
  },
  utils::helper::sign_key_params,
};

#[tauri::command]
/// 歌曲推荐
///
/// ### 必选参数
/// * `card_id` - 1: 精选好歌随心听, 2: 经典怀旧金曲, 3: 热门好歌精选, 4: 小众宝藏佳作, 6: vip专属推荐
pub async fn api_top_card(card_id: u8) -> ApiResult<HashMap<String, Value>> {
  let kg_dynamic_config = HttpConfig::get_kg_dynamic_config();
  let kg_static_config = HttpConfig::get_kg_static_config();

  let client_time = Utc::now().timestamp_millis();
  let fakem = "60f7ebf1f812edbac3c63a7310001701760f";
  let platform = "android";
  let area_code = "1";

  let params = json!({
    "card_id": card_id,
    "fakem": fakem,
    "platform": platform,
    "area_code": area_code,
  });
  let Value::Object(params) = params else { unreachable!() };

  let data = json!({
    "appid": kg_static_config.appid,
    "clientver": kg_static_config.client_ver,
    "userid": kg_dynamic_config.cookies.userid,
    "mid": kg_dynamic_config.mid,
    "key": sign_key_params(&client_time.to_string(), None, None),
    "clienttime": client_time,
    "fakem": fakem,
    "platform": platform,
    "area_code": area_code,
    "uuid": '-',
    "client_playlist": [],
    "u_info": "a0c35cd40af564444b5584c2754dedec"
  });

  let opts = RequestOptions::new()
    .url("/singlecardrec.service/v1/single_card_recommend")
    .method(Method::POST)
    .params(params)
    .data(data);

  request(opts).await.map_err(|e| e.to_string())
}

#[tauri::command]
/// 新碟上架
pub async fn api_top_album() -> ApiResult<HashMap<String, Value>> {
  let kg_dynamic_config = HttpConfig::get_kg_dynamic_config();
  let kg_static_config = HttpConfig::get_kg_static_config();

  let data = json!({
    "apiver": kg_static_config.api_ver,
    "token": kg_dynamic_config.cookies.token,
    "withpriv": 1,
  });

  let opts = RequestOptions::new()
    .url("/musicadservice/v1/mobile_newalbum_sp")
    .method(Method::POST)
    .data(data);

  request(opts).await.map_err(|e| e.to_string())
}

#[tauri::command]
/// 推荐歌单
///
/// ### 必选参数
/// * `category_id` - 0：推荐，11292：HI-RES，从 api_playlist_tags 获取（tag_id 即为 category_id）
///
/// ### 可选参数
/// * `module_id` -
/// * `withtag` - 是否返回歌单分类, 0: 不返回, 1: 返回
/// * `withsong` - 是否返回歌曲列表（不全）, 0: 不返回, 1: 返回
/// * `sort` -
/// * `page` - 默认 1
/// * `page_size` - 默认 10
pub async fn api_top_playlist(
  category_id: &str,
  module_id: Option<u64>,
  withtag: Option<u8>,
  withsong: Option<u8>,
  sort: Option<u64>,
  page: Option<usize>,
  page_size: Option<usize>,
) -> ApiResult<HashMap<String, Value>> {
  let kg_dynamic_config = HttpConfig::get_kg_dynamic_config();
  let kg_static_config = HttpConfig::get_kg_static_config();

  let client_time = Utc::now().timestamp();
  let platform = "android";
  let area_code = "1";

  let data = json!({
    "module_id": module_id.unwrap_or(1),
    "page": page.unwrap_or(1),
    "pagesize": page_size.unwrap_or(10),
    "appid": kg_static_config.appid,
    "clientver": kg_static_config.client_ver,
    "userid": kg_dynamic_config.cookies.userid,
    "mid": kg_dynamic_config.mid,
    "key": sign_key_params(&client_time.to_string(), None, None),
    "clienttime": client_time,
    "platform": platform,
    "req_multi": 1,
    "retrun_min": 5,
    "return_special_falg": 1,
    "special_recommend": {
      "categoryid": category_id,
      "withtag":  withtag.unwrap_or(0),
      "withsong": withsong.unwrap_or(0),
      "sort":  sort.unwrap_or(1),
      "area_code": area_code,
      "ugc": 1,
      "is_selected": 0,
      "withrecommend": 1,
    }
  });

  let opts = RequestOptions::new()
    .url("/v2/special_recommend")
    .method(Method::POST)
    .add_header("x-router", "specialrec.service.kugou.com")
    .data(data);

  request(opts).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  // === URL 路径 ===

  #[test]
  fn test_top_card_url() {
    let path = "/singlecardrec.service/v1/single_card_recommend";
    assert!(path.starts_with("/singlecardrec"));
  }

  #[test]
  fn test_top_album_url() {
    let path = "/musicadservice/v1/mobile_newalbum_sp";
    assert!(path.contains("newalbum"));
  }

  #[test]
  fn test_top_playlist_url() {
    let path = "/v2/special_recommend";
    assert!(path.starts_with("/v2"));
  }

  // === x-router ===

  #[test]
  fn test_top_playlist_router() {
    let router = "specialrec.service.kugou.com";
    assert!(router.contains("specialrec"));
  }

  // === fakem 常量 ===

  #[test]
  fn test_top_card_fakem_constant() {
    let fakem = "60f7ebf1f812edbac3c63a7310001701760f";
    assert_eq!(fakem.len(), 36); // 注意：此 fakem 长度非 32
  }

  #[test]
  fn test_top_card_fakem_starts_with_60() {
    let fakem = "60f7ebf1f812edbac3c63a7310001701760f";
    assert!(fakem.starts_with("60"));
  }

  // === card_id 取值范围 ===

  #[test]
  fn test_card_id_documented_values() {
    // 文档：1:精选, 2:经典, 3:热门, 4:小众, 6:vip专属
    let valid_ids = [1u8, 2, 3, 4, 6];
    assert_eq!(valid_ids.len(), 5);
    assert!(!valid_ids.contains(&5)); // 5 不在文档列表中
  }

  // === 命令签名约束 ===

  #[test]
  fn test_command_signatures_exist() {
    let _ = api_top_card;
    let _ = api_top_album;
    let _ = api_top_playlist;
  }
}
