import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkOllamaStatus, enrichOllamaModelsWithContext, listOllamaModels } from './ollama'

const BASE_URL = 'http://127.0.0.1:11434'

function showResponse(contextLength: number): Response {
  return new Response(JSON.stringify({ model_info: { 'llama.context_length': contextLength } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function models(count: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    code: `model-${index}`,
    displayName: `model-${index}`,
  }))
}

/**
 * fetch stub that records peak concurrency and resolves after a microtask, so
 * overlapping requests are actually observable.
 */
function trackingFetch(onCall?: (url: string, init?: RequestInit) => void) {
  const state = { active: 0, peak: 0, calls: 0 }
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    state.calls += 1
    state.active += 1
    state.peak = Math.max(state.peak, state.active)
    onCall?.(url, init)
    try {
      await Promise.resolve()
      await Promise.resolve()
      return showResponse(4096)
    } finally {
      state.active -= 1
    }
  })
  return { fetchMock, state }
}

/** A fetch that never settles unless its signal aborts. */
function hangingFetch() {
  const started: AbortSignal[] = []
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    const signal = init?.signal ?? undefined
    if (signal) started.push(signal)
    return new Promise<Response>((_resolve, reject) => {
      if (!signal) return
      if (signal.aborted) {
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
        return
      }
      signal.addEventListener(
        'abort',
        () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')),
        { once: true }
      )
    })
  })
  return { fetchMock, started }
}

describe('Ollama catalog cancellation and concurrency', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('bounds simultaneous /api/show requests for a large catalog', async () => {
    const { fetchMock, state } = trackingFetch()
    vi.stubGlobal('fetch', fetchMock)

    const result = await enrichOllamaModelsWithContext(BASE_URL, models(120))

    expect(state.calls).toBe(120)
    expect(state.peak).toBeLessThanOrEqual(4)
    expect(state.peak).toBeGreaterThan(1)
    expect(result).toHaveLength(120)
  })

  it('preserves catalog order despite out-of-order completion', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { name: string }
      const index = Number(body.name.split('-')[1])
      // Later models resolve first.
      await new Promise((resolve) => setTimeout(resolve, (10 - index) * 2))
      return showResponse(1000 + index)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await enrichOllamaModelsWithContext(BASE_URL, models(10))

    expect(result.map((model) => model.code)).toEqual(models(10).map((model) => model.code))
    expect(result.map((model) => model.maxContext)).toEqual(
      Array.from({ length: 10 }, (_unused, index) => 1000 + index)
    )
  })

  it('threads the abort signal into every /api/show request', async () => {
    const seen: (AbortSignal | null | undefined)[] = []
    const { fetchMock } = trackingFetch((_url, init) => seen.push(init?.signal))
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    await enrichOllamaModelsWithContext(BASE_URL, models(6), controller.signal)

    expect(seen).toHaveLength(6)
    for (const signal of seen) {
      expect(signal).toBe(controller.signal)
    }
  })

  it('rejects and stops issuing work when the catalog request is cancelled', async () => {
    const { fetchMock, started } = hangingFetch()
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    const pending = enrichOllamaModelsWithContext(BASE_URL, models(50), controller.signal)

    // Only the bounded pool is in flight, not all 50.
    await Promise.resolve()
    expect(started.length).toBeLessThanOrEqual(4)

    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })

    // Cancellation must not have queued the remaining models.
    const callsAtAbort = fetchMock.mock.calls.length
    await Promise.resolve()
    expect(fetchMock.mock.calls.length).toBe(callsAtAbort)
    expect(callsAtAbort).toBeLessThan(50)
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const { fetchMock } = trackingFetch()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      enrichOllamaModelsWithContext(BASE_URL, models(5), AbortSignal.abort())
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('threads the abort signal into the tags request', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    await listOllamaModels(BASE_URL, controller.signal)

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.signal).toBe(controller.signal)
  })

  it('cancels a hung tags request instead of hanging forever', async () => {
    const { fetchMock } = hangingFetch()
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    const pending = listOllamaModels(BASE_URL, controller.signal)
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('does not report a cancelled status probe as "Ollama is down"', async () => {
    const { fetchMock } = hangingFetch()
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    const pending = checkOllamaStatus(BASE_URL, controller.signal)
    controller.abort()

    // Returning false here would let a cancelled probe be mistaken for a real
    // "not running" answer and silently drop the local catalog.
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('still reports false when Ollama genuinely cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      })
    )

    await expect(checkOllamaStatus(BASE_URL)).resolves.toBe(false)
  })
})
