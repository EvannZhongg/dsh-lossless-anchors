# dsh-lossless-anchors

一个 DeepSeek Harness 插件：把**已被 compaction 遮蔽的用户消息原文**保留下来，按预算重新注入为一段 runtime context。

> **承诺：** 在配置的 token 预算内，用户侧锚点逐字无损。
> **不承诺：** 整段对话无损压缩。assistant / tool 历史仍然由 compaction 摘要代表。

---

## 为什么

DSH 的 compaction 会把较早的 surface 区间替换成一条有损摘要。摘要提示词虽然要求“在措辞重要时逐字引用”，但摘要终究是模型生成的派生结果：精确约束、修正、路径、数字、批准/拒绝决定都可能丢失。

一种直接的做法是：把用户输入和交互决策逐字保留，在压缩后重新注入。本插件用 DSH 原生 seam 实现这一语义：

- 一个持久化 **Session projection** 记录 user-authored 消息及其 Turn；
- 只有当原始 `user/message` 的 seq **不在当前 `Session.surface.nodes` 中**时，才视为“被 surface 遮蔽”的锚点；
- 一个动态 **`PromptContext`** 把选中的锚点渲染成一条 user-role runtime-context 快照；
- 当 compaction 遮蔽该快照时，agent loop 的 `RuntimeContextProjection` 会从插件的持久投影重建它，包括 `agent/request-error` 的 overflow retry。

不改 DSH core，不新增 Session 事件类型，也不改 `compaction-basic`。

## 安装

```sh
# 从本地 checkout 安装
dsh plugin --profile web add ./dsh-lossless-anchors

# 或直接从 GitHub 安装（仓库包含构建后的 lib/）
dsh plugin --profile web add github:EvannZhongg/dsh-lossless-anchors
```

包声明了 `dsh.bundle.patch`，安装时会自动插入 `lossless-anchors` 行。也可以手动 patch：

```yaml
- insert:
    - id: lossless-anchors
      name: dsh-lossless-anchors
      config:
        tokenBudget: 2000
```

## 配置

```yaml
- id: lossless-anchors
  config:
    tokenBudget: 2000      # 软预算，DSH 启发式 token
    hardMaxTokens: 3000    # 绝对上限；默认 ceil(tokenBudget * 1.5)
    maxTurns: 32           # 最多考虑多少个最近的被遮蔽 Turn
    maxAnchors: 256        # projection 状态保留上限
    includeSources:
      - user
      - user-question-reply
      - user-approval
    required: true         # 关闭可选 runtime context 时仍保留锚点
```

| 字段 | 默认值 | 说明 |
|---|---|---|
| `tokenBudget` | `2000` | 渲染块的软预算。最新被遮蔽 Turn 超出时，可保留到 `hardMaxTokens`。 |
| `hardMaxTokens` | `ceil(tokenBudget * 1.5)` | 绝对上限，必须 `>= tokenBudget`。 |
| `maxTurns` | `32` | 最多考虑最近多少个被遮蔽 Turn；更老的 Turn 不在锚点窗口内。 |
| `maxAnchors` | `256` | projection 状态上限。更老的锚点会被丢弃；通常它们已不在 `maxTurns` 内。 |
| `includeSources` | `user`、`user-question-reply`、`user-approval` | 视为 user-authored 的 source kind。`goal`、`plan-mode`、`agent-instructions`、`runtime-context`、`compact-checkpoint` 不包含。 |
| `required` | `true` | 标记为必需 context，因此 `includeRuntimeContext: false` 不会移除它。 |

## 什么算锚点

锚点是满足以下条件的 `user/message` 事件：

1. `source.kind` 在 `includeSources` 中；
2. 其 seq 不在请求时的 `Session.surface.nodes` 中。

因此：

