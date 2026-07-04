// @vitest-environment node

/**
 * Unit tests for orchestration routing in the web search service.
 *
 * Tests cover:
 * 1. Search dispatch: query-only input → success:true, data.source='tavily'
 * 2. Extract dispatch: URL-only input → success:true, data.source='tavily_extract'
 * 3. Missing key path: secureStorage returns '' → success:false, error mentions "Tavily API key"
 * 4. Provider failure pass-through: fetch returns 500 → success:false, error from provider
 * 5. Credential-read-failure path: getSecureValueAsync throws → success:false, error mentions "could not be read"
 * 6. Validation failure: empty query → success:false immediately, no fetch call
 *
 * _Requirements: 6.1, 6.2, 6.5, 6.6, 5.4_
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocking strategy:
// - Mock `../../secureStorage` to control credential behavior per test.
// - Mock `global.fetch` to control transport outcomes.
// - Import `executeWebSearch` from `./service` after mocks are established.
// ---------------------------------------------------------------------------

const mockGetSecureValueAsync = vi.fn()

vi.mock('../../secureStorage', () => ({
  getSecureValueAsync: (...args: unknown[]) => mockGetSecureValueAsync(...args),
}))

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>
let originalFetch: typeof global.fetch

beforeEach(() => {
  originalFetch = global.fetch
  fetchMock = vi.fn()
  global.fetch = fetchMock as unknown as typeof fetch
  // Default: credential present
  mockGetSecureValueAsync.mockResolvedValue('tvly-fake-test-key-12345')
})

afterEach(() => {
  global.fetch = originalFetch
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Import module under test (after mock declarations)
// ---------------------------------------------------------------------------

import { executeWebSearch } from './service'

// ---------------------------------------------------------------------------
// Test: 1. Search dispatch
// ---------------------------------------------------------------------------

describe('orchestration routing — search dispatch', () => {
  it('query-only input with valid key and successful fetch → success:true, data.source="tavily"', async () => {
    // Simulate a successful Tavily /search response
    const tavilyResponse = {
      results: [
        {
          title: 'TypeScript Handbook',
          url: 'https://www.typescriptlang.org/docs/handbook',
          content: 'The TypeScript Handbook is a comprehensive guide.',
        },
      ],
      images: [{ url: 'https://example.com/img.png' }],
    }

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(tavilyResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const result = await executeWebSearch({ query: 'typescript handbook' })

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()

    const data = result.data as { source: string; results: unknown[]; resultCount: number }
    expect(data.source).toBe('tavily')
    expect(data.results.length).toBeGreaterThan(0)
    expect(data.resultCount).toBe(data.results.length)

    // fetch should have been called exactly once (to /search)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/search')
  })
})

// ---------------------------------------------------------------------------
// Test: 2. Extract dispatch
// ---------------------------------------------------------------------------

describe('orchestration routing — extract dispatch', () => {
  it('URL-only input with valid key and successful fetch → success:true, data.source="tavily_extract"', async () => {
    // Simulate a successful Tavily /extract response
    const tavilyExtractResponse = {
      results: [
        {
          url: 'https://example.com/article',
          raw_content: 'Full article content here.',
        },
      ],
      failed_results: [],
    }

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(tavilyExtractResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const result = await executeWebSearch({ query: 'https://example.com/article' })

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()

    const data = result.data as { source: string; results: unknown[]; resultCount: number }
    expect(data.source).toBe('tavily_extract')
    expect(data.results.length).toBeGreaterThan(0)
    expect(data.resultCount).toBe(data.results.length)

    // fetch should have been called exactly once (to /extract)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/extract')
  })
})

// ---------------------------------------------------------------------------
// Test: 3. Missing key path
// ---------------------------------------------------------------------------

describe('orchestration routing — missing key path', () => {
  it('secureStorage returns empty string → success:false, error mentions "Tavily API key", fetch never called', async () => {
    mockGetSecureValueAsync.mockResolvedValue('')

    const result = await executeWebSearch({ query: 'test query' })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error).toContain('Tavily API key')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Test: 4. Provider failure pass-through
// ---------------------------------------------------------------------------

describe('orchestration routing — provider failure pass-through', () => {
  it('fetch returns 500 → success:false, error from the provider (contains "500" or "Tavily API error")', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))

    const result = await executeWebSearch({ query: 'test query' })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    // The error should contain the status code or provider error indication
    const errorContains500 = result.error!.includes('500')
    const errorContainsTavilyError = result.error!.toLowerCase().includes('tavily')
    expect(errorContains500 || errorContainsTavilyError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Test: 5. Credential-read-failure path
// ---------------------------------------------------------------------------

describe('orchestration routing — credential-read-failure path', () => {
  it('getSecureValueAsync throws → success:false, error mentions "could not be read"', async () => {
    mockGetSecureValueAsync.mockRejectedValue(new Error('Decryption failed'))

    const result = await executeWebSearch({ query: 'test query' })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error).toContain('could not be read')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Test: 6. Validation failure
// ---------------------------------------------------------------------------

describe('orchestration routing — validation failure', () => {
  it('empty query → success:false immediately, no fetch call', async () => {
    const result = await executeWebSearch({ query: '' })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('whitespace-only query → success:false immediately, no fetch call', async () => {
    const result = await executeWebSearch({ query: '   ' })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
