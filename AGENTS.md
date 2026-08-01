# Language

- 用中文回答用户的所有问题
- 思考过程（thinking）使用英文
- 代码注释和标识符保持原文

---

## 编码规范

参见 [CODING_STANDARDS.md](./CODING_STANDARDS.md)，包含状态字段、可见性、事件处理、文件命名等命名约定。## Agent skills

### Issue tracker

Issues 通过 GitHub Issues 在 `burenLee/seraphine-music` 中跟踪（使用 `gh` CLI）。详见 `docs/agents/issue-tracker.md`。

### Domain docs

单上下文布局 — 一个 `CONTEXT.md` 位于仓库根目录，ADRs 放在 `docs/adr/` 中。详见 `docs/agents/domain.md`。

### 多窗口数据规范

非主窗口（`mini-player`、`desktop-lyric`）只能使用各自的专用 store（如 `mini-player` 只用 `mini-player`），其余所有数据由主窗口通过事件传递。禁止在非主窗口中直接引用 `music`、`list`、`lyric-main`、`user` 等主窗口 store，防止多窗口数据源不同步。
