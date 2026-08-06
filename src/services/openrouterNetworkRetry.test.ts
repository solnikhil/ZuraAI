import { afterEach, describe, expect, it, vi } from 'vitest'

import { streamOpenRouterCompletion } from './openrouter'
import type { ChatMessage } from './types'

const MESSAGES: ChatMessage[] = [{ role: 'user', content: 'hi' }]

/** A minimal successful SSE response ending in [DONE]. */
function sseResponse(): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(
        encoder.encode(
          'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n\n' +
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
            'data: [DONE]\n\n'
        )
      )
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

async function drain(generator: AsyncGenerator<unknown>): Promise<unknown[]> {
  const events: unknown[] = []
  for await (const event of generator) events.push(event)
  return events
}

/** undici-shaped transport failure: TypeError wrapping an errno cause. */
function transportFailure(code: string): TypeError {
  const error = new TypeError('fetch failed')
  ;(error as TypeError & { cause?: unknown }).cause = Object.assign(
    new Error(`${code} 127.0.0.1:443`),
    { code }
  )
  return error
}

/**
 * Runs `pending` to settlement while fast-forwarding the retry backoff, so the
 * test does not spend ~12s in real exponential delays.
 */
async function settleThroughBackoff<T>(pending: Promise<T>): Promise<T | Error> {
  const captured = pending.then(
    (value) => value,
    (error: Error) => error
  )
  for (let round = 0; round < 8; round += 1) {
    await vi.advanceTimersByTimeAsync(31_000)
  }
  return captured
}

describe('OpenRouter pre-response network retry (backoff fast-forwarded)', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('retries a transient connection reset and then succeeds', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(transportFailure('ECONNRESET'))
      .mockResolvedValueOnce(sseResponse())
    vi.stubGlobal('fetch', fetchMock)

    const result = await settleThroughBackoff(
      drain(streamOpenRouterCompletion('key', 'openai/gpt-4', MESSAGES) as AsyncGenerator<unknown>)
    )

    expect(result).not.toBeInstanceOf(Error)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((result as unknown[]).length).toBeGreaterThan(0)
  })

  it('retries transport failures up to the advertised policy then surfaces the cause', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockRejectedValue(transportFailure('ENOTFOUND'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await settleThroughBackoff(
      drain(streamOpenRouterCompletion('key', 'openai/gpt-4', MESSAGES) as AsyncGenerator<unknown>)
    )

    expect(result).toMatchObject({ name: 'ProviderError', code: 'network' })
    // maxRetries is 3, so 4 attempts total.
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})

describe('OpenRouter pre-response network retry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not retry an aborted request', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    const fetchMock = vi.fn().mockRejectedValue(abortError)
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    await expect(
      drain(
        streamOpenRouterCompletion('key', 'openai/gpt-4', MESSAGES, {
          signal: controller.signal,
        }) as AsyncGenerator<unknown>
      )
    ).rejects.toMatchObject({ name: 'ProviderError', code: 'aborted' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry a deterministic non-transport error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new RangeError('invalid request configuration'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      drain(streamOpenRouterCompletion('key', 'openai/gpt-4', MESSAGES) as AsyncGenerator<unknown>)
    ).rejects.toMatchObject({ name: 'ProviderError', code: 'unknown' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('aborting during backoff stops the retry loop', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const controller = new AbortController()
    const fetchMock = vi.fn().mockRejectedValue(transportFailure('ECONNRESET'))
    vi.stubGlobal('fetch', fetchMock)

    const pending = drain(
      streamOpenRouterCompletion('key', 'openai/gpt-4', MESSAGES, {
        signal: controller.signal,
      }) as AsyncGenerator<unknown>
    )

    // Let the first attempt fail and enter backoff, then cancel.
    await Promise.resolve()
    await Promise.resolve()
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
