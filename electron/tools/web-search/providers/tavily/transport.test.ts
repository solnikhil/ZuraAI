// @vitest-environment node

/**
 * Unit tests for Tavily transport (`transport.ts`).
 *
 * Mock global `fetch` to verify:
 * - Successful responses are returned as `{ ok: true, payload }`
 * - Non-OK HTTP status is surfaced as `{ ok: false, error }` containing the status code
 * - Abort/timeout errors are surfaced as `{ ok: false, timedOut: true }`
 * - Network errors are surfaced as `{ ok: false, error }`
 * - Exactly one `fetch` call is made per invocation
 * - Empty URL list for extract returns early without calling fetch
 *
 * _Requirements: 7.4, 7.5, 7.6, 8.5, 8.6, 8.7_
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { tavilySearch, tavilyExtract } from './transport'
import type { ProviderSearchRequest, ProviderExtractRequest, ProviderContext } from '../../types'

// ---------------------------------------------------------------------------
// Minimal valid request/context fixtures
// ---------------------------------------------------------------------------

const searchRequest: ProviderSearchRequest = {
  query: 'what is TypeScript',
  numResults: 3,
  searchDepth: 'basic',
  includeImages: true,
}

const extractRequest: ProviderExtractRequest = {
  urls: ['https://example.com/page'],
  query: 'summarize',
  includeImages: false,
  intent: 'url_extract_with_query',
}

const ctx: ProviderContext = { apiKey: 'test-key-12345' }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOk(payload: unknown): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  })
}

function mockFetchNonOk(status: number, body: string): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(body),
  })
}

function mockFetchAbort(): ReturnType<typeof vi.fn> {
  const abortError = new Error('The operation was aborted')
  abortError.name = 'AbortError'
  return vi.fn().mockRejectedValue(abortError)
}

function mockFetchNetworkError(): ReturnType<typeof vi.fn> {
  return vi.fn().mockRejectedValue(new TypeError('fetch failed'))
}

// ---------------------------------------------------------------------------
// Tests: tavilySearch
// ---------------------------------------------------------------------------

describe('tavilySearch', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('returns { ok: true, payload } on successful response', async () => {
    const payload = { results: [{ title: 'TS', url: 'https://ts.dev', content: 'desc' }] }
    fetchMock = mockFetchOk(payload)
    vi.stubGlobal('fetch', fetchMock)

    const result = await tavilySearch(searchRequest, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload).toEqual(payload)
    }
  })

  it('returns { ok: false, error } containing status code on non-OK response', async () => {
    fetchMock = mockFetchNonOk(403, 'Forbidden - invalid key')
    vi.stubGlobal('fetch', fetchMock)

    const result = await tavilySearch(searchRequest, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('403')
      expect(result.error).toContain('Tavily API error')
    }
  })

  it('returns { ok: false, timedOut: true } on abort/timeout', async () => {
    fetchMock = mockFetchAbort()
    vi.stubGlobal('fetch', fetchMock)

    const result = await tavilySearch(searchRequest, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.timedOut).toBe(true)
      expect(result.error.toLowerCase()).toContain('timed out')
    }
  })

  it('returns { ok: false, error } on network error', async () => {
    fetchMock = mockFetchNetworkError()
    vi.stubGlobal('fetch', fetchMock)

    const result = await tavilySearch(searchRequest, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('fetch failed')
    }
  })

  it('makes exactly one fetch call per invocation', async () => {
    const payload = { results: [] }
    fetchMock = mockFetchOk(payload)
    vi.stubGlobal('fetch', fetchMock)

    await tavilySearch(searchRequest, ctx)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Tests: tavilyExtract
// ---------------------------------------------------------------------------

describe('tavilyExtract', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('returns { ok: true, payload } on successful response', async () => {
    const payload = { results: [{ url: 'https://example.com', raw_content: 'content' }] }
    fetchMock = mockFetchOk(payload)
    vi.stubGlobal('fetch', fetchMock)

    const result = await tavilyExtract(extractRequest, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload).toEqual(payload)
    }
  })

  it('returns { ok: false, error } containing status code on non-OK response', async () => {
    fetchMock = mockFetchNonOk(500, 'Internal Server Error')
    vi.stubGlobal('fetch', fetchMock)

    const result = await tavilyExtract(extractRequest, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('500')
      expect(result.error).toContain('Tavily Extract API error')
    }
  })

  it('returns { ok: false, timedOut: true } on abort/timeout', async () => {
    fetchMock = mockFetchAbort()
    vi.stubGlobal('fetch', fetchMock)

    const result = await tavilyExtract(extractRequest, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.timedOut).toBe(true)
      expect(result.error.toLowerCase()).toContain('timed out')
    }
  })

  it('returns { ok: false, error } without calling fetch when URL list is empty', async () => {
    fetchMock = mockFetchOk({})
    vi.stubGlobal('fetch', fetchMock)

    const emptyUrlsRequest: ProviderExtractRequest = {
      urls: [],
      includeImages: false,
      intent: 'url_extract',
    }

    const result = await tavilyExtract(emptyUrlsRequest, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.toLowerCase()).toContain('no valid url')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('makes exactly one fetch call per invocation when URLs are present', async () => {
    const payload = { results: [] }
    fetchMock = mockFetchOk(payload)
    vi.stubGlobal('fetch', fetchMock)

    await tavilyExtract(extractRequest, ctx)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
