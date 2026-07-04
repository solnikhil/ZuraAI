/**
 * Property-based tests for the Tavily mapper (image gating).
 *
 * These tests assert universal properties of `mapTavilySearchPayload` and
 * `mapTavilyExtractPayload` across a wide range of generated payloads,
 * verifying that the `includeImages` flag gates image output correctly.
 *
 * Covered correctness property (from the design):
 * - Property 6: Images gated — `data.images` is non-empty only when
 *   `includeImages` resolved to `true`; when `false`, `data.images` is empty
 *   and `data.imageCount` is 0 regardless of payload.
 *
 * **Validates: Requirements 10.1, 10.2, 10.3**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import { mapTavilySearchPayload, mapTavilyExtractPayload } from './mapper'
import type { ProviderSearchRequest, ProviderExtractRequest } from '../../types'

// ---------------------------------------------------------------------------
// Property-test configuration
// ---------------------------------------------------------------------------

const PROPERTY_TEST_CONFIG = {
  numRuns: 200,
  seed: 0x1a6e,
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A valid non-empty URL string suitable for search results and images. */
const validUrlArb = fc
  .webUrl({ withFragments: true, withQueryParameters: true })
  .map((url) => url || 'https://example.com')

/** A Tavily search result with a valid url (required for it to be parsed). */
const tavilySearchResultArb = fc.record({
  title: fc.string({ minLength: 1, maxLength: 50 }),
  url: validUrlArb,
  content: fc.string({ minLength: 0, maxLength: 200 }),
  published_date: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  score: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
})

/** An image entry as Tavily returns it (can be a string URL or an object with url). */
const tavilyImageArb = fc.oneof(
  validUrlArb,
  fc.record({
    url: validUrlArb,
    description: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
  })
)

/** A Tavily `/search` payload with at least one valid result and some images. */
const tavilySearchPayloadArb = fc.record({
  results: fc.array(tavilySearchResultArb, { minLength: 1, maxLength: 6 }),
  images: fc.array(tavilyImageArb, { minLength: 1, maxLength: 8 }),
})

/** A Tavily extract result with valid url and raw_content. */
const tavilyExtractResultArb = fc.record({
  url: validUrlArb,
  raw_content: fc.string({ minLength: 10, maxLength: 300 }),
  images: fc.array(tavilyImageArb, { minLength: 1, maxLength: 4 }),
})

/** A Tavily `/extract` payload with at least one valid result. */
const tavilyExtractPayloadArb = fc.record({
  results: fc.array(tavilyExtractResultArb, { minLength: 1, maxLength: 4 }),
  failed_results: fc.array(fc.record({ url: validUrlArb, error: fc.string() }), {
    minLength: 0,
    maxLength: 2,
  }),
})

/** A minimal valid ProviderSearchRequest with `includeImages` toggled. */
const searchRequestArb = (includeImages: boolean): fc.Arbitrary<ProviderSearchRequest> =>
  fc.record({
    query: fc.string({ minLength: 1, maxLength: 100 }),
    numResults: fc.integer({ min: 1, max: 4 }),
    searchDepth: fc.constantFrom(
      'ultra-fast' as const,
      'fast' as const,
      'basic' as const,
      'advanced' as const
    ),
    includeImages: fc.constant(includeImages),
    timeRange: fc.option(
      fc.constantFrom('day' as const, 'week' as const, 'month' as const, 'year' as const),
      { nil: undefined }
    ),
    topic: fc.option(fc.constantFrom('general' as const, 'news' as const, 'finance' as const), {
      nil: undefined,
    }),
  })

/** A minimal valid ProviderExtractRequest with `includeImages` toggled. */
const extractRequestArb = (includeImages: boolean): fc.Arbitrary<ProviderExtractRequest> =>
  fc.record({
    urls: fc.array(validUrlArb, { minLength: 1, maxLength: 4 }),
    query: fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: undefined }),
    includeImages: fc.constant(includeImages),
    intent: fc.constantFrom(
      'url_extract' as const,
      'url_extract_with_query' as const,
      'site_exploration' as const
    ),
  })

// ---------------------------------------------------------------------------
// Property 6: Images gated
// ---------------------------------------------------------------------------

