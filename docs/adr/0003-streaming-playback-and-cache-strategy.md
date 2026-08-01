# ADR-0003: 在线音乐流式播放与缓存策略

**状态**: 已采纳  
**日期**: 2026-08-01  
**决策者**: @buren_Lee

---

## 背景

在线音乐（Kugou 流）需要兼顾「秒开体验」和「本地缓存复用」。存在几个关键权衡：

1. 下载多少字节才开始播放（缓冲阈值）？ — 阈值太低会卡，太高等待久
2. 流式读取时读取指针追上下载指针怎么办？ — 忙等 / 休眠 / 报错
3. 已下载过的歌曲下次播放是否复用缓存？ — 复用省流量但校验有成本
4. 下载与播放线程如何协作？ — 共享文件句柄 + 原子进度

这些决策如果不固化，后续调整参数很容易引入「首帧慢」「跳转卡顿」「缓存命中失效」等体验 bug。

## 决策

**采用「文件并发双写」模型：下载线程将 HTTP 响应 chunk 写入临时文件，播放线程通过自定义 `StreamFile`（实现 `Read + Seek`）从同一文件读取。读取指针超过已下载大小时使用指数退避等待，超时 5s 报错。缓存校验使用「文件存在且 Content-Length 匹配」的轻量策略。**

### 流式播放时序

```
invoke music_player_load_url(url)
  ├─ ① 检查缓存命中：Temp/{hash}.mp4 存在 && size == 预期 Content-Length
  │      └─ 命中 → 直接 load_file() 播放（走本地文件路径，跳过下载管线）
  └─ 未命中：
        ├─ ② spawn 异步 download_file()：
        │      HttpRequest bytes_stream → 每 chunk 写入 Temp/{hash}.part.tmp
        │      每写完更新 downloaded_size (AtomicU64)
        │      完成后 rename .part.tmp → .{ext}
        │      每 100ms 推送 DOWNLOAD Channel
        └─ ③ 同步调用 load_stream()：
               等待 downloaded_size >= MIN_READ_SIZE (128KB)
               → 创建 StreamFile(file, file_size, downloaded_size.clone())
               → rodio Decoder(StreamFile) → sink.play()
               → 每 16ms 推送 PLAY Channel(position)
```

### 关键常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `MIN_READ_SIZE` | 128 * 1024 字节 | 首帧播放门槛。约 1s 128kbps / 0.3s 320kbps / 0.04s FLAC |
| `TIMEOUT` (StreamFile) | 5000ms | `wait_for_data()` 单次等待下载的最大时长，超时返回 TimedOut |
| `SLEEP_DURATION` | 10ms → 100ms | 初始 10ms，每次未就绪翻倍直到 100ms 上限（指数退避） |
| `DOWNLOAD_INTERVAL` | 100ms | 下载进度推送节流 |

### 缓存校验与命名

- **缓存目录**：由 ADR-0008 规定 `AppPath.temp_dir()`，默认 `{cwd}/Temp/`
- **命名规则**：`{music.hash}.{ext}`。在线音乐 hash 由 Kugou API 返回，保证同歌同 hash
- **命中判定**：
  ```rust
  let exists = path.exists();
  let size_ok = exists && metadata(path)?.len() == expected_content_length;
  if exists && size_ok { /* 直接播放本地文件 */ }
  ```
  — **不做内容校验**（MD5/xxhash），仅依赖 HTTP `Content-Length` 头。若远端内容被替换导致长度相同（极端罕见），下次手动清缓存解决
- **下载中后缀**：`.part.tmp`，完成后 `rename` 去掉 `.part.tmp`。加载缓存时忽略所有 `.part.*` 文件

### StreamFile 设计细节

- 同时实现 `Read + Seek`：rodio 解码 MP3/FLAC 需要 seek 探测帧头
- `wait_for_data(target_position)`：读取指针欲到达的位置若已超过 `downloaded_size`，则进入指数退避循环，超时抛错
- 共享状态仅一个 `Arc<AtomicU64>`，`Ordering::Acquire` 读，下载线程 `Ordering::Release` 写，无锁无 RwLock

## 考虑的替代方案

| 方案 | 优点 | 缺点 | 为什么没选 |
|------|------|------|------------|
| 完全下载后播放 | 实现极简，无流式复杂度 | 长音频 / 弱网体验极差（几十秒等待） | 不符合音乐播放器秒开预期 |
| 纯内存缓冲（Vec<u8> 双端队列） | 无磁盘 IO，快 | 内存膨胀、崩溃不持久化、FLAC 单首可达 50MB | 桌面端内存敏感，且重启后无法复用 |
| 带内容 hash 的缓存校验 | 绝对准确 | 每次播放读取整个文件做 MD5，首帧延迟 + CPU 占用 | 收益与成本不匹配，Content-Length 足够覆盖 99% 场景 |
| `symphonia` + HTTP 流式解码（不写盘） | 无临时文件 | rodio 生态 HTTP 流式未稳定，seek 不支持 | 技术不成熟 |
| 本方案：并发文件 + StreamFile + 128KB 门槛 + 指数退避 | 秒开（首帧 0.x 秒）、缓存复用、seek 可用、无额外内存开销 | 需要实现自定义 Read/Seek（~80 行），.part.tmp 崩溃残留需清理 | — |

## 影响

- **新增**: 新增音频格式支持时，若 rodio decoder 要求非顺序读取，需评估 `StreamFile` seek 性能
- **修改**: `music_player_load_url` 的实现受此 ADR 约束，不可改为纯内存流；缓存命中逻辑不可替换为内容 hash
- **约束**:
  - 所有在线音频必须落盘缓存（即使用户设置「不缓存」也至少要先写临时目录播放完可删）
  - `MIN_READ_SIZE` 不得低于 64KB，否则 MP3 帧头探测阶段等待下载会导致首帧反而更慢
  - 崩溃后遗留 `.part.tmp` 文件，由「缓存清理」设置项统一删除（`music_file_clear`）
- **风险**:
  - Content-Length 缺失的响应（chunked transfer encoding）：当前按 0 处理，不会命中缓存通道，直接走流式 + 无上限写盘
  - 弱网下频繁触发 5s TimedOut：上层 `MAX_RETRY_COUNT` 兜底，连续 3 次自动切下一首

## 后续

- 引入缓存容量上限（如 5GB LRU），超出后按 atime 淘汰旧文件
- `MIN_READ_SIZE` 可根据实际码率动态调整（根据 `api_audio_info` 返回的 bitrate 计算）
- 预读取播放列表下一首（提前 30s 开始下载但不通知 UI）
