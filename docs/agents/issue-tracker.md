# Issue tracker: 本地 Markdown

本仓库的问题（Issue）与需求规格（Spec，也可称 PRD）以 Markdown 文件形式存放在 `.scratch/` 目录中。

## 约定

- 每个功能一个目录：`.scratch/<feature-slug>/`
- 需求规格为 `.scratch/<feature-slug>/spec.md`
- 实现问题每个工单一个文件，位于 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，编号从 `01` 开始 — 禁止使用单一合并工单文件
- 分诊状态记录在每个问题文件顶部的 `Status:` 行（角色字符串见 `triage-labels.md`）
- 评论与对话历史追加到文件底部 `## Comments` 标题下

## 当技能说「发布到问题追踪器」时

在 `.scratch/<feature-slug>/` 下创建新文件（必要时创建目录）。

## 当技能说「获取相关工单」时

读取引用路径处的文件。用户通常会直接传入路径或问题编号。

## Wayfinding（寻路）操作

供 `/wayfinder` 使用。**地图（map）** 是一个文件，每个工单对应一个**子（child）**文件。

- **地图**：`.scratch/<effort>/map.md` — 包含备注 / 已做决策 / 待澄清（Fog）正文。
- **子工单**：`.scratch/<effort>/issues/NN-<slug>.md`，编号从 `01` 开始，正文中包含问题。`Type:` 行记录工单类型（`research`/`prototype`/`grilling`/`task`）；`Status:` 行记录 `claimed`/`resolved`。
- **阻塞**：在顶部添加 `Blocked by: NN, NN` 行。当列出的每个文件都为 `resolved` 时，该工单解除阻塞。
- **前沿（Frontier）**：扫描 `.scratch/<effort>/issues/` 中已打开、未阻塞且未认领的文件；按编号顺序取第一个。
- **认领**：先设置 `Status: claimed` 并保存，然后再开始任何工作。
- **解决**：在 `## Answer` 标题下追加答案，设置 `Status: resolved`，然后在 `map.md` 的「已做决策」中追加上下文指针（要点摘录 + 链接）。
