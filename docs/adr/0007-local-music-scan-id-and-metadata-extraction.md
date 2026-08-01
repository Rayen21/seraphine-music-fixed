# ADR-0007: 本地音乐扫描 ID 方案与元数据提取策略

**状态**: 已采纳  
**日期**: 2026-08-01  
**决策者**: @buren_Lee

---

## 背景

「本地曲库」功能要求扫描用户选择的目录树，提取所有音频文件的元数据，并和在线音乐共享同一套「ID 体系」（以便：加入「我喜欢」列表、绑定歌词 matchedMap、跨重启保持播放进度/收藏记录）。核心决策点：

1. **本地音乐如何生成稳定的 ID？** 候选：MD5(文件内容)、MD5(路径)、inode + dev、随机 UUID
2. **扫描如何加速？** 大型曲库（数千首）若串行解析元数据会卡死 UI，需要并发；但并发边界要清晰（哪些部分可并行，哪些必须串行）
3. **元数据回退策略？** lofty 读不到 tag（无 ID3 的老 MP3 / FLAC 漏标）时如何至少给用户一个可识别的 title？
4. **取消语义？** 用户点了「扫描」又想取消，必须能中断一个已经启动的长任务

## 决策

### 一、ID 生成方案：`MD5(绝对路径)`

```rust
// scan.rs
let id = encrypt_md5(absolute_path.to_string_lossy());
```

- **hash 字段**：本地音乐 `ListMusic.hash = None`，仅在线音乐有（Kugou API 返回）
- **ID = MD5(绝对路径)** 的理由矩阵：

| 方案 | 相同文件移动路径后 | 不同内容重名覆盖 | 生成性能 | 跨平台稳定 | 说明 |
|------|-----------------|----------------|---------|-----------|------|
| MD5(内容) | ✅ ID 不变（重新认回） | ❌ ID 冲突同内容 | 慢：100MB 文件要读整文件 hash | ✅ | 最理想，但 1 万首全量扫一次要几分钟 |
| **MD5(路径)**（本方案） | ❌ 变 ID（失效）| ✅ 路径不同即不冲突 | 快：纯字符串 1µs | ⚠️ 路径大小写敏感（macOS APFS 默认不区分） | 最常用方案，和大多数文件管理器同语义 |
| inode + dev | ❌ 变（跨文件系统） | ✅ | 中等 | ❌ Windows 无原生 inode | 跨平台无法统一 |
| UUID v4 | ❌ 每次扫都是新 ID | ✅ | 快 | ✅ | 无法跨重启关联，失去意义 |

**结论**：接受「移动文件路径后收藏关系丢失」的 trade-off，换取「秒级扫描数千首」的性能。补救：移动路径后用户可手动「重新扫描目录」+「添加到喜欢」一次恢复。

### 二、扫描管道与并发模型

```
music_scan_dir(dir_paths, start_index)
  ├─ Step 1 (串行 IO): filter_dir_path
  │     遍历每个目录，按扩展名白名单 MUSIC_EXT 过滤
  │     深度限制 MAX_DEPTH = 8
  │     AtomicBool SCAN_CANCELLED 每 100 个文件检查一次
  │     输出: Vec<PathBuf> 候选文件列表
  │
  ├─ Step 2 (并行 CPU 密集): par_iter.map extract_tag
  │     rayon 并行池，每文件调用 lofty::Probe.open(path).read()
  │     读取 tag + properties，封装成 ListMusic
  │     封面提取：取 tag.pictures[0] → music_file_cover 写盘
  │     回退策略：title/artist 缺失 → 按文件名 "标题 - 歌手" 解析
  │     输出: Vec<ListMusic>
  │
  ├─ Step 3 (串行): 填 sort 字段 (start_index + 递增序号)
  └─ Step 4: 若 SCAN_CANCELLED = true，返回 None 通知前端废弃结果
```

关键常量：

| 常量 | 值 | 说明 |
|------|-----|------|
| `MUSIC_EXT` | 12 种：flac, mp3, wav, ogg, aac, m4a, m4b, aiff, aif, aifc, alac, mka | rodio 解码支持的格式白名单（比 rodio 声明的略保守） |
| `MAX_DEPTH` | 8 层 | Windows 11 资源管理器路径层级上限~255，但 8 层足以覆盖 `D:\Music\Artist\Album\Disc1\...` 实际场景，防符号链接环 |
| `SCAN_CANCELLED` | 全局 `static AtomicBool` | scan 开始设为 false，cancel 命令设为 true。Step1 和 rayon 闭包内每 N 个文件检查一次 |

