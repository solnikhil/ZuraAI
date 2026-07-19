# Chat run lifecycle

This describes how a chat send (or regenerate) moves from click to finished message. Send, regenerate, research loops, and tool loops should share the same rules.

## States

```text
idle
  → preparing
  → streaming
  → awaiting_tool / executing_tools
  → streaming again (next model round)
  → finalizing
  → completed

Any active state → cancelling → cancelled
Any active state → failed
```

- **preparing** — pick provider/model, check credentials, build conversation window, memories, and options. Do not rewrite the saved assistant answer here.
- **streaming** — consume clean provider events (text, reasoning, usage, tools are separate channels).
- **executing_tools** — validate args, enforce budgets, request approvals, record results, prepare the next model round. Only native provider tool calls run.
- **finalizing** — one place that commits the assistant message, usage across rounds, latency, tool/reasoning blocks, titles/memory follow-ups, and diagnostics.

## Rules that must not break

- Send and regenerate share the same controller and request builder. Regenerate only changes which response version is selected.
- One run has one `AbortController`. Cancel stops provider I/O and further tool rounds.
- Complete, fail, or cancel **once**.
- Live UI can draft in memory; durable chat updates go through immutable chat actions.
- Tool and research budgets apply before execution and across every model round.
- If two different tools hit the same infrastructure failure, stop the loop, keep the tool results, drop speculative narration, and show a clear “we did not observe/act beyond this” message.
- Aggregate usage across every round; mark estimates as estimates.
- Do not replace a real answer with empty synthesis.
- Background automation runs write to their own chat and must not steal focus.
- Every interactive run carries an opaque run id through **trusted tool context**, not model arguments. Main binds background-window ownership to that id and the sender window.
- When a run ends, release any background guard. Guard stop events cancel only that run.

## Persistence interaction

Chat context queues immutable session snapshots. A failed write stays dirty and retries; newer snapshots win without being dropped. Self-triggered store events must not look like external edits.

Finalization schedules persistence; it does not wait for disk. Shutdown does a best-effort flush. Main storage remains the source of truth.

## Code ownership

| Module | Role |
| ------ | ---- |
| `chatRunController.ts` | Lifecycle, abort, once-only terminal states |
| `chatRunRequest.ts` / `chatRunConfig.ts` | Shared request construction |
| `chatRunFinalization.ts` | Commit message + cleanup |
| `useStreamingChat.ts` | React/context adapter |
| stream modules under `streaming/` | Provider events, research policy, synthesis |

## Tests

Cover send and regenerate parity, cancel mid-stream, tool approval paths, multi-round usage, infrastructure double-failure, and background-run isolation. See existing tests under `src/components/Dashboard/ChatArea/hooks/`.
