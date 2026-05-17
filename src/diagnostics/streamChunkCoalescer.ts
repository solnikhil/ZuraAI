import type { ChatDiagnosticStreamChunk } from './chatDiagnostics'

/**
 * Default debounce window before flushing a coalesced stream chunk.
 * Tuned to keep JSONL output sane on chatty providers without losing
 * useful resolution for the dev panel.
 */
export const STREAM_CHUNK_FLUSH_INTERVAL_MS = 50

export interface StreamChunkCoalescerEmit {
  (chunk: ChatDiagnosticStreamChunk): void
}

export interface StreamChunkCoalescerOptions {
  emit: StreamChunkCoalescerEmit
  /**
   * Override the flush window in tests. Production callers should use the
   * default ({@link STREAM_CHUNK_FLUSH_INTERVAL_MS}).
   */
  flushIntervalMs?: number
  /**
   * Inject a timer scheduler for tests. Defaults to `setTimeout` /
   * `clearTimeout` in the host environment.
   */
  schedule?: (fn: () => void, ms: number) => unknown
  cancel?: (handle: unknown) => void
  /** Set to `false` to disable coalescing entirely (e.g. production builds). */
  enabled?: boolean
}

export interface StreamChunkCoalescer {
  recordTextDelta: (delta: string, cumulativeTextLength: number) => void
  recordToolCallDelta: (deltaCount?: number) => void
  flush: () => void
  reset: () => void
}

/**
 * Coalesce provider streaming deltas into batched diagnostic events.
 *
 * The coalescer is held by the streaming hook for the lifetime of a single
 * assistant response. Each delta call accumulates state without immediately
 * persisting; a debounced timer (or an explicit `flush()` from the round
 * boundary) emits a single sanitized {@link ChatDiagnosticStreamChunk}.
 *
 * Pure module — no React, no IPC. The owner wires `emit` to whatever
 * `appendChatDiagnosticEvent` shape it needs.
 */
export function createStreamChunkCoalescer(
  options: StreamChunkCoalescerOptions
): StreamChunkCoalescer {
  const enabled = options.enabled !== false
  const flushIntervalMs = options.flushIntervalMs ?? STREAM_CHUNK_FLUSH_INTERVAL_MS
  const schedule =
    options.schedule ??
    ((fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as ReturnType<typeof setTimeout>)
  const cancel =
    options.cancel ??
    ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))

  let pendingTextDelta = ''
  let pendingToolCallDeltaCount = 0
  let chunkIndex = 0
  let latestCumulativeTextLength = 0
  let timerHandle: unknown = null

  const flushNow = () => {
    if (timerHandle !== null) {
      cancel(timerHandle)
      timerHandle = null
    }
    if (!pendingTextDelta && pendingToolCallDeltaCount === 0) return

    const chunk: ChatDiagnosticStreamChunk = {
      chunkIndex,
      cumulativeTextLength: latestCumulativeTextLength,
    }
    if (pendingTextDelta) {
      chunk.textDelta = pendingTextDelta
    }
    if (pendingToolCallDeltaCount > 0) {
      chunk.toolCallDeltaCount = pendingToolCallDeltaCount
    }

    chunkIndex += 1
    pendingTextDelta = ''
    pendingToolCallDeltaCount = 0

    options.emit(chunk)
  }

  const ensureTimer = () => {
    if (!enabled) return
    if (timerHandle !== null) return
    timerHandle = schedule(() => {
      timerHandle = null
      flushNow()
    }, flushIntervalMs)
  }

  return {
    recordTextDelta(delta, cumulativeTextLength) {
      if (!enabled) return
      latestCumulativeTextLength = cumulativeTextLength
      if (delta) {
        pendingTextDelta += delta
      }
      ensureTimer()
    },
    recordToolCallDelta(deltaCount = 1) {
      if (!enabled) return
      pendingToolCallDeltaCount += deltaCount
      ensureTimer()
    },
    flush() {
      if (!enabled) return
      flushNow()
    },
    reset() {
      if (timerHandle !== null) {
        cancel(timerHandle)
        timerHandle = null
      }
      pendingTextDelta = ''
      pendingToolCallDeltaCount = 0
      chunkIndex = 0
      latestCumulativeTextLength = 0
    },
  }
}
