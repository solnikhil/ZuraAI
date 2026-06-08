// @vitest-environment node

/**
 * Unit tests for the Tavily provider (`providers/tavily/index.ts`).
 *
 * Verifies:
 * 1. tavilyProvider.id is 'tavily'
 * 2. tavilyProvider.credentialKey is 'tavilyApiKey'
 * 3. tavilyProvider.capabilities.search is true
 * 4. tavilyProvider.capabilities.extract is true
 * 5. tavilyProvider is registered (resolveProvider('tavily') returns it)
 * 6. search with a mocked successful fetch → returns ok:true with correct data shape
 * 7. search with a mocked fetch failure (non-OK) → returns ok:false, never ok:true
 * 8. extract with a mocked successful fetch → returns ok:true with source='tavily_extract'
 * 9. extract with a mocked fetch failure → returns ok:false, never ok:true
 * 10. Neither search nor extract ever throws (wrap in try/catch to verify)
 *
 * _Requirements: 4.1, 7.6, 8.7_
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { tavilyProvider } from './index'
import { resolveProvider } from '../registry'
import type { ProviderSearchRequest, ProviderExtractRequest, ProviderContext } from '../../types'

// ---------------------------------------------------------------------------
// Minimal request/context fixtures
// ---------------------------------------------------------------------------

const searchRequest: ProviderSearchRequest = {
  query: 'what is Vitest',
  numResults: 3,
  searchDepth: 'basic',
  includeImages: true,
}

const extractRequest: ProviderExtractRequest = {
  urls: ['https://example.com/docs'],
  query: 'summarize the page',
  includeImages: false,
  intent: 'url_extract_with_query',
}

const ctx: ProviderContext = { apiKey: 'test-tavily-key-abc123' }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOkSearch(): ReturnType<typeof vi.fn> {
  const payload = {
    results: [
      { title: 'Vitest', url: 'https://vitest.dev', content: 'A fast test runner' },
      { title: 'Vitest docs', url: 'https://vitest.dev/guide', content: 'Getting started' },
    ],
    images: [
      { url: 'https://vitest.dev/logo.png' },
    ],
  }
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  })
}

function mockFetchOkExtract(): ReturnType<typeof vi.fn> {
  const payload = {
    results: [
      { url: 'https://example.com/docs', raw_content: '# Documentation\nContent here' },
    ],
    failed_results: [],
  }
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

function mockFetchNetworkError(): ReturnType<typeof vi.fn> {
  return vi.fn().mockRejectedValue(new TypeError('fetch failed'))
}

// ---------------------------------------------------------------------------
// Tests: Provider identity and capabilities
// ---------------------------------------------------------------------------

describe('tavilyProvider identity and capabilities', () => {
  it('has id "tavily"', () => {
    expect(tavilyProvider.id).toBe('tavily')
  })

  it('has credentialKey "tavilyApiKey"', () => {
    expect(tavilyProvider.credentialKey).toBe('tavilyApiKey')
  })

  it('declares search capability as true', () => {
    expect(tavilyProvider.capabilities.search).toBe(true)
  })

  it('declares extract capability as true', () => {
    expect(tavilyProvider.capabilities.extract).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests: Registration side effect
// ---------------------------------------------------------------------------

describe('tavilyProvider registration', () => {
  it('is registered and resolveProvider("tavily") returns it', () => {
    const resolved = resolveProvider('tavily')
    expect(resolved).toBe(tavilyProvider)
  })
})

// ---------------------------------------------------------------------------
// Tests: search operation
// ---------------------------------------------------------------------------

describe('tavilyProvider.search', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('returns ok:true with correct data shape on successful fetch', async () => {
    vi.stubGlobal('fetch', mockFetchOkSearch())

    const result = await tavilyProvider.search(searchRequest, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toHaveProperty('results')
      expect(result.data).toHaveProperty('images')
      expect(result.data).toHaveProperty('resultCount')
      expect(result.data).toHaveProperty('imageCount')
      expect(result.data).toHaveProperty('source', 'tavily')
      expect(result.data.resultCount).toBe(result.data.results.length)
      expect(result.data.imageCount).toBe(result.data.images.length)
    }
  })

  it('returns ok:false and never ok:true on fetch failure (non-OK status)', async () => {
    vi.stubGlobal('fetch', mockFetchNonOk(401, 'Unauthorized'))

    const result = await tavilyProvider.search(searchRequest, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeTruthy()
      expect(result.error.length).toBeGreaterThan(0)
    }
  })

  it('returns ok:false on network error', async () => {
    vi.stubGlobal('fetch', mockFetchNetworkError())

    const result = await tavilyProvider.search(searchRequest, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeTruthy()
    }
  })

  it('never throws (catches all errors internally)', async () => {
    vi.stubGlobal('fetch', mockFetchNetworkError())

    let threw = false
    try {
      await tavilyProvider.search(searchRequest, ctx)
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: extract operation
// ---------------------------------------------------------------------------

describe('tavilyProvider.extract', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('returns ok:true with source "tavily_extract" on successful fetch', async () => {
    vi.stubGlobal('fetch', mockFetchOkExtract())

    const result = await tavilyProvider.extract(extractRequest, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toHaveProperty('results')
      expect(result.data).toHaveProperty('images')
      expect(result.data).toHaveProperty('resultCount')
      expect(result.data).toHaveProperty('imageCount')
      expect(result.data).toHaveProperty('source', 'tavily_extract')
      expect(result.data.resultCount).toBe(result.data.results.length)
      expect(result.data.imageCount).toBe(result.data.images.length)
    }
  })

  it('returns ok:false and never ok:true on fetch failure (non-OK status)', async () => {
    vi.stubGlobal('fetch', mockFetchNonOk(500, 'Internal Server Error'))

    const result = await tavilyProvider.extract(extractRequest, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeTruthy()
      expect(result.error.length).toBeGreaterThan(0)
    }
  })

  it('returns ok:false on network error', async () => {
    vi.stubGlobal('fetch', mockFetchNetworkError())

    const result = await tavilyProvider.extract(extractRequest, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeTruthy()
    }
  })

  it('never throws (catches all errors internally)', async () => {
    vi.stubGlobal('fetch', mockFetchNetworkError())

    let threw = false
    try {
      await tavilyProvider.extract(extractRequest, ctx)
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })
})
