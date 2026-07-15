import { describe, expect, it } from 'vitest'
import { parseRetryAfterMs, toProviderError } from './errors'

describe('provider errors', () => {
  it('preserves Retry-After seconds and HTTP dates', () => {
    expect(parseRetryAfterMs('2')).toBe(2_000)
    expect(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:03 GMT', Date.UTC(2026, 0, 1))).toBe(3_000)
  })

  it('distinguishes timeouts from user cancellation', () => {
    expect(toProviderError(new DOMException('timed out', 'TimeoutError'), 'groq')).toMatchObject({
      code: 'timeout',
      retryable: true,
    })
    expect(toProviderError(new DOMException('cancelled', 'AbortError'), 'groq')).toMatchObject({
      code: 'aborted',
      retryable: false,
    })
  })
})