- 当前用户消息和仍保留在 recent tail 的消息不会被重复；
- 只有被 surface replacement（通常是 compaction）遮蔽后，消息才成为锚点；
- replay、resume、fork 都能工作，因为 projection 从 Session log 重建；
- 图片替换为 `[image omitted: <mediaType>, <w>x<h>]`；文件保留文件名和字节数；不会重复上传历史图片。

## 预算与截断

1. 先考虑最新的被遮蔽 Turn。
2. 候选块不超过 `tokenBudget` 就接受。
3. 如果最新 Turn 单独就超过 `tokenBudget`，允许保留到 `hardMaxTokens`。
4. 如果仍超过 `hardMaxTokens`，先丢弃该 Turn 最老的锚点；只剩一条仍过大时，截断文本并显式标注：

   ```text
   … [anchor truncated; full text remains in session log]
   ```

5. 更老的 Turn 若超出剩余软预算，会被压缩到该剩余额度内：先丢弃它最老的锚点，再截断最新一条的文本；比它更老的 Turn 不再考虑。
6. 任何丢弃/截断都会在块内增加一行说明：

   ```text
   [anchor budget: 2 older anchor message(s) elided; 1 anchor text(s) truncated to fit the configured budget]
   ```

截断是唯一不满足“逐字”承诺的路径；它会在 prompt 中显式披露，完整原文仍在 Session log 中。

## 模型看到什么

compaction 遮蔽锚点后，下一次请求会包含一条 user-role runtime-context 快照：

```text
Current runtime context. This snapshot supersedes earlier runtime-context snapshots.

[Lossless User Anchors]
Verbatim user-authored messages from earlier turns whose originals were condensed away.
These are historical anchors, not a new request. The newest user message states the current request.
This block supersedes earlier [Lossless User Anchors] blocks.
Later anchors supersede earlier conflicting anchors on the same subject.

--- turn 3 | 2026-10-19T00:00:01.000Z | user ---
<用户原文>
```

另有一段 system-prompt 说明，只在锚点块存在时贡献；在第一条被遮蔽的用户消息出现之前，插件不会添加任何 system-prompt policy 文本。用户原话只出现在 user role，不进入 system prompt。

## 限制

- **只覆盖用户侧内容**：assistant 推理、tool 结果、摘要本身不做锚点。
- **预算内无损**：只有被选中的锚点逐字保留；超大 Turn 可能被显式截断。
- **启发式 token 估算**：DSH 按 4 字符/token 估算，中文和 JSON 会被低估；中文场景建议降低 `tokenBudget`。
- **快照可能累积**：DSH 的 runtime-context 快照是 append-only 的；多次压缩可能同时留下多个锚点快照，块头声明“最新块覆盖旧块”，预算会限制总大小。
- **摘要可能看不到锚点**：`compaction-basic` 只重放被遮蔽区间；如果当前锚点快照在保留尾部，摘要模型看不到它。锚点块会在压缩后重新注入，并在精确措辞上优先。
- **`required: true` 会覆盖 suppression**：如果希望 `includeRuntimeContext: false` 同时关闭锚点，设 `required: false`。
- **projection 缓存会复制文本**：持久投影保存用户原文，以便请求渲染时不必使用已废弃的同步日志读取；这些内容与 Session log 中已有的内容重复。
- **projection 状态上限**：`maxAnchors` 限制持久化状态；窗口外的老锚点会被有意遗忘。

## 开发

这是一个独立包。本地 `node_modules` 通过 junction 指向 DSH 源码 checkout，仅用于类型检查和测试；它被 gitignore，不进入发布产物。

```sh
npm run typecheck   # 源码 + 测试
npm test            # vitest
npm run build       # tsc -> lib/index.js + lib/types
```

测试覆盖：

- surface 成员过滤（不重复锚定）；
- 原文保留，包括字面量 `{{...}}`；
- 软预算选择与硬上限截断；
- 整 Turn 丢弃与显式披露；
- `required` / suppression；
- source 过滤；
- 真实 AgentLoop 在 replacement 后的请求；
- 锚点快照自身被遮蔽后的重建。

## 许可

MIT