describe('mapTavilySearchPayload — Property 6: Images gated', () => {
  /**
   * **Validates: Requirements 10.1, 10.2, 10.3**
   *
   * When `includeImages === false`, `data.images` is empty and `data.imageCount`
   * is 0 regardless of images present in the payload.
   */
  it('when includeImages is false: data.images is empty and data.imageCount is 0', () => {
    fc.assert(
      fc.property(tavilySearchPayloadArb, searchRequestArb(false), (payload, request) => {
        const result = mapTavilySearchPayload(payload, request)

        if (result.ok) {
          expect(result.data.images).toHaveLength(0)
          expect(result.data.imageCount).toBe(0)
        }
        // If result is not ok (no parseable results), the property still holds
        // trivially since there's no data.images to check.
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  /**
   * **Validates: Requirements 10.1, 10.2, 10.3**
   *
   * When `includeImages === true` and images with valid non-empty urls exist in
   * the payload, `data.images` may be non-empty and `data.imageCount` equals
   * `data.images.length`.
   */
  it('when includeImages is true: data.imageCount equals data.images.length', () => {
    fc.assert(
      fc.property(tavilySearchPayloadArb, searchRequestArb(true), (payload, request) => {
        const result = mapTavilySearchPayload(payload, request)

        if (result.ok) {
          expect(result.data.imageCount).toBe(result.data.images.length)
          // Since payload has images with valid URLs, images should be non-empty.
          // (All generated images have valid URLs per our generator.)
          expect(result.data.images.length).toBeGreaterThanOrEqual(1)
        }
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  /**
   * **Validates: Requirements 10.1, 10.2, 10.3**
   *
   * `data.imageCount` always equals `data.images.length` in any successful
   * result, regardless of the includeImages setting.
   */
  it('data.imageCount always equals data.images.length in any successful result', () => {
    fc.assert(
      fc.property(
        tavilySearchPayloadArb,
        fc.boolean().chain((includeImages) => searchRequestArb(includeImages)),
        (payload, request) => {
          const result = mapTavilySearchPayload(payload, request)

          if (result.ok) {
            expect(result.data.imageCount).toBe(result.data.images.length)
          }
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })
})

describe('mapTavilyExtractPayload — Property 6: Images gated', () => {
  /**
   * **Validates: Requirements 10.1, 10.2, 10.3**
   *
   * When `includeImages === false`, `data.images` is empty and `data.imageCount`
   * is 0 regardless of images present in the payload.
   */
  it('when includeImages is false: data.images is empty and data.imageCount is 0', () => {
    fc.assert(
      fc.property(tavilyExtractPayloadArb, extractRequestArb(false), (payload, request) => {
        const result = mapTavilyExtractPayload(payload, request)

        if (result.ok) {
          expect(result.data.images).toHaveLength(0)
          expect(result.data.imageCount).toBe(0)
        }
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  /**
   * **Validates: Requirements 10.1, 10.2, 10.3**
   *
   * When `includeImages === true` and images with valid non-empty urls exist in
   * the payload, `data.images` may be non-empty and `data.imageCount` equals
   * `data.images.length`.
   */
  it('when includeImages is true: data.imageCount equals data.images.length', () => {
    fc.assert(
      fc.property(tavilyExtractPayloadArb, extractRequestArb(true), (payload, request) => {
        const result = mapTavilyExtractPayload(payload, request)

        if (result.ok) {
          expect(result.data.imageCount).toBe(result.data.images.length)
          // Generated extract results all have images with valid URLs.
          expect(result.data.images.length).toBeGreaterThanOrEqual(1)
        }
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  /**
   * **Validates: Requirements 10.1, 10.2, 10.3**
   *
   * `data.imageCount` always equals `data.images.length` in any successful
   * result, regardless of the includeImages setting.
   */
  it('data.imageCount always equals data.images.length in any successful result', () => {
    fc.assert(
      fc.property(
        tavilyExtractPayloadArb,
        fc.boolean().chain((includeImages) => extractRequestArb(includeImages)),
        (payload, request) => {
          const result = mapTavilyExtractPayload(payload, request)

          if (result.ok) {
            expect(result.data.imageCount).toBe(result.data.images.length)
          }
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })
})
