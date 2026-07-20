import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { StreamingThrottler } from './streamingThrottler'

describe('StreamingThrottler pending updates', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('merges independently buffered fields without dropping streamed content', () => {
    const throttler = new StreamingThrottler({ maxUpdatesPerSecond: 1 })
    const update = vi.fn()

    throttler.throttle('session-1', 'message-1', { content: 'Hello' }, update)
    throttler.throttle('session-1', 'message-1', { content: 'Hello world' }, update)
    throttler.throttle(
      'session-1',
      'message-1',
      {
        toolResults: [
          {
            toolCall: { id: 'tool-1', name: 'demo', arguments: {} },
            result: { success: true, data: { complete: true } },
          },
        ],
      },
      update
    )

    expect(update).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1_000)

    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls[1]?.[2]).toEqual(
      expect.objectContaining({
        content: 'Hello world',
        toolResults: expect.arrayContaining([
          expect.objectContaining({ toolCall: expect.objectContaining({ id: 'tool-1' }) }),
        ]),
      })
    )
  })
})
