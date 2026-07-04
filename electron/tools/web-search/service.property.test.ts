// @vitest-environment node

/**
 * Property-based test for the web search orchestrator no-fallback guarantee.
 *
 * Property 2 (No fallback): with a call-counting stub provider, any single
 * invocation makes ≤ 1 transport call across success and failure paths and
 * never retries a different intent/query/provider.
 *
 * **Validates: Requirements 6.3, 6.4, 8.8, 11.3, 11.5**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'

import type { WebSearchArgs } from './types'

// ---------------------------------------------------------------------------
// Mocking strategy
//
// The orchestrator (`service.ts`) imports `./providers/tavily` as a side-effect
// which registers the real Tavily provider. The real Tavily provider uses
// `global.fetch` for transport. To control transport behavior without real
// HTTP, we:
//
// 1. Mock `../../secureStorage` so the orchestrator reaches the provider
//    dispatch step (credential resolution returns a fake key).
// 2. Mock `global.fetch` with a call-counting spy that returns configurable
//    responses (success/failure/timeout).
//
// We do NOT mock the provider registry or Tavily provider code — we let the
// real orchestrator flow through to the real Tavily provider code and intercept
// at the fetch boundary. This validates the full no-fallback path end-to-end.
// ---------------------------------------------------------------------------

// Mock secure storage so credentials always resolve to a fake key.
vi.mock('../../secureStorage', () => ({
  getSecureValueAsync: vi.fn().mockResolvedValue('tvly-fake-test-key-12345'),
}))

// ---------------------------------------------------------------------------
// Shared config
// ---------------------------------------------------------------------------

const PROPERTY_TEST_CONFIG = {
  numRuns: 150,
  seed: 0xdead,
}

// ---------------------------------------------------------------------------
// Valid enum value sets
// ---------------------------------------------------------------------------

const VALID_SEARCH_DEPTHS = ['ultra-fast', 'fast', 'basic', 'advanced'] as const
const VALID_TIME_RANGES = ['day', 'week', 'month', 'year'] as const
const VALID_TOPICS = ['general', 'news', 'finance'] as const

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A non-empty query string (at least one non-whitespace char, no URL). */
const arbNonUrlQuery = fc.stringMatching(/^[a-zA-Z0-9 ]{1,100}$/).filter((s) => s.trim().length > 0)

/** A valid search_depth or undefined. */
const arbValidSearchDepth = fc.oneof(
  fc.constantFrom(...VALID_SEARCH_DEPTHS),
  fc.constant(undefined)
)

/** A valid time_range or undefined. */
const arbValidTimeRange = fc.oneof(fc.constantFrom(...VALID_TIME_RANGES), fc.constant(undefined))

/** A valid topic or undefined. */
const arbValidTopic = fc.oneof(fc.constantFrom(...VALID_TOPICS), fc.constant(undefined))

/** A valid num_results: integer or undefined. */
const arbNumResults = fc.oneof(fc.integer({ min: 1, max: 10 }), fc.constant(undefined))

/** A valid WebSearchArgs that should pass validation (query_search intent). */
const arbValidSearchArgs: fc.Arbitrary<WebSearchArgs> = fc.record({
  query: arbNonUrlQuery,
  num_results: arbNumResults,
  search_depth: arbValidSearchDepth as fc.Arbitrary<WebSearchArgs['search_depth']>,
  time_range: arbValidTimeRange as fc.Arbitrary<WebSearchArgs['time_range']>,
  topic: arbValidTopic as fc.Arbitrary<WebSearchArgs['topic']>,
  urls: fc.constant(undefined),
  include_images: fc.oneof(fc.boolean(), fc.constant(undefined)),
})

/** A valid WebSearchArgs for URL extraction intent (has at least one URL). */
const arbValidExtractArgs: fc.Arbitrary<WebSearchArgs> = fc.record({
  query: fc.constant('https://example.com'),
  num_results: arbNumResults,
  search_depth: arbValidSearchDepth as fc.Arbitrary<WebSearchArgs['search_depth']>,
  time_range: arbValidTimeRange as fc.Arbitrary<WebSearchArgs['time_range']>,
  topic: arbValidTopic as fc.Arbitrary<WebSearchArgs['topic']>,
  urls: fc.oneof(fc.constant(undefined), fc.constant(['https://example.com'])),
  include_images: fc.oneof(fc.boolean(), fc.constant(undefined)),
})

