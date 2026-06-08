// @vitest-environment node

/**
 * Property-based test for contract preservation.
 *
 * Property 1 (Contract preservation): for arbitrary `WebSearchArgs`,
 * `executeWebSearch` resolves to a `ToolResult` and never throws; successful
 * `data` contains `query`, `results`, `images`, `resultCount`, `imageCount`,
 * `source`.
 *
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.5**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'

// ---------------------------------------------------------------------------
// Mocks
//
// 1. Mock `../../secureStorage` to return a fake API key so the orchestrator
//    reaches provider dispatch on valid input.
// 2. Mock `global.fetch` to return a Tavily-like success response with valid
//    results and images.
// ---------------------------------------------------------------------------

vi.mock('../../secureStorage', () => ({
  getSecureValueAsync: vi.fn().mockResolvedValue('tvly-fake-contract-key-99999'),
}))

/** Build a Tavily-like success response for both /search and /extract. */
function buildTavilySuccessResponse(): Response {
  const body = JSON.stringify({
    results: [
      {
        title: 'Contract Test Result',
        url: 'https://example.com/contract',
        content: 'A snippet for the contract test.',
      },
    ],
    images: [
      {
        url: 'https://example.com/image.png',
        description: 'Test image',
      },
    ],
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
  return buildTavilySuccessResponse()
}) as unknown as typeof fetch

vi.stubGlobal('fetch', fetchMock)

// Import after mocks are set up
import { executeWebSearch } from './service'

// ---------------------------------------------------------------------------
// Shared config
// ---------------------------------------------------------------------------

const PROPERTY_TEST_CONFIG = {
  numRuns: 150,
  seed: 0xbeef,
}

// ---------------------------------------------------------------------------
// Generators
//
// We use `fc.anything()` to generate truly arbitrary values (nulls, missing
// fields, bad types, wrong shapes) to verify the function never throws and
// always resolves to a ToolResult regardless of input.
// ---------------------------------------------------------------------------

/** Completely arbitrary args — could be null, undefined, objects, arrays, etc. */
const arbAnythingArgs: fc.Arbitrary<unknown> = fc.anything()

/**
 * Valid WebSearchArgs that should reach the provider and return success.
 * Uses constrained generation to produce inputs that pass validation.
 */
const arbValidArgs = fc.record({
  query: fc.stringMatching(/^[a-zA-Z0-9 ]{1,100}$/).filter((s) => s.trim().length > 0),
  num_results: fc.oneof(fc.integer({ min: 1, max: 10 }), fc.constant(undefined)),
  search_depth: fc.oneof(
    fc.constantFrom('ultra-fast', 'fast', 'basic', 'advanced'),
    fc.constant(undefined),
  ),
  time_range: fc.oneof(
    fc.constantFrom('day', 'week', 'month', 'year'),
    fc.constant(undefined),
  ),
  topic: fc.oneof(
    fc.constantFrom('general', 'news', 'finance'),
    fc.constant(undefined),
  ),
  urls: fc.constant(undefined),
  include_images: fc.oneof(fc.boolean(), fc.constant(undefined)),
})

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchMock.mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('executeWebSearch — Property 1: Contract preservation', () => {
  // Feature: web-search-backend-rebuild, Property 1: Contract preservation
  // **Validates: Requirements 1.2, 1.3, 1.4, 1.5**

  it('never throws: for any args (fc.anything()), executeWebSearch resolves without throwing', async () => {
    await fc.assert(
      fc.asyncProperty(arbAnythingArgs, async (args) => {
        // The function must never throw/reject regardless of input shape
        const result = await executeWebSearch(args as any)

        // Must resolve to a defined value
        expect(result).toBeDefined()
      }),
      PROPERTY_TEST_CONFIG,
    )
  })

  it('always returns ToolResult shape: the resolved value always has a boolean `success` property', async () => {
    await fc.assert(
      fc.asyncProperty(arbAnythingArgs, async (args) => {
        const result = await executeWebSearch(args as any)

        // Must have a `success` property that is a boolean
        expect(result).toHaveProperty('success')
        expect(typeof result.success).toBe('boolean')
      }),
      PROPERTY_TEST_CONFIG,
    )
  })

  it('success data shape: when success:true, data contains all required WebSearchData fields', async () => {
    await fc.assert(
      fc.asyncProperty(arbValidArgs, async (args) => {
        fetchMock.mockClear()

        const result = await executeWebSearch(args)

        // With valid args + valid credential + successful fetch, result should be success
        expect(result.success).toBe(true)

        // Verify the WebSearchData shape on success
        const data = result.data as Record<string, unknown>
        expect(data).toBeDefined()

        // query: string
        expect(typeof data.query).toBe('string')

        // results: array
        expect(Array.isArray(data.results)).toBe(true)

        // images: array
        expect(Array.isArray(data.images)).toBe(true)

        // resultCount: number
        expect(typeof data.resultCount).toBe('number')

        // imageCount: number
        expect(typeof data.imageCount).toBe('number')

        // source: string
        expect(typeof data.source).toBe('string')
      }),
      PROPERTY_TEST_CONFIG,
    )
  })
})