### 三、元数据缺失回退

当 `lofty` 的 `primary_tag().title()` / `artist()` 拿不到值时，执行：

```rust
// file.rs / music_file_detail
let file_stem = path.file_stem(); // "周杰伦 - 晴天"
let (title, artist) = match file_stem.split_once('-') {
  Some((t, a)) => (t.trim(), Some(a.trim())),
  None => (file_stem, None)
};
```

若 split_once 切不开（文件名里没 `-`），则 artist = None，title = 整个文件名。

**封面提取**：
- 取 tag 中第一张图片（`pictures().get(0)`，不做"找封面类型为 front cover"的精细化匹配，简化实现）
- 写盘到 `{cover_dir}/{file_stem}.{ext}`，已存在则跳过
- 扩展名从 `picture.mime_type().and_then(|t| t.ext())` 推断，不写死 .jpg

### 四、取消机制

- `music_scan_cancel()`：设置 `SCAN_CANCELLED = true`
- 检查点：
  - Step 1 遍历每 100 个文件后读一次
  - Step 2 rayon 闭包内每文件读一次（并行中每个线程独立判断，可能会有少量延迟取消）
- 返回语义：取消 → 返回 `None`，前端收到后保持旧列表，不替换

## 考虑的替代方案

| 方案 | 优点 | 缺点 | 为什么没选 |
|------|------|------|------------|
| MD5(文件前 1MB) 做指纹 | 移动文件也能识别，内容 hash 的性能折中 | 前 1MB 碰撞概率 >0；实现复杂度还是高于纯路径 MD5 | 收益不足以 justify 复杂度 |
| 用 tokio 异步 fs 遍历 + `JoinSet` | 非阻塞，和 Tauri runtime 友好 | lofty 是同步 API，`spawn_blocking` 换皮收益不高；rayon 调优已够好 | rayon 成熟度更高，代码更少 |
| 增量扫描（记录 mtime） | 第二次扫描跳过未变更文件 | 需要维护「路径 → mtime → size」索引（SQLite 或 store.json），引入新持久化层 | 首次扫描频次不高；用户一般不反复扫同一目录 |
| 封面用 base64 内嵌 JSON / 存 DB | 不用单独 cover_dir | 列表 JSON 膨胀到几十 MB；Pinia 持久化 localStorage 容量可能触顶 | 独立文件更可控 |
| 本方案：MD5(路径) + rayon 并行 + 文件名回退 + AtomicBool 取消 | 实现简洁、启动快、lofty 生态稳定、取消语义清晰 | 移动文件丢失关联；封面取第一张可能不是正面封面 | 与用户预期一致（移动了文件当新文件看待是可接受行为） | — |

## 影响

- **新增**: 新增支持格式时必须 **两处同步加**：`MUSIC_EXT` 数组 + rodio 的 `Decoder` 能力表（rodio 版本升级时同步验证格式是否仍支持）
- **修改**: 不允许在 rayon 闭包里做 IO 写盘以外的全局可变状态访问（全局变量只能读 `SCAN_CANCELLED`，写操作去 Step3 串行做）
- **约束**:
  - `ListMusic.sort` 排序号 **不能乱**：用户选择从列表某 index 处插入新扫描结果时，后续追加要严格 `start_index..递增`
  - 禁止扫描网络盘 / SMB 挂载（不主动阻止，但 rayon 并行 IO 极易卡死，未来可在路径选择对话框过滤）
  - `SCAN_CANCELLED` 为全局 static，意味着一次只能跑 **一个** 扫描任务；第二次会覆盖第一次的取消标志（目前 UI 为 Modal，天然串行；若改为后台扫描需改造）
- **风险**:
  - macOS 大小写不敏感文件系统上「A.mp3」和「a.mp3」路径 MD5 不同但可能冲突存储（罕见）
  - 路径含非 UTF-8 字节（Windows 历史文件名）时 `to_string_lossy()` 会产生替换字符，重命名后 ID 变更

## 后续

- 增量扫描：引入 `scan_index.json`（path → size, mtime, id），第二次扫只重开变更文件
- 多扫描任务并发：改造 `SCAN_CANCELLED` 为「ScanTask(id, cancel_sender)」的 Map 结构
- 封面类型智能匹配：优先挑 `PictureType::CoverFront`，当前退化到取第一张
