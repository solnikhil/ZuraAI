// @vitest-environment node

/**
 * Integration test through the `execute-tool` path.
 *
 * Validates that `executeWebSearch` (the same code path wired by
 * `registerToolHandlers()` for `web_search`) returns a `ToolResult.data` shape
 * that matches the renderer-facing golden contract (WebSearchData keys).
 *
 * Strategy:
 * - Mock `../../secureStorage` to return a fake API key.
 * - Mock `global.fetch` to return realistic Tavily /search and /extract
 *   response fixtures.
 * - Call `executeWebSearch` directly (same code path the IPC handler invokes).
 * - Assert the `ToolResult.data` key shape is unchanged.
 *
 * **Validates: Requirements 1.5, 1.6, 1.7**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock secure storage so the orchestrator reaches the provider dispatch step.
vi.mock('../../secureStorage', () => ({
  getSecureValueAsync: vi.fn().mockResolvedValue('tvly-fake-integration-key-00000'),
}))

// ---------------------------------------------------------------------------
// Realistic Tavily response fixtures
// ---------------------------------------------------------------------------

const TAVILY_SEARCH_RESPONSE = {
  query: 'latest AI news',
  results: [
    {
      title: 'AI Advances in 2025',
      url: 'https://example.com/ai-advances',
      content: 'Artificial intelligence continues to evolve rapidly with new breakthroughs.',
      raw_content: null,
      score: 0.95,
      published_date: '2025-01-15',
    },
    {
      title: 'Machine Learning Trends',
      url: 'https://example.com/ml-trends',
      content: 'Machine learning models are getting smaller and more efficient.',
      raw_content: null,
      score: 0.88,
      published_date: '2025-01-10',
    },
  ],
  images: [
    {
      url: 'https://example.com/images/ai-chart.png',
      description: 'AI growth chart',
    },
    {
      url: 'https://example.com/images/ml-diagram.png',
      description: 'ML architecture diagram',
    },
  ],
  response_time: 1.23,
}

const TAVILY_EXTRACT_RESPONSE = {
  results: [
    {
      url: 'https://docs.example.com/guide',
      raw_content: '# Getting Started\n\nThis is a comprehensive guide to the platform.',
      content: 'Getting Started - This is a comprehensive guide to the platform.',
    },
  ],
  failed_results: [],
  response_time: 2.1,
}

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function createSearchFetchMock(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.includes('/search')) {
      return new Response(JSON.stringify(TAVILY_SEARCH_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('/extract')) {
      return new Response(JSON.stringify(TAVILY_EXTRACT_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('Not Found', { status: 404 })
  }) as unknown as typeof fetch
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let originalFetch: typeof global.fetch

beforeEach(() => {
  originalFetch = global.fetch
})

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('executeWebSearch — Integration: ToolResult.data golden shape', () => {
  it('query_search: data shape matches the renderer-facing WebSearchData contract', async () => {
    global.fetch = createSearchFetchMock()
    const { executeWebSearch } = await import('./service')

    const result = await executeWebSearch({
      query: 'latest AI news',
      num_results: 2,
      search_depth: 'basic',
      include_images: true,
    })

    // Must succeed
    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()

    const data = result.data as Record<string, unknown>

    // Golden contract: required WebSearchData keys
    expect(data).toHaveProperty('query')
    expect(data).toHaveProperty('results')
    expect(data).toHaveProperty('images')
    expect(data).toHaveProperty('resultCount')
    expect(data).toHaveProperty('imageCount')
    expect(data).toHaveProperty('source')

    // Type assertions on the required keys
    expect(typeof data.query).toBe('string')
    expect(Array.isArray(data.results)).toBe(true)
    expect(Array.isArray(data.images)).toBe(true)
    expect(typeof data.resultCount).toBe('number')
    expect(typeof data.imageCount).toBe('number')
    expect(typeof data.source).toBe('string')

    // Count consistency
    expect(data.resultCount).toBe((data.results as unknown[]).length)
    expect(data.imageCount).toBe((data.images as unknown[]).length)

    // Source must be 'tavily' for query_search
    expect(data.source).toBe('tavily')

    // searchDepth is present for search results
    expect(typeof data.searchDepth).toBe('string')

    // Validate individual result shape
    const results = data.results as Record<string, unknown>[]
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r).toHaveProperty('title')
      expect(r).toHaveProperty('url')
      expect(r).toHaveProperty('snippet')
      expect(typeof r.title).toBe('string')
      expect(typeof r.url).toBe('string')
      expect(typeof r.snippet).toBe('string')
    }
  })

  it('url_extract: data shape matches with source === "tavily_extract"', async () => {
    global.fetch = createSearchFetchMock()
    const { executeWebSearch } = await import('./service')

    const result = await executeWebSearch({
      query: 'https://docs.example.com/guide',
      include_images: true,
    })

    // Must succeed
    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()

    const data = result.data as Record<string, unknown>

    // Golden contract: required WebSearchData keys
    expect(data).toHaveProperty('query')
    expect(data).toHaveProperty('results')
    expect(data).toHaveProperty('images')
    expect(data).toHaveProperty('resultCount')
    expect(data).toHaveProperty('imageCount')
    expect(data).toHaveProperty('source')

    // Type assertions
    expect(typeof data.query).toBe('string')
    expect(Array.isArray(data.results)).toBe(true)
    expect(Array.isArray(data.images)).toBe(true)
    expect(typeof data.resultCount).toBe('number')
    expect(typeof data.imageCount).toBe('number')
    expect(typeof data.source).toBe('string')

    // Count consistency
    expect(data.resultCount).toBe((data.results as unknown[]).length)
    expect(data.imageCount).toBe((data.images as unknown[]).length)

    // Source must be 'tavily_extract' for URL extraction
    expect(data.source).toBe('tavily_extract')

    // Validate individual result shape
    const results = data.results as Record<string, unknown>[]
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r).toHaveProperty('title')
      expect(r).toHaveProperty('url')
      expect(r).toHaveProperty('snippet')
      expect(typeof r.title).toBe('string')
      expect(typeof r.url).toBe('string')
      expect(typeof r.snippet).toBe('string')
    }
  })

  it('query_search: success is true when mocked provider returns results', async () => {
    global.fetch = createSearchFetchMock()
    const { executeWebSearch } = await import('./service')

    const result = await executeWebSearch({
      query: 'what is TypeScript',
    })

    expect(result.success).toBe(true)
  })

  it('url_extract: success is true when mocked provider extracts a URL', async () => {
    global.fetch = createSearchFetchMock()
    const { executeWebSearch } = await import('./service')

    const result = await executeWebSearch({
      query: 'https://docs.example.com/guide',
    })

    expect(result.success).toBe(true)
  })

  it('accepts all documented WebSearchArgs fields without error (Req 1.7)', async () => {
    global.fetch = createSearchFetchMock()
    const { executeWebSearch } = await import('./service')

    // Exercise every field from the WebSearchArgs interface
    const result = await executeWebSearch({
      query: 'climate change research',
      num_results: 3,
      search_depth: 'advanced',
      time_range: 'month',
      topic: 'news',
      urls: undefined,
      include_images: false,
    })

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()

    const data = result.data as Record<string, unknown>
    // Images gated: include_images = false → empty images
    expect(data.imageCount).toBe(0)
    expect((data.images as unknown[]).length).toBe(0)
  })
})
