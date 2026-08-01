# ADR-0008: 应用缓存目录与路径降级策略

**状态**: 已采纳  
**日期**: 2026-08-01  
**决策者**: @buren_Lee

---

## 背景

桌面应用的「缓存 / 临时数据存放位置」通常有多个候选：随程序目录（便携模式）、用户 AppData（标准模式）、系统临时目录（fallback）。需要决定：

1. **缓存放哪里？** — 影响「卸载后缓存是否随走」「是否支持 U 盘便携」「权限问题」
2. **根目录创建失败怎么办？** — 安装到 C:\Program Files 等只读目录时，`current_dir` 不可写
3. **缓存分类结构** — 歌词 / 封面 / 音频 三类文件分散还是集中放？清理粒度不同

## 决策

### 一、根目录三级降级策略

```rust
impl AppPath {
  fn get_current_dir() -> PathBuf {
    env::current_dir()                    // 1. 当前工作目录（优先）
      .unwrap_or_else(|_| env::home_dir()  // 2. 用户主目录
        .unwrap_or_else(|| env::temp_dir())) // 3. 系统临时目录（最终兜底）
  }

  fn get_temp_dir(current_dir: &Path) -> PathBuf {
    let temp_dir = current_dir.join("Temp");
    if fs::create_dir_all(&temp_dir).is_ok() {
      temp_dir                          // 能建就用 Temp/
    } else {
      env::temp_dir()                   // 否则 fallback 到系统 tmp
    }
  }
}
```

**设计意图**：

| 优先级 | 候选目录 | 适用场景 | 典型路径（Windows） |
|--------|---------|---------|-------------------|
| 1 (首选 | `{cwd}/Temp` | 用户把程序放 D:\MusicPlayer\（非 Program Files 的可写盘 / 便携安装） | `D:\SeraphineMusic\Temp` |
| 2 次选 | `{HOME}/Temp`（间接）| 当 cwd 是 Program Files 只读：cwd fallback 到 HOME | `C:\Users\Me\Temp` |
| 3 兜底 | 系统临时目录 | HOME 也不可写（极端沙箱/企业环境） | `C:\Users\Me\AppData\Local\Temp` |

### 二、缓存分类子目录结构

所有 AppPath 实例由「根 temp_dir」下强制分 3 个子目录，并且各自独立降级：

```
{temp_root}/
├── lyrics/          ← 歌词缓存（music_lyric_save → .krc / .lrc（Base64 编码存储）
├── covers/        ← 封面缓存（music_file_cover → {file_stem}.jpg/png/webp
└── (临时音频文件)  ← 直接放 temp_root/ 根：流式缓存 {hash}.mp3/.flac/.part.tmp（ADR-0003）
```

每个子目录创建失败的降级：
```rust
fn get_lyric_dir(temp: &Path) -> PathBuf {
  let dir = temp.join("lyrics");
  create_dir_all(&dir).unwrap_or_else(|_| temp.to_path_buf())
  // 连子目录建不成，退回到 temp 根
}
```

**设计思路**：`lyrics/` 建不成 → 歌词文件直接散落在 temp 根（降级极端罕见），但保证不会 panic。`covers/` 同理。

### 三、路径暴露给前端

前端通过一次 invoke 获取完整路径图：

```rust
#[tauri::command]
pub async fn system_path_all() -> AppPathMap {
  AppPathMap {
    temp:   app_path.temp_dir().to_string(),
    lyric:  app_path.lyric_dir().to_string(),
    cover:  app_path.cover_dir().to_string(),
  }
}
```

前端「设置 → 缓存 → 打开目录 / 清理 按钮调用此接口获取真实路径后，再调 `music_file_clear(path)` 或 music_dir_open(path)`。

### 四、清理语义

| 清理按钮 | 操作 | 影响 |
|---------|------|------|
| 清理歌词缓存 | `music_file_clear(lyric_dir)` | 删除 lyrics/ 下全部文件，matchedMap 保留（下次在线重新拉） |
| 清理封面缓存 | `music_file_clear(cover_dir)` | covers/ 下全部图片，重新扫描时重新提取 |
| 清理音频缓存 | `music_file_clear(temp_dir)` | 只清 temp 根音频（保留 lyrics covers 子目录！）—— **注意**：当前实现会误删子目录文件吗？看 code — 否。file.rs L199-L222 `read_dir` 只清 path.is_file() 的条目，目录被跳过 ✅ |

## 考虑的替代方案

| 方案 | 优点 | 缺点 | 为什么没选 |
|------|------|------|------------|
| 固定使用 tauri::pathResolver::app_cache_dir() 标准目录 | 平台规范，用户好理解 | 便携安装卸载后缓存残留不保留（但多数用户期望卸载就全走）；不支持 U 盘移动运行 | 便携模式是核心用户群 |
| 把 temp_root/lyrics/ 放到不同盘（可配置） | 用户放 RAM 盘加速 | 设置复杂；路径跨平台差异（XDG/Cache/AppData/Local）让用户难选 | 简单优先，暂不配 |
| 一律系统 temp 目录，启动时创建 session 子目录，退出删除 | 干净，不留垃圾 | 重启后歌词/封面/音频全丢，每次都重下 | 反人类 |
| 本方案：三级降级 + 子目录独立降级 | 兼容便携/只读 cwd / 沙箱；不 panic | 分散降级后落盘位置略难预测（但有接口可查真实路径） | — |

## 影响

- **新增**: 新增缓存分类（如 "user_avatar_cache/）必须：新增 `AppPath` 字段 + `fn get_xxx_dir()` + `system_path_all` 返回 + 独立清理按钮
- **修改**: 不允许在代码中硬编码 `./Temp` 字符串，必须走 `AppPath::new().xxx_dir()`
- **约束**:
  - 路径 API 返回给前端的路径，**必须**是「绝对路径 + 已创建（保证前端 `music_dir_open` 不会因路径不存在而失败）
  - 清理操作 `music_file_clear(dir)` 必须是文件安全：只读文件，不递归子目录；若以后需要递归清子目录需新增命令，需显式传参数或新清）
  - `AppPath::new()` 每次都创建所有子目录；反复创建失败都创建目录失败但不记录日志（现在状态（只 OK/Err 不 log）：
- **风险**:
  - 三级降级后，「用户看不到：
    - 情况A：cwd 可写 → 程序放在 Program Files，结果 Temp 没权限写。但第一次装 C:\Program Files 下 .exe 运行时 cwd 可能是安装目录（CWD 管理员权限才能新建。实际 tauri 程序 cwd 默认实际为实际的？Windows 在 Program Files，但 cwd 问题:实际为 exe 所在 cwd 默认一般不 C:\Users\Me\AppData\Local\Programs\Seraphine Music 下，用户安装通常有权限。风险低。
  - 系统 temp 被清理工具（如 CCleaner / Disk Cleanup）定期清 ：用户清了以后歌词/封面丢重拉——这是「系统行为，可接受。

## 后续

- 真实路径可视化：设置页展示真实路径「打开缓存位置」按钮，用户可手动定位
- 空间配额：监控 temp_root 容量超 2GB / 5GB 触发自动 LRU 清理
- 便携模式开关：勾选后固定 cwd，取消 home 和系统tmp 降级（保证 U 盘不写宿主系统盘）
