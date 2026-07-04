// @vitest-environment node

/**
 * Property-based test for missing-credential behavior.
 *
 * Property 3 (No silent substitution): with no credential, the result is
 * always `success:false` and the provider stub is never called.
 *
 * **Validates: Requirements 5.2, 5.3, 11.4**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

// Mock secureStorage to return '' (empty/absent credential)
vi.mock('../../secureStorage', () => ({
  getSecureValueAsync: vi.fn().mockResolvedValue(''),
}))

// Mock global fetch with a call-counting spy
const fetchSpy = vi.fn()
vi.stubGlobal('fetch', fetchSpy)

// Now import the module under test (after mocks are set up)
import { executeWebSearch } from './service'
import type { WebSearchArgs } from './types'

// ---------------------------------------------------------------------------
// Shared config
// ---------------------------------------------------------------------------

const PROPERTY_TEST_CONFIG = {
  numRuns: 200,
  seed: 0xdead,
}

// ---------------------------------------------------------------------------
// Valid enum value sets
// ---------------------------------------------------------------------------

const VALID_SEARCH_DEPTHS = ['ultra-fast', 'fast', 'basic', 'advanced'] as const
const VALID_TIME_RANGES = ['day', 'week', 'month', 'year'] as const
const VALID_TOPICS = ['general', 'news', 'finance'] as const

// ---------------------------------------------------------------------------
// Generators — valid WebSearchArgs (non-empty query, valid enums)
// ---------------------------------------------------------------------------

/** A non-empty query string (at least one non-whitespace char). */
const arbValidQuery = fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0)

/** A valid search_depth or undefined. */
const arbValidSearchDepth = fc.oneof(
  fc.constantFrom(...VALID_SEARCH_DEPTHS),
  fc.constant(undefined)
)

/** A valid time_range or undefined. */
const arbValidTimeRange = fc.oneof(fc.constantFrom(...VALID_TIME_RANGES), fc.constant(undefined))

/** A valid topic or undefined. */
const arbValidTopic = fc.oneof(fc.constantFrom(...VALID_TOPICS), fc.constant(undefined))

/** Arbitrary num_results: valid range or undefined. */
const arbNumResults = fc.oneof(fc.integer({ min: 1, max: 4 }), fc.constant(undefined))

/** Arbitrary include_images: boolean or undefined. */
const arbIncludeImages = fc.oneof(fc.boolean(), fc.constant(undefined))

/** A valid WebSearchArgs that passes validation (non-empty query, valid enums). */
const arbValidArgs: fc.Arbitrary<WebSearchArgs> = fc.record({
  query: arbValidQuery,
  num_results: arbNumResults,
  search_depth: arbValidSearchDepth as fc.Arbitrary<WebSearchArgs['search_depth']>,
  time_range: arbValidTimeRange as fc.Arbitrary<WebSearchArgs['time_range']>,
  topic: arbValidTopic as fc.Arbitrary<WebSearchArgs['topic']>,
  urls: fc.oneof(fc.constant(undefined), fc.array(fc.webUrl(), { minLength: 0, maxLength: 2 })),
  include_images: arbIncludeImages,
})

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchSpy.mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('executeWebSearch — Property 3: No silent substitution (no credential)', () => {
  // Feature: web-search-backend-rebuild, Property 3: No silent substitution
  // **Validates: Requirements 5.2, 5.3, 11.4**

  it('with no credential, result is always { success: false } for valid args', () => {
    fc.assert(
      fc.asyncProperty(arbValidArgs, async (args) => {
        fetchSpy.mockClear()

        const result = await executeWebSearch(args)

        // The result must always be success:false when credential is absent
        expect(result).toHaveProperty('success', false)
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  it('with no credential, fetch is never called (the provider is never invoked)', () => {
    fc.assert(
      fc.asyncProperty(arbValidArgs, async (args) => {
        fetchSpy.mockClear()

        await executeWebSearch(args)

        // fetch should NEVER be called — the provider transport is never reached
        expect(fetchSpy).not.toHaveBeenCalled()
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  it('the error message mentions "Tavily API key" or "Settings > Search APIs" (user-facing guidance)', () => {
    fc.assert(
      fc.asyncProperty(arbValidArgs, async (args) => {
        fetchSpy.mockClear()

        const result = await executeWebSearch(args)

        expect(result.success).toBe(false)
        const error = (result as { success: false; error: string }).error
        expect(typeof error).toBe('string')

        // The error must provide user-facing guidance about the missing Tavily key
        const mentionsTavilyKey = error.includes('Tavily API key')
        const mentionsSettings = error.includes('Settings')
        const mentionsSearchAPIs = error.includes('Search APIs')

        expect(mentionsTavilyKey || (mentionsSettings && mentionsSearchAPIs)).toBe(true)
      }),
      PROPERTY_TEST_CONFIG
    )
  })
})
