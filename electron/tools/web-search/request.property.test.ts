// @vitest-environment node

/**
 * Property-based test for the web search request normalizer.
 *
 * Property 7 (Validation totality): every invalid `WebSearchArgs` (missing
 * query, bad enum) maps to `success:false`; every valid input yields a
 * `NormalizedRequest` with `numResults ∈ [1, SEARCH_MAX_RESULTS]`,
 * `query.length ≤ SEARCH_MAX_QUERY_LENGTH`, and valid/undefined enum fields.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.5, 2.6, 2.10**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import { normalizeRequest } from './request'
import { SEARCH_MAX_QUERY_LENGTH, SEARCH_MAX_RESULTS } from './constants'
import type { NormalizedRequest, WebSearchArgs } from './types'

// ---------------------------------------------------------------------------
// Shared config
// ---------------------------------------------------------------------------

const PROPERTY_TEST_CONFIG = {
  numRuns: 200,
  seed: 0xbeef,
}

// ---------------------------------------------------------------------------
// Valid enum value sets (sourced from the types)
// ---------------------------------------------------------------------------

const VALID_SEARCH_DEPTHS = ['ultra-fast', 'fast', 'basic', 'advanced'] as const
const VALID_TIME_RANGES = ['day', 'week', 'month', 'year'] as const
const VALID_TOPICS = ['general', 'news', 'finance'] as const

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A non-empty query string (at least one non-whitespace char). */
const arbValidQuery = fc.string({ minLength: 1, maxLength: 800 }).filter((s) => s.trim().length > 0)

/** A valid search_depth or undefined (both acceptable). */
const arbValidSearchDepth = fc.oneof(
  fc.constantFrom(...VALID_SEARCH_DEPTHS),
  fc.constant(undefined)
)

/** A valid time_range or undefined (both acceptable). */
const arbValidTimeRange = fc.oneof(fc.constantFrom(...VALID_TIME_RANGES), fc.constant(undefined))

/** A valid topic or undefined (both acceptable). */
const arbValidTopic = fc.oneof(fc.constantFrom(...VALID_TOPICS), fc.constant(undefined))

/** Arbitrary num_results: number, string-coercible, or undefined. */
const arbNumResults = fc.oneof(fc.integer({ min: -10, max: 100 }), fc.constant(undefined))

/** Arbitrary include_images: boolean or undefined. */
const arbIncludeImages = fc.oneof(fc.boolean(), fc.constant(undefined))

/** A valid WebSearchArgs that should always normalize successfully. */
const arbValidArgs: fc.Arbitrary<WebSearchArgs> = fc.record({
  query: arbValidQuery,
  num_results: arbNumResults,
  search_depth: arbValidSearchDepth as fc.Arbitrary<WebSearchArgs['search_depth']>,
  time_range: arbValidTimeRange as fc.Arbitrary<WebSearchArgs['time_range']>,
  topic: arbValidTopic as fc.Arbitrary<WebSearchArgs['topic']>,
  urls: fc.oneof(fc.constant(undefined), fc.array(fc.webUrl(), { minLength: 0, maxLength: 3 })),
  include_images: arbIncludeImages,
})

// -- Invalid generators --

/** An invalid time_range: a string that is not in the valid set. */
const arbInvalidTimeRange = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !(VALID_TIME_RANGES as readonly string[]).includes(s))

/** An invalid topic: a string that is not in the valid set. */
const arbInvalidTopic = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !(VALID_TOPICS as readonly string[]).includes(s))

/** A query that will fail: empty string, whitespace-only, or non-string. */
const arbInvalidQuery = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.constant('\t\n'),
  fc.constant(undefined as unknown as string),
  fc.constant(null as unknown as string),
  fc.constant(123 as unknown as string)
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isToolResult(result: unknown): result is { success: boolean; error?: string } {
  return (
    typeof result === 'object' &&
    result !== null &&
    'success' in result &&
    typeof (result as Record<string, unknown>).success === 'boolean'
  )
}

function isNormalizedRequest(result: unknown): result is NormalizedRequest {
  return (
    typeof result === 'object' &&
    result !== null &&
    'query' in result &&
    'numResults' in result &&
    'searchDepth' in result &&
    'includeImages' in result &&
    !('success' in result)
  )
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('normalizeRequest — Property 7: Validation totality', () => {
  // Feature: web-search-backend-rebuild, Property 7: Validation totality
  // **Validates: Requirements 2.1, 2.2, 2.3, 2.5, 2.6, 2.10**

  it('every valid WebSearchArgs yields a NormalizedRequest with bounds-safe fields', () => {
    fc.assert(
      fc.property(arbValidArgs, (args) => {
        const result = normalizeRequest(args)

        // Must produce a NormalizedRequest (no `success` property).
        expect(isNormalizedRequest(result)).toBe(true)
        const normalized = result as NormalizedRequest

        // numResults clamped to [1, SEARCH_MAX_RESULTS]
        expect(normalized.numResults).toBeGreaterThanOrEqual(1)
        expect(normalized.numResults).toBeLessThanOrEqual(SEARCH_MAX_RESULTS)
        expect(Number.isInteger(normalized.numResults)).toBe(true)

        // query.length <= SEARCH_MAX_QUERY_LENGTH
        expect(normalized.query.length).toBeGreaterThanOrEqual(1)
        expect(normalized.query.length).toBeLessThanOrEqual(SEARCH_MAX_QUERY_LENGTH)

        // searchDepth must be a valid enum member
        expect(VALID_SEARCH_DEPTHS).toContain(normalized.searchDepth)

        // timeRange must be a valid enum member or undefined
        if (normalized.timeRange !== undefined) {
          expect(VALID_TIME_RANGES).toContain(normalized.timeRange)
        }

        // topic must be a valid enum member or undefined
        if (normalized.topic !== undefined) {
          expect(VALID_TOPICS).toContain(normalized.topic)
        }

        // includeImages must be boolean
        expect(typeof normalized.includeImages).toBe('boolean')
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  it('missing or empty query always produces success:false', () => {
    fc.assert(
      fc.property(arbInvalidQuery, (badQuery) => {
        const args = { query: badQuery } as unknown as WebSearchArgs
        const result = normalizeRequest(args)

        expect(isToolResult(result)).toBe(true)
        expect((result as { success: boolean }).success).toBe(false)
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  it('invalid time_range always produces success:false', () => {
    fc.assert(
      fc.property(arbValidQuery, arbInvalidTimeRange, (query, badTimeRange) => {
        const args: WebSearchArgs = {
          query,
          time_range: badTimeRange as WebSearchArgs['time_range'],
        }
        const result = normalizeRequest(args)

        expect(isToolResult(result)).toBe(true)
        expect((result as { success: boolean }).success).toBe(false)
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  it('invalid topic always produces success:false', () => {
    fc.assert(
      fc.property(arbValidQuery, arbInvalidTopic, (query, badTopic) => {
        const args: WebSearchArgs = {
          query,
          topic: badTopic as WebSearchArgs['topic'],
        }
        const result = normalizeRequest(args)

        expect(isToolResult(result)).toBe(true)
        expect((result as { success: boolean }).success).toBe(false)
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  it('normalizeRequest never mutates the input args object', () => {
    fc.assert(
      fc.property(arbValidArgs, (args) => {
        const frozen = Object.freeze({ ...args })
        // Should not throw on a frozen object (no mutation)
        const result = normalizeRequest(frozen as WebSearchArgs)
        // Just verify it completed without error
        expect(result).toBeDefined()
      }),
      PROPERTY_TEST_CONFIG
    )
  })
})
