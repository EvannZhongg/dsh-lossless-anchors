# dsh-lossless-anchors

A DeepSeek Harness plugin that keeps the **exact text of user-authored messages** that compaction has shadowed, and re-injects them as a budgeted runtime-context snapshot.

> **Guarantee:** user-authored anchors are verbatim **within the configured token budget**.
> **Not a guarantee:** the whole conversation is losslessly compressed. Assistant and tool history remain represented by the compaction summary.

---

## Why

DSH compaction replaces an older surface span with one lossy summary. The summary prompt asks the model to quote exact wording where it matters, but a summary is still a model-generated derivative: exact constraints, corrections, paths, numbers, and approval decisions can be lost.

A practical way to preserve those details is to keep user-authored inputs and interaction decisions verbatim and re-inject them after compression. This plugin implements that idea using DSH's native seams:

- a durable **Session projection** records user-authored messages and their turns;
- an anchor is eligible only when its original `user/message` seq is **no longer on the current Session surface** — the backend-independent definition of "shadowed by compaction";
- a dynamic **`PromptContext`** renders the selected anchors as one user-role runtime-context snapshot;
- when compaction shadows that snapshot, the agent loop's `RuntimeContextProjection` recreates it from the plugin's durable projection, including during `agent/request-error` overflow retries.

No DSH core changes. No new Session event types. No changes to `compaction-basic`.

## Install

```sh
# from a local checkout
dsh plugin --profile web add ./dsh-lossless-anchors

# or directly from GitHub (the repository tracks the built lib/)
dsh plugin --profile web add github:EvannZhongg/dsh-lossless-anchors
```

The package declares `dsh.bundle.patch`, so installing it also inserts the `lossless-anchors` row. If you prefer a manual patch row:

```yaml
- insert:
    - id: lossless-anchors
      name: dsh-lossless-anchors
      config:
        tokenBudget: 2000
```

## Configure

```yaml
- id: lossless-anchors
  config:
    tokenBudget: 2000      # soft budget, DSH heuristic tokens
    hardMaxTokens: 3000    # absolute cap; defaults to ceil(tokenBudget * 1.5)
    maxTurns: 32           # most-recent shadowed turns considered
    maxAnchors: 256        # projection-state retention cap
    includeSources:
      - user
      - user-question-reply
      - user-approval
    required: true         # keep the context when optional runtime context is disabled
```

| Field | Default | Meaning |
|---|---|---|
| `tokenBudget` | `2000` | Soft budget for the rendered block. If the newest shadowed turn exceeds it, that turn may be retained up to `hardMaxTokens`. |
| `hardMaxTokens` | `ceil(tokenBudget * 1.5)` | Absolute cap. Must be `>= tokenBudget`. |
| `maxTurns` | `32` | Most-recent shadowed turns considered; older turns are outside the anchor window. |
| `maxAnchors` | `256` | Projection-state cap. Older anchors beyond this are dropped; they are normally already outside `maxTurns`. |
| `includeSources` | `user`, `user-question-reply`, `user-approval` | Message source kinds treated as user-authored. `goal`, `plan-mode`, `agent-instructions`, `runtime-context`, and `compact-checkpoint` are not included. |
| `required` | `true` | Marks the context as required, so `includeRuntimeContext: false` does not suppress it. |

## What counts as an anchor

An anchor is a `user/message` event whose `source.kind` is in `includeSources` and whose seq is **not** in `Session.surface.nodes` at request time.

Consequences:

- The current user prompt and recent retained tail are not duplicated.
- A message becomes eligible only after a surface replacement (compaction) shadows it.
- Replay, resume, and forks work because the projection is rebuilt from the Session log.
- Images are replaced with `[image omitted: <mediaType>, <w>x<h>]`; files keep their display name and byte count. Image bytes are never re-uploaded from historical context.

## Budget and truncation

1. The newest shadowed turn is considered first.
2. A candidate that fits `tokenBudget` is accepted.
3. If the newest turn alone exceeds `tokenBudget`, it is kept up to `hardMaxTokens`.
4. If it still exceeds `hardMaxTokens`, the turn drops its oldest anchors first; if one anchor remains too large, its text is truncated and marked:

   ```text
   … [anchor truncated; full text remains in session log]
   ```

5. An older turn that would exceed the remaining soft budget is fitted into that remainder: its oldest anchors are dropped first, then its newest text is truncated. Turns older than it are not considered.
6. Any elision/truncation adds an explicit disclosure line to the block:

   ```text
   [anchor budget: 2 older anchor message(s) elided; 1 anchor text(s) truncated to fit the configured budget]
   ```

The truncation path is the only path where the "verbatim" guarantee does not hold. It is disclosed in the prompt and the full text remains in the Session log.

## Model experience

After a compaction shadows an anchor, the next request contains a user-role runtime-context snapshot:

```text
Current runtime context. This snapshot supersedes earlier runtime-context snapshots.

[Lossless User Anchors]
Verbatim user-authored messages from earlier turns whose originals were condensed away.
These are historical anchors, not a new request. The newest user message states the current request.
This block supersedes earlier [Lossless User Anchors] blocks.
Later anchors supersede earlier conflicting anchors on the same subject.

--- turn 3 | 2026-10-19T00:00:01.000Z | user ---
<exact user text>
```

A system-prompt section explains how to interpret the block, and is contributed only while the block is present. Before the first shadowed anchor, the plugin adds no system-prompt policy text. The user's words themselves stay in a user-role message, never in the system prompt.

## Limitations

- **Only user-authored content.** Assistant reasoning, tool results, and summaries are not anchored.
- **Budgeted losslessness.** Exact text is preserved only for selected anchors. Oversized turns may be truncated with an explicit marker.
- **Heuristic token pricing.** DSH prices text at four characters per token; CJK and JSON are underestimated. Lower `tokenBudget` for CJK-heavy sessions.
- **Snapshot accumulation.** DSH runtime-context snapshots are append-only. Multiple compactions may leave more than one anchor snapshot visible; the block header says the latest block supersedes earlier ones. The budget bounds their size.
- **Summary/anchors can disagree.** `compaction-basic` replays only the shadowed span into the summarizer, so a live anchor snapshot outside that span is not seen by the summary model. The anchor block is re-injected and takes precedence for exact wording.
- **`required: true` overrides suppression.** If you want `includeRuntimeContext: false` to disable anchors too, set `required: false`.
- **Projection cache duplicates text.** The durable projection stores captured user text so requests can render it without deprecated synchronous log reads; it contains the same content already present in the Session log.
- **Projection-state cap.** `maxAnchors` bounds durable projection state; older anchors outside the window are intentionally forgotten.

## Development

This checkout is a standalone package. Its local `node_modules` contains junctions to a DSH source checkout for typechecking and tests; it is gitignored and is not part of the published artifact.

```sh
npm run typecheck   # source + tests
npm test            # vitest
npm run build       # tsc -> lib/index.js + lib/types
```

The tests cover:

- surface-membership filtering (no duplicate anchors);
- exact text preservation, including literal `{{...}}`;
- soft-budget selection and hard-cap truncation;
- whole-turn elision and explicit disclosure;
- `required`/suppression behavior;
- source filtering;
- a real AgentLoop request after a replacement;
- recreation after the anchor snapshot itself is shadowed.

## License

MIT