/** Any valid args (search or extract). */
const arbAnyValidArgs: fc.Arbitrary<WebSearchArgs> = fc.oneof(
  arbValidSearchArgs,
  arbValidExtractArgs
)

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

/** Possible fetch outcomes to simulate. */
type FetchOutcome = 'success' | 'error-status' | 'network-error' | 'timeout'

const arbFetchOutcome: fc.Arbitrary<FetchOutcome> = fc.constantFrom(
  'success',
  'error-status',
  'network-error',
  'timeout'
)

/** Build a Tavily-like success response for /search or /extract. */
function buildSuccessResponse(): Response {
  const body = JSON.stringify({
    results: [
      {
        title: 'Test Result',
        url: 'https://example.com/result',
        content: 'Test snippet content',
      },
    ],
    images: [],
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
}

/** Build a non-ok response. */
function buildErrorResponse(): Response {
  return new Response('Internal Server Error', { status: 500 })
}

/** Create a fetch mock that counts calls and returns the specified outcome. */
function createFetchMock(outcome: FetchOutcome): { mock: typeof fetch; callCount: () => number } {
  let count = 0

  const mock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    count++
    switch (outcome) {
      case 'success':
        return buildSuccessResponse()
      case 'error-status':
        return buildErrorResponse()
      case 'network-error':
        throw new TypeError('fetch failed')
      case 'timeout': {
        const err = new DOMException('The operation was aborted', 'AbortError')
        throw err
      }
    }
  }) as unknown as typeof fetch

  return { mock, callCount: () => count }
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
// Property tests
// ---------------------------------------------------------------------------

describe('executeWebSearch — Property 2: No fallback', () => {
  // Feature: web-search-backend-rebuild, Property 2: No fallback
  // **Validates: Requirements 6.3, 6.4, 8.8, 11.3, 11.5**

  it('success path: fetch is called at most 1 time per invocation', async () => {
    // Dynamically import after mocks are set up
    const { executeWebSearch } = await import('./service')

    await fc.assert(
      fc.asyncProperty(arbAnyValidArgs, async (args) => {
        const { mock, callCount } = createFetchMock('success')
        global.fetch = mock

        await executeWebSearch(args)

        expect(callCount()).toBeLessThanOrEqual(1)
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  it('failure path: fetch returning error status still makes at most 1 fetch call (no retry/fallback)', async () => {
    const { executeWebSearch } = await import('./service')

    await fc.assert(
      fc.asyncProperty(arbAnyValidArgs, async (args) => {
        const { mock, callCount } = createFetchMock('error-status')
        global.fetch = mock

        const result = await executeWebSearch(args)

        // Should have made at most 1 fetch call
        expect(callCount()).toBeLessThanOrEqual(1)
        // On error-status, the result should be a failure (no fallback to another provider)
        expect(result.success).toBe(false)
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  it('combined property: for any valid args with any fetch outcome, at most 1 transport call', async () => {
    const { executeWebSearch } = await import('./service')

    await fc.assert(
      fc.asyncProperty(arbAnyValidArgs, arbFetchOutcome, async (args, outcome) => {
        const { mock, callCount } = createFetchMock(outcome)
        global.fetch = mock

        const result = await executeWebSearch(args)

        // Core no-fallback invariant: at most 1 transport call per invocation
        expect(callCount()).toBeLessThanOrEqual(1)

        // Never throws — always returns a ToolResult
        expect(result).toBeDefined()
        expect(typeof result.success).toBe('boolean')

        // On failure outcomes, must be success:false (no silent substitution)
        if (outcome === 'error-status' || outcome === 'network-error' || outcome === 'timeout') {
          expect(result.success).toBe(false)
        }
      }),
      PROPERTY_TEST_CONFIG
    )
  })
})
