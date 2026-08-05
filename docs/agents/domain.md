# Domain Docs（领域文档）

工程技能在探索代码库时应如何阅读本仓库的领域文档。

## 探索前先阅读以下文件

- 仓库根目录的 **`CONTEXT.md`**，或者
- 如果仓库根目录存在 **`CONTEXT-MAP.md`** — 它指向每个上下文各自的 `CONTEXT.md`，阅读与主题相关的每一份。
- **`docs/adr/`** — 阅读与你即将处理的领域相关的 ADR（架构决策记录）。在多上下文仓库中，还需检查 `src/<context>/docs/adr/` 中的上下文特定决策。

如果上述文件不存在，**静默继续**。不要标记缺失，也不要预先建议创建。`/domain-modeling` 技能（通过 `/grill-with-docs` 和 `/improve-codebase-architecture` 调用）会在术语或决策真正需要落地时惰性创建它们。

## 文件结构

单上下文仓库（绝大多数仓库）：

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多上下文仓库（根目录存在 `CONTEXT-MAP.md`）：

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← 上下文特定决策
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 使用词汇表中的术语

当你的输出命名领域概念时（在问题标题、重构提案、假设、测试名称中），使用 `CONTEXT.md` 中定义的术语。不要漂移到词汇表明确回避的同义词。

如果你需要的概念尚未出现在词汇表中，这是一个信号 — 要么你在发明项目不使用的语言（重新考虑），要么确实存在缺口（记录下来，交给 `/domain-modeling`）。

## 标记 ADR 冲突

如果你的输出与现有 ADR 矛盾，显式提出而不是静默覆盖：

> _与 ADR-0007（事件溯源订单）矛盾 — 但值得重新讨论，因为…_
