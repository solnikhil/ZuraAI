// @vitest-environment node

/**
 * Property-based test for normalization soundness.
 *
 * Property 5: Normalization soundness — for arbitrary raw payloads, every
 * emitted `SearchResult`/`ImageResult` has a non-empty trimmed `url`.
 *
 * **Validates: Requirements 9.1, 9.2, 9.6**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import { parseTavilySearchResult, parseTavilyExtractResult, parseTavilyImage } from './normalize'

describe('normalize — normalization soundness (property)', () => {
  // Property 5: Every non-null result from parseTavilySearchResult has a non-empty trimmed url
  // Validates: Requirements 9.1, 9.2, 9.6
  it('parseTavilySearchResult: every non-null result has a non-empty trimmed url', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = parseTavilySearchResult(input)
        if (result !== null) {
          expect(result.url.trim().length).toBeGreaterThanOrEqual(1)
        }
      }),
      { numRuns: 500 }
    )
  })

  // Property 5: Every non-null result from parseTavilyExtractResult has a non-empty trimmed url
  // Validates: Requirements 9.1, 9.2, 9.6
  it('parseTavilyExtractResult: every non-null result has a non-empty trimmed url', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = parseTavilyExtractResult(input)
        if (result !== null) {
          expect(result.url.trim().length).toBeGreaterThanOrEqual(1)
        }
      }),
      { numRuns: 500 }
    )
  })

  // Property 5: Every non-null result from parseTavilyImage has a non-empty trimmed url
  // Validates: Requirements 9.1, 9.2, 9.6
  it('parseTavilyImage: every non-null result has a non-empty trimmed url', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = parseTavilyImage(input)
        if (result !== null) {
          expect(result.url.trim().length).toBeGreaterThanOrEqual(1)
        }
      }),
      { numRuns: 500 }
    )
  })
})
