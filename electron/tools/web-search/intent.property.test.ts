// @vitest-environment node

/**
 * Property-based test for intent classification determinism.
 *
 * **Property 4: Intent determinism** — `classifyWebInput(x)` equals
 * `classifyWebInput(x)` across repeated calls; `intent === 'query_search'`
 * iff no valid URL is found.
 *
 * **Validates: Requirements 3.3, 3.8**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import { classifyWebInput, normalizeUrlCandidate } from './intent'

/**
 * Generator for valid http/https URLs that will pass `normalizeUrlCandidate`.
 */
const arbValidHttpUrl: fc.Arbitrary<string> = fc
  .record({
    scheme: fc.constantFrom('http', 'https'),
    host: fc
      .tuple(
        fc.stringMatching(/^[a-z][a-z0-9]{0,9}$/),
        fc.constantFrom('.com', '.org', '.net', '.io', '.dev'),
      )
      .map(([sub, tld]) => sub + tld),
    path: fc
      .array(fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/), { minLength: 0, maxLength: 3 })
      .map((segments) => (segments.length > 0 ? '/' + segments.join('/') : '')),
  })
  .map(({ scheme, host, path }) => `${scheme}://${host}${path}`)

/**
 * Generator for strings that are definitely NOT valid http/https URLs.
 * These should never be classified as URLs by the intent classifier.
 */
const arbNonUrlString: fc.Arbitrary<string> = fc.oneof(
  // Plain words (no colons or slashes that could form a URL scheme)
  fc.stringMatching(/^[a-z ]{1,30}$/),
  // Bare domains without protocol
  fc.constant('example.com'),
  fc.constant('docs.google.com/something'),
  // ftp and other non-http schemes
  fc.constant('ftp://files.example.com'),
  fc.constant('file:///home/user/doc.txt'),
  // Malformed URLs
  fc.constant('http://'),
  fc.constant('https://'),
  fc.constant('http://localhost'),
  fc.constant('https://localhost/path'),
)

describe('Intent classification — determinism property', () => {
  /**
   * Property 4a: Determinism — calling classifyWebInput twice with the same
   * inputs returns deeply equal results.
   *
   * Validates: Requirement 3.8
   */
  it('classifyWebInput(q, urls) is deterministic across repeated calls', () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.string(), { maxLength: 5 }), (query, urls) => {
        const result1 = classifyWebInput(query, urls)
        const result2 = classifyWebInput(query, urls)

        expect(result1).toStrictEqual(result2)
      }),
      { numRuns: 500 },
    )
  })

  /**
   * Property 4b: intent === 'query_search' iff no valid http/https URL exists
   * in query or urls.
   *
   * Validates: Requirement 3.3
   */
  it('intent is query_search iff no valid http/https URL is present', () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.string(), { maxLength: 5 }), (query, urls) => {
        const result = classifyWebInput(query, urls)

        // Check whether any valid URL exists in the inputs
        const allTokens = query.split(/\s+/g).filter(Boolean)
        const allCandidates = [...(urls || []), ...allTokens]
        const hasValidUrl = allCandidates.some(
          (candidate) => typeof candidate === 'string' && normalizeUrlCandidate(candidate) !== null,
        )

        if (result.intent === 'query_search') {
          // If intent is query_search, there should be no valid URL
          expect(hasValidUrl).toBe(false)
        } else {
          // If intent is NOT query_search, there must be at least one valid URL
          expect(hasValidUrl).toBe(true)
        }
      }),
      { numRuns: 500 },
    )
  })

  /**
   * Property 4c: When a known valid http URL is present, intent is never
   * 'query_search'.
   *
   * Validates: Requirement 3.3
   */
  it('with a valid http/https URL present, intent is never query_search', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }),
        arbValidHttpUrl,
        fc.boolean(),
        (prefix, validUrl, inUrls) => {
          // Place the valid URL either in the query string or the urls array
          const query = inUrls ? prefix : `${prefix} ${validUrl}`
          const urls = inUrls ? [validUrl] : []

          const result = classifyWebInput(query, urls)

          expect(result.intent).not.toBe('query_search')
          expect(result.urls.length).toBeGreaterThanOrEqual(1)
        },
      ),
      { numRuns: 300 },
    )
  })

  /**
   * Property 4d: When only non-URL strings are provided (no http/https URLs),
   * intent is always 'query_search'.
   *
   * Validates: Requirement 3.3
   */
  it('with no valid http/https URL, intent is always query_search', () => {
    fc.assert(
      fc.property(
        arbNonUrlString,
        fc.array(arbNonUrlString, { maxLength: 3 }),
        (query, urls) => {
          const result = classifyWebInput(query, urls)
          expect(result.intent).toBe('query_search')
        },
      ),
      { numRuns: 300 },
    )
  })
})
