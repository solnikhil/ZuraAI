// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import type { ChatDiagnosticStreamChunk } from './chatDiagnostics'
import {
  STREAM_CHUNK_FLUSH_INTERVAL_MS,
  createStreamChunkCoalescer,
} from './streamChunkCoalescer'

interface TestHarness {
  emit: ReturnType<typeof vi.fn>
  schedule: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
  runScheduled: () => void
}

function makeHarness(): TestHarness {
  const scheduled: Array<() => void> = []
  const emit = vi.fn<[ChatDiagnosticStreamChunk], void>()
  const schedule = vi.fn((fn: () => void, _ms: number) => {
    scheduled.push(fn)
    return scheduled.length
  })
  const cancel = vi.fn()
  const runScheduled = () => {
    while (scheduled.length > 0) {
      const fn = scheduled.shift()
      fn?.()
    }
  }
  return { emit, schedule, cancel, runScheduled }
}

describe('createStreamChunkCoalescer', () => {
  it('exports the default flush interval', () => {
    expect(STREAM_CHUNK_FLUSH_INTERVAL_MS).toBe(50)
  })

  it('coalesces multiple text deltas into one event after the flush window', () => {
    const harness = makeHarness()
    const coalescer = createStreamChunkCoalescer({
      emit: harness.emit,
      schedule: harness.schedule,
      cancel: harness.cancel,
    })

    coalescer.recordTextDelta('Hello', 5)
    coalescer.recordTextDelta(', world', 12)
    coalescer.recordTextDelta('!', 13)

    expect(harness.schedule).toHaveBeenCalledTimes(1)
    expect(harness.emit).not.toHaveBeenCalled()

    harness.runScheduled()

    expect(harness.emit).toHaveBeenCalledTimes(1)
    expect(harness.emit).toHaveBeenCalledWith({
      chunkIndex: 0,
      cumulativeTextLength: 13,
      textDelta: 'Hello, world!',
    })
  })

  it('counts tool-call deltas alongside text deltas', () => {
    const harness = makeHarness()
    const coalescer = createStreamChunkCoalescer({
      emit: harness.emit,
      schedule: harness.schedule,
      cancel: harness.cancel,
    })

    coalescer.recordTextDelta('abc', 3)
    coalescer.recordToolCallDelta()
    coalescer.recordToolCallDelta(2)

    harness.runScheduled()

    expect(harness.emit).toHaveBeenCalledWith({
      chunkIndex: 0,
      cumulativeTextLength: 3,
      textDelta: 'abc',
      toolCallDeltaCount: 3,
    })
  })

  it('records smoothed text pieces in coalesced chunk metadata', () => {
    const harness = makeHarness()
    const coalescer = createStreamChunkCoalescer({
      emit: harness.emit,
      schedule: harness.schedule,
      cancel: harness.cancel,
    })

    coalescer.recordTextDelta('Buffered ', 9, {
      sourceLength: 48,
      pieceIndex: 0,
      pieceCount: 4,
    })
    coalescer.recordTextDelta('answer ', 16, {
      sourceLength: 48,
      pieceIndex: 1,
      pieceCount: 4,
    })

    harness.runScheduled()

    expect(harness.emit).toHaveBeenCalledWith({
      chunkIndex: 0,
      cumulativeTextLength: 16,
      textDelta: 'Buffered answer ',
      smoothingPieceCount: 2,
      smoothingSourceLength: 48,
    })
  })

  it('increments chunkIndex monotonically across flushes', () => {
    const harness = makeHarness()
    const coalescer = createStreamChunkCoalescer({
      emit: harness.emit,
      schedule: harness.schedule,
      cancel: harness.cancel,
    })

    coalescer.recordTextDelta('one', 3)
    harness.runScheduled()
    coalescer.recordTextDelta('two', 6)
    harness.runScheduled()

    expect(harness.emit).toHaveBeenCalledTimes(2)
    expect(harness.emit.mock.calls[0][0]).toMatchObject({ chunkIndex: 0 })
    expect(harness.emit.mock.calls[1][0]).toMatchObject({ chunkIndex: 1 })
  })

  it('flushes synchronously on demand and cancels the pending timer', () => {
    const harness = makeHarness()
    const coalescer = createStreamChunkCoalescer({
      emit: harness.emit,
      schedule: harness.schedule,
      cancel: harness.cancel,
    })

    coalescer.recordTextDelta('chunk', 5)
    expect(harness.schedule).toHaveBeenCalledTimes(1)

    coalescer.flush()

    expect(harness.cancel).toHaveBeenCalledTimes(1)
    expect(harness.emit).toHaveBeenCalledWith({
      chunkIndex: 0,
      cumulativeTextLength: 5,
      textDelta: 'chunk',
    })
  })

  it('does nothing when there is nothing to flush', () => {
    const harness = makeHarness()
    const coalescer = createStreamChunkCoalescer({
      emit: harness.emit,
      schedule: harness.schedule,
      cancel: harness.cancel,
    })

    coalescer.flush()
    harness.runScheduled()

    expect(harness.emit).not.toHaveBeenCalled()
  })

  it('omits text/tool fields when only the other side has data', () => {
    const harness = makeHarness()
    const coalescer = createStreamChunkCoalescer({
      emit: harness.emit,
      schedule: harness.schedule,
      cancel: harness.cancel,
    })

    coalescer.recordToolCallDelta(4)
    harness.runScheduled()

    expect(harness.emit).toHaveBeenCalledWith({
      chunkIndex: 0,
      cumulativeTextLength: 0,
      toolCallDeltaCount: 4,
    })
  })

  it('is a complete no-op when disabled', () => {
    const harness = makeHarness()
    const coalescer = createStreamChunkCoalescer({
      emit: harness.emit,
      schedule: harness.schedule,
      cancel: harness.cancel,
      enabled: false,
    })

    coalescer.recordTextDelta('ignored', 7)
    coalescer.recordToolCallDelta(2)
    coalescer.flush()
    harness.runScheduled()

    expect(harness.schedule).not.toHaveBeenCalled()
    expect(harness.emit).not.toHaveBeenCalled()
  })

  it('reset clears pending state, timer, and chunk counter', () => {
    const harness = makeHarness()
    const coalescer = createStreamChunkCoalescer({
      emit: harness.emit,
      schedule: harness.schedule,
      cancel: harness.cancel,
    })

    coalescer.recordTextDelta('first', 5)
    coalescer.reset()
    harness.runScheduled()
    expect(harness.cancel).toHaveBeenCalledTimes(1)
    expect(harness.emit).not.toHaveBeenCalled()

    coalescer.recordTextDelta('after', 5)
    harness.runScheduled()
    expect(harness.emit).toHaveBeenCalledWith(
      expect.objectContaining({ chunkIndex: 0, textDelta: 'after' })
    )
  })
})
