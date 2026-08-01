# ADR-0005: 歌词系统（双格式解析 + 匹配绑定记忆 + 多窗口偏移独立）

**状态**: 已采纳  
**日期**: 2026-08-01  
**决策者**: @buren_Lee

---

## 背景

歌词系统是音乐播放器的核心体验模块，面临以下设计分歧：

1. **格式问题**：Kugou 支持 KRC（逐词时间轴，可译制成"卡拉OK"样式）和 LRC（逐行时间轴）两种格式，渲染逻辑完全不同，解析和缓存的编码方案也不同（KRC 专有加密 vs LRC 明文）
2. **匹配绑定问题**：同一首歌可能搜出多个候选歌词，用户选过某版后下次应自动选用，否则每次切歌都要手动选 — 体验灾难
3. **偏移独立性问题**：主窗口歌词页 / 桌面歌词窗口 两个渲染表面，用户可能分别调到不同节奏，不应互相污染偏移量
4. **加载效率**：歌词通常不大但每次在线搜会有几百毫秒延迟，需本地缓存 + 命中策略

## 决策

### 一、格式枚举与解析分层

```typescript
enum LyricFormat { Krc = 'krc', Lrc = 'lrc' }
```

| 层 | 职责 |
|----|------|
| Rust 缓存层 `music_lyric_get` / `music_lyric_save` | 存储/读取，不关心解析。存储时 **Base64 编码**原文（兼容特殊字符 + 避免 Windows 非法文件名换行），读取时：LRC = `utf8(from_base64)`，KRC = `decode_krc_lyric(from_base64)` （KRC 是专有的 zlib+混淆格式，必须走解码函数） |
| 前端工具层 `parseKrcLyric / parseLrcLyric` | 将字符串转为统一的 `LyricLine[]` 结构，每个 `LyricLine` 含 `start (ms) / duration (ms) / words / translated / isEmpty` |
| 前端渲染层（`LyricScrollList.vue` / 桌面歌词） | 只消费 `LyricLine[]`，不再区分 KRC/LRC 源格式 |

### 二、三级加载顺序（优先生效）

每次 `store.load(music, lyricCandidate?)` 时，按以下优先级依次尝试，命中即止：

```
① 用户传入 lyricCandidate（搜索 Modal 中用户手动选的某条结果）
   → 直接使用，结果写入 matchedMap 绑定
   ↓ 未提供
② 本地缓存命中（music_lyric_get）— 文件名：`{歌名清洗版} - {lyricId}.{krc|lrc}`
   → matchedMap 有记录时优先按 id 精确取，否则按歌名模糊取
   ↓ 未命中
③ 在线流程：api_lyric_search(music.title, music.artist) → 列表 → 默认取第一条 → api_lyric_get(id, fmt)
   → 下载 → music_lyric_save 落盘 → matchedMap 写入 {musicId: {id, fmt}}
```

### 三、匹配绑定记忆 (`matchedMap`)

- **结构**：`Record<musicId, { id: lyricId, fmt: Krc|Lrc }>`，随 `lyric-main` store `persist` 持久化
- **写入时机**：用户从歌词搜索 Modal 中显式选择一个候选歌词；或加载流程第③步默认选中第一条
- **读取时机**：第②步缓存查找阶段 — 如果当前音乐 `music.id` 在 `matchedMap` 中存在条目，则直接用该 `lyricId + fmt` 精确定位缓存文件，不再按歌名模糊搜索
- **清除**：用户在 Modal 中点击"取消绑定"或"重新匹配"时，删除 `matchedMap[musicId]`，下次走默认流程

### 四、偏移量独立 (`offsetMap`)

本项目存在 **三个** 歌词渲染位点，各自持有独立的偏移 Map，互不引用：

| Store | 偏移字段 | 作用域 |
|-------|---------|--------|
| `lyric-main` (主窗口) | `offsetMap: Record<musicId, seconds>` | 主窗口歌词页、歌词滚动条 |
| `desktop-lyric` (桌面歌词窗口) | `offsetMap: Record<musicId, seconds>` | 桌面歌词悬浮窗，见 ADR-0001 §歌词偏移独立管理 |
| `mini-player` | (无偏移 UI) | — |

