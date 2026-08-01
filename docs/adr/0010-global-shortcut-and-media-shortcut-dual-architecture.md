# ADR-0010: 全局快捷键与媒体快捷键双轨架构

**状态**: 已采纳  
**日期**: 2026-08-01  
**决策者**: @buren_Lee

---

## 背景

音乐播放器一个关键交互——用户切歌/调音量时不用切回窗口。快捷键的方案选择有两个阵营：

1. **tauri-plugin-global-shortcut 自定义全局组合键**（Alt+F5 等）— 可任意配置，但和其他软件冲突
2. **系统媒体键**（键盘上的 ▶️ ⏸ ⏮ ⏭ 音量+ 🔇）— 系统级无冲突，但不可配置，不同键盘不一致

选一个还是两个都做？如何管理开关、校验、注册时机？

## 决策

### 一、双轨并行，独立开关

两套快捷键系统**完全解耦**，在 setting store 中两个独立布尔开关：

| 系统 | 开关字段 | 注册函数 | 注销函数 | 插件来源 |
|------|---------|---------|---------|---------|
| 全局组合快捷键 | `globalShortcutState` (默认 true) | `registerAllGlobalShortcut()`  | `unregisterAll()` | `tauri-plugin-global-shortcut` |
| 系统媒体快捷键 | `mediaShortcutState` (默认 true)  | `registerMediaShortcut()` | `unregisterMediaShortcut()` | 未来接入 media-keypress 事件(待实现？或 tauri 媒体键 API) |

两个 toggle 开关互不影响——用户讨厌 Alt 键冲突可以只关全局组合，但是保留媒体键。

### 二、默认快捷键映射 Default_Shortcut

```typescript
const Default_Shortcut: Record<ShortcutKey, string> = {
  playOrPause: 'Alt+F5',
  addVolumn:   'Alt+Up',
  subVolumn:   'Alt+Down',
  mute:        'Alt+S',
  prev:        'Alt+Left',
  next:        'Alt+Right',
  backward:    'Ctrl+Alt+Left',   // 快退 5s
  forward:     'Ctrl+Alt+Right',  // 快进 5s
}
```

**命名空间 ShortcutKey 是 8 个固定动作，不扩展。用户可改映射，但动作类型是固定的。

### 三、用户自定义快捷键校验规则

用户在设置页快捷键输入框输入组合键后保存时触发以下 validate：

```typescript
// 1. 按 '+' split，去掉空格
// 2. Modifier 集合：['Ctrl', 'Shift', 'Alt', 'Meta']
// 3. 必须恰好有且仅有 1 个非 Modifier 键（主键）
//    parts.filter(p => !modifier.includes(p)).length === 1
// 4. 不合法则 setShortcutMap(key, '') —— 清空，用户重新录
```

例：`Ctrl+Alt+A` ✅（两个修饰符 + A 1 主键；`Ctrl+Shift+Alt`❌（0 主键）；`Ctrl+A+B` ❌（2 主键）

### 四、注册时机（水合后重注册）

tauri-plugin-global-shortcut 注册的快捷键**在应用退出后不持久化。重启后重新注册。

```typescript
// setting store isHydrated watcher 里
watch(isHydrated, async () => {
  await unregisterAll()                  // 清旧（DEV HMR 防止重复）
  registerAllGlobalShortcut()              // 把 shortcutMap 里全量非 '' 的都重注册
  registerMediaShortcut()                 // 媒体键独立注册
})
```

**重要**：先 unregisterAll 防 DEV HMR 场景（vite 刷新前端重新加载时，Rust 侧的插件注册记录里还残留着上一次的注册。不清就重复注册 → 按一次触发 2 次动作。

### 五、媒体键的缺失处理

部分键盘（尤其是 60% 无媒体键——注册不上：不失败。registerMediaShortcut 里包装 try/catch，失败仅 setting store.mediaShortcutState = false + notify 提示「你的系统不支持媒体键」。

## 考虑的替代方案

| 方案 | 优点 | 缺点 | 为什么没选 |
|------|------|------|------------|
| 只做全局自定义组合键 | 实现简单 | 用户不看说明书的话切歌 | 冲突是很多人爱用媒体键盘标配 |
| 只做媒体键 | 零冲突 | 不可配置：没有媒体键盘的用户无法用快退/快进/快退前进等自定义动作 | 高级用户需求多得多 |
| 三套：系统注册持久化跨重启不用重复注册 | 省性能 | 插件接口不提供持久化 API；反而自己存启动得重写 | 插件内部 API 未持久化 就几 ms 性能损失可忽略 |
| 本方案：双轨独立开关 + 严格校验 1 主键 + 水合清再注册 | 覆盖多用户场景；DEV 不重复触发 | 两套独立代码 重复注册 |— |

## 影响

- **新增**: 新增动作（例如「喜欢/取消喜欢」快捷键）：ShortcutKey 加枚举 + Default_Shortcut 配默认 + registerGlobalShortcut(type) 调对应 musicStore/like()
- **修改**: 不允许绕开 setting store 别处直接调 plugin 的 register()——必须走 registerGlobalShortcut() 统一入口 unregisterAll() 也必须入口
- **约束**:
  - 用户输入自定义键，走 validate 规则；禁止「无主键」「多主键」非法写库
  - 快捷键和其他软件（比如 IDE 用 Alt+↑↓ 改代码）冲突：文档里提示用户去设置里改键，不做「智能检测冲突」（太复杂系统 API 没提供）
- **风险**:
  - macOS 下第一次注册全局快捷键要授权「辅助功能/输入监控」权限，用户不给 → 注册失败 notify 文案引导授权
  - Windows 管理员权限下注册可能 UAC 弹窗管理员才能全局 Alt+Tab 相关全局捕捉异常？不相关的一般不需管理员一般没问题

## 后续

- 快捷键录制器：设置页用户按「录制」直接「请按下新组合键」——而不用手输字串（现在是手输入）
- 冲突检测：注册失败后检测哪个软件占了（系统 API 没给，难）
- Linux Wayland 下全局键的特殊处理（ compositor 权限
