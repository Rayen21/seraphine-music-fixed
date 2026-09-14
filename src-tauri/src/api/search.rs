use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, fmt};

use crate::{
  api::libs::ApiResult,
  http::{
    config::HttpConfig,
    libs::KgCookies,
    server::{request, RequestOptions},
  },
};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchType {
  Song,
  Album,
  Author,
  Mv,
  Lyric,
  Special,
  Collect,
}

impl fmt::Display for SearchType {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    let s = match self {
      SearchType::Special => "special",
      SearchType::Lyric => "lyric",
      SearchType::Song => "song",
      SearchType::Album => "album",
      SearchType::Author => "author",
      SearchType::Mv => "mv",
      SearchType::Collect => "collect",
    };
    f.write_str(s)
  }
}

#[tauri::command]
/// 搜索
///
/// ### 必选参数
/// * `keywords` - 关键词
///
/// ### 可选参数
/// * `search_type` - 搜索类型, 默认为单曲, special:歌单, lyric:歌词, song:单曲, album:专辑, author:歌手, mv:mv
/// * `page` - 默认 1
/// * `page_size` - 默认 10
pub async fn api_search(
  keywords: &str,
  search_type: Option<SearchType>,
  page: Option<usize>,
  page_size: Option<usize>,
) -> ApiResult<HashMap<String, Value>> {
  let params = json!({
    "albumhide": 0,
    "iscorrection": 1,
    "keyword": keywords,
    "nocollect": 0,
    "page": page.unwrap_or(1),
    "pagesize": page_size.unwrap_or(30),
    "platform": "AndroidFilter",
  });
  let Value::Object(params) = params else { unreachable!() };

  let search_type = search_type.unwrap_or(SearchType::Song);
  let ver = match search_type {
    SearchType::Song => "v3",
    _ => "v1",
  };

  let opts = RequestOptions::new()
    .url(format!("/{ver}/search/{search_type}"))
    .add_header("x-router", "complexsearch.kugou.com")
    .params(params);

  request(opts).await.map_err(|e| e.to_string())
}

#[tauri::command]
/// 综合搜索
///
/// ### 必选参数
/// * `keywords` - 关键词
///
/// ### 可选参数
/// * `page` - 默认 1
/// * `page_size` - 默认 10
pub async fn api_search_complex(
  keywords: &str,
  page: Option<usize>,
  page_size: Option<usize>,
) -> ApiResult<HashMap<String, Value>> {
  let params = json!({
    "platform": "AndroidFilter",
    "keyword": keywords,
    "page": page.unwrap_or(1),
    "pagesize": page_size.unwrap_or(30),
    "cursor": 0,
  });
  let Value::Object(params) = params else { unreachable!() };

  let KgCookies {
    dfid,
    userid,
    token,
    t1,
    vip_type,
    vip_token,
  } = HttpConfig::get_kg_dynamic_config().cookies;

  let opts = RequestOptions::new()
    .base_url("https://complexsearch.kugou.com")
    .url("/v6/search/complex")
    .add_header("cookie", format!("dfid={dfid}; userid={userid}; token={token}; t1={t1}; vip_type={vip_type}; vip_token={vip_token}"))
    .params(params);

  request(opts).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  // === SearchType Display ===

  #[test]
  fn test_search_type_display_song() {
    assert_eq!(SearchType::Song.to_string(), "song");
  }

  #[test]
  fn test_search_type_display_album() {
    assert_eq!(SearchType::Album.to_string(), "album");
  }

  #[test]
  fn test_search_type_display_author() {
    assert_eq!(SearchType::Author.to_string(), "author");
  }

  #[test]
  fn test_search_type_display_mv() {
    assert_eq!(SearchType::Mv.to_string(), "mv");
  }

  #[test]
  fn test_search_type_display_lyric() {
    assert_eq!(SearchType::Lyric.to_string(), "lyric");
  }

  #[test]
  fn test_search_type_display_special() {
    assert_eq!(SearchType::Special.to_string(), "special");
  }

  #[test]
  fn test_search_type_display_collect() {
    assert_eq!(SearchType::Collect.to_string(), "collect");
  }

  // === SearchType serde ===

  #[test]
  fn test_search_type_serde_lowercase() {
    // #[serde(rename_all = "lowercase")]
    let json = serde_json::to_string(&SearchType::Song).unwrap();
    assert_eq!(json, "\"song\"");

    let json = serde_json::to_string(&SearchType::Mv).unwrap();
    assert_eq!(json, "\"mv\"");
  }

  #[test]
  fn test_search_type_serde_deserialize() {
    let st: SearchType = serde_json::from_str("\"album\"").unwrap();
    assert!(matches!(st, SearchType::Album));

    let st: SearchType = serde_json::from_str("\"lyric\"").unwrap();
    assert!(matches!(st, SearchType::Lyric));
  }

  #[test]
  fn test_search_type_serde_invalid_variant() {
    // 不存在的变体应反序列化失败
    let result: Result<SearchType, _> = serde_json::from_str("\"invalid\"");
    assert!(result.is_err());
  }

  #[test]
  fn test_search_type_serde_case_sensitive() {
    // lowercase rename 不接受大写
    let result: Result<SearchType, _> = serde_json::from_str("\"Song\"");
    assert!(result.is_err());
  }

  // === SearchType 全变体覆盖 ===

  #[test]
  fn test_search_type_all_variants_display() {
    let all = [
      ("song", SearchType::Song),
      ("album", SearchType::Album),
      ("author", SearchType::Author),
      ("mv", SearchType::Mv),
      ("lyric", SearchType::Lyric),
      ("special", SearchType::Special),
      ("collect", SearchType::Collect),
    ];
    for (expected, variant) in all {
      assert_eq!(variant.to_string(), expected);
    }
  }

  // === 命令签名约束 ===

  #[test]
  fn test_command_signatures_exist() {
    let _ = api_search;
    let _ = api_search_complex;
  }
}
