# Chat Run Lifecycle

This document defines the renderer chat-run invariants that send, regenerate, research, and tool loops must share.

## State machine

```text
idle
  -> preparing
  -> streaming
  -> awaiting_tool
  -> executing_tools
  -> streaming (next model round)
  -> finalizing
  -> completed

Any active state -> cancelling -> cancelled
Any active state -> failed
```

`preparing` resolves the selected provider/model, main-owned credential availability, conversation window, memories, folder context, and request options. It must not mutate the saved assistant response.

`streaming` consumes sanitized provider events. Visible text, reasoning, usage, tool calls, and diagnostics are distinct event channels even when rendered together.

`executing_tools` validates model arguments, applies budgets, requests approval where required, records results, and appends the next model-round context. Only native provider tool calls are executable.

`finalizing` is the single authority for committing the assistant message, usage across every round, latency, reasoning/tool blocks, response version, title/memory follow-ups, and diagnostics completion.

## Required invariants

- Send and regenerate use the same request builder and run controller. Regenerate changes response-version selection but not provider/tool semantics.
- One run has one `AbortController`; cancellation propagates to provider I/O and stops scheduling additional tool/model rounds.
- Completion, failure, and cancellation finalize at most once.
- Streaming callbacks may update an in-memory draft, but persisted chat state changes through immutable context actions only.
- Tool/research budgets are checked before execution and accumulated across all model rounds.
- Usage is aggregated losslessly across rounds; estimated fields remain marked estimated.
- A final assistant answer is not replaced by empty synthesis. Exhausted research produces the best supported result with explicit unknowns.
- Background automation runs write only to their designated chat and never switch the active session.

## Persistence interaction

The chat context queues immutable session snapshots. A failed write remains dirty and is retried; newer snapshots supersede older pending snapshots without being lost. Index/session writes are tracked so self-generated store-change events are not mistaken for external edits.

Run finalization schedules persistence but does not assume a disk write completed synchronously. App shutdown and provider unmount perform best-effort flushing; main storage remains the transactional authority.

## Implementation ownership

- `chatRunController.ts` owns lifecycle transitions, the one abort signal, and exactly-once terminal finalization.
- `chatRunRequest.ts` builds the common provider request for send and regenerate using `streaming/chatRunConfig.ts`.
- `chatRunFinalization.ts` owns shared result-to-message updates and cleanup-safe lifecycle finalization.
- `useStreamingChat.ts` adapts React contexts and UI callbacks to those runtime primitives.
- `providerEventAccumulator.ts`, `researchLoopPolicy.ts`, `providerSynthesis.ts`, and `providerStreamFinalization.ts` isolate provider event, research, synthesis, and result-finalization concerns from the React hook.

## Test contract

Lifecycle tests should cover:

- Send and regenerate parity
- Cancellation during preparation, stream, approval, and tool execution
- Provider error before and after visible output
- Multiple tool/model rounds with lossless usage
- Research budget exhaustion and empty synthesis recovery
- Immutable response versions
- Exactly-once finalization
- Persistence failure followed by a newer snapshot and retry