**偏移量含义**：加到原始 `start + duration` 上的秒数。正值 = 歌词延后（歌手唱得比歌词快），负值 = 歌词提前。

每个 Store 的 `offsetMap` 各自持久化。用户在桌面歌词窗口调偏移，**不会**影响主窗口歌词页下次打开同一首歌的节奏，反之亦然。

### 五、缓存文件命名与非法字符

- 文件名：`{getValidPath(name)} - {getValidPath(id)}.{ext}`
- `getValidPath()` 清洗 Windows/macOS 文件系统非法字符：`\ / : * ? " < > |` 替换为 `_`，并裁剪前后空格
- 存储内容：**Base64 编码原文**。原因：KRC 解码后含非 UTF-8 字节，直接写 `.krc` 文件在跨平台场景下（尤其是 Windows GBK 默认编码）会乱码；Base64 是纯 ASCII，100% 可靠
- 读取解码链路：`read_to_string` → `STANDARD.decode` → (KRC 专属) `decode_krc_lyric()` / (LRC) `from_utf8()`

## 考虑的替代方案

| 方案 | 优点 | 缺点 | 为什么没选 |
|------|------|------|------------|
| 只支持 LRC，不做 KRC | 解析简单，不用 decode_krc_lyric | KRC 逐词渲染体验远好于 LRC，是产品卖点 | 牺牲核心体验 |
| 偏移量共享一个 Map | 任何窗口调完另一窗口立刻对齐 | 桌面歌词用户常调到 2-3s 便于看唱段，主窗口用户习惯 0 偏差，需求冲突 | 不符合真实使用场景 |
| 歌词按 music.hash 命名（不按歌名-id） | 一一对应，无歧义 | 同音乐 ID 会被不同版本歌词（多个上传者）覆盖，用户切换歌词候选时无法共存多份 | 用户需要多候选并存 |
| 直接保存明文原文 | 少一次 Base64 编解码 | KRC 二进制字节跨平台写盘 + 文件名非法字符 = 频繁乱码 | 稳定性优先 |
| 本方案：双格式三级加载 + matchedMap + 三 Store 偏移独立 + Base64 缓存 | 多窗口体验独立、用户手动选择有记忆、缓存跨重启复用、跨平台零乱码 | 三 Store 三套 offsetMap 略冗余；matchedMap 需随 user 清退策略同步清理 | — |

## 影响

- **新增**: 新增歌词格式（如逐字 QRC）时，需补 4 处：`LyricFormat` enum + `fmt.as_ext()` + Rust `music_lyric_get` 解码分支 + 前端 `parseQrcLyric` 解析器
- **修改**: 任何修改 `lyric-main` / `desktop-lyric` 两个 store 中 `offsetMap` 的代码，**禁止交叉引用**，保持各自独立
- **约束**:
  - `matchedMap` 写入必须由"用户显式确认"或"默认首次选择"触发，不得在搜索 API 返回结果时无脑写入（避免污染绑定关系）
  - 偏移步长统一 `LyricOffset.Step = 0.2s`（`utils/params.ts` 中定义），三窗口保持同一粒度体验
  - 缓存大小失控时（歌词/封面累计 > 500MB），由「设置 → 缓存清理」调用 `music_file_clear(lyric_dir)`，清除所有歌词缓存（但 matchedMap 保留，下次播放按需重新在线下载）
- **风险**: 
  - KRC 解码算法 `decode_krc_lyric` 为逆向实现，若 Kugou 官方更换加密套件将全部失效，需跟进更新
  - `getValidPath()` 清洗过度导致两首不同歌同名不同歌手但文件名撞车 → 歌词显示错误 → 补救：优先查 matchedMap 精确 id

## 后续

- 歌词翻译 (`transMode`) 接入：LRC/KRC 同时包含翻译行时，独立存储，由 `LyricTransMode` 控制渲染开关
- 歌词批量缓存导出/导入：将 `lyric_dir` 目录打包 zip，用户备份后恢复
- matchedMap 清理策略：30 天未播放的音乐条目自动过期（类似 LRU）
