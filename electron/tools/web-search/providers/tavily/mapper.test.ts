// @vitest-environment node

/**
 * Unit tests for the Tavily mapper (`mapper.ts`).
 *
 * Validates:
 * - mapTavilySearchPayload: search payload → normalized WebSearchData
 * - mapTavilyExtractPayload: extract payload → normalized WebSearchData
 *
 * Requirements: 7.2, 7.3, 8.2, 8.3, 8.4, 9.4, 9.5
 */

import { describe, it, expect } from 'vitest'

import { mapTavilySearchPayload, mapTavilyExtractPayload } from './mapper'
import type { ProviderSearchRequest, ProviderExtractRequest } from '../../types'

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

function buildSearchRequest(overrides: Partial<ProviderSearchRequest> = {}): ProviderSearchRequest {
  return {
    query: 'test query',
    numResults: 4,
    searchDepth: 'basic',
    includeImages: false,
    ...overrides,
  }
}

function buildExtractRequest(
  overrides: Partial<ProviderExtractRequest> = {}
): ProviderExtractRequest {
  return {
    urls: ['https://example.com'],
    includeImages: false,
    intent: 'url_extract',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// mapTavilySearchPayload
// ---------------------------------------------------------------------------

describe('mapTavilySearchPayload', () => {
  it('valid payload with results → ok:true, data.source="tavily", resultCount matches', () => {
    const payload = {
      results: [
        { url: 'https://a.com', title: 'A', content: 'snippet A' },
        { url: 'https://b.com', title: 'B', content: 'snippet B' },
      ],
    }
    const request = buildSearchRequest()

    const result = mapTavilySearchPayload(payload, request)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.source).toBe('tavily')
    expect(result.data.resultCount).toBe(2)
    expect(result.data.results).toHaveLength(2)
    expect(result.data.query).toBe('test query')
  })

  it('empty results array → ok:false with descriptive error', () => {
    const payload = { results: [] }
    const request = buildSearchRequest()

    const result = mapTavilySearchPayload(payload, request)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('no results')
  })

  it('null payload → ok:false', () => {
    const result = mapTavilySearchPayload(null, buildSearchRequest())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBeTruthy()
  })

  it('undefined payload → ok:false', () => {
    const result = mapTavilySearchPayload(undefined, buildSearchRequest())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBeTruthy()
  })

  it('includeImages=false → data.images=[], data.imageCount=0', () => {
    const payload = {
      results: [{ url: 'https://a.com', title: 'A', content: 'snippet' }],
      images: ['https://img.com/1.png', 'https://img.com/2.png'],
    }
    const request = buildSearchRequest({ includeImages: false })

    const result = mapTavilySearchPayload(payload, request)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.images).toEqual([])
    expect(result.data.imageCount).toBe(0)
  })

  it('includeImages=true with images in payload → data.images populated, imageCount matches', () => {
    const payload = {
      results: [{ url: 'https://a.com', title: 'A', content: 'snippet' }],
      images: ['https://img.com/1.png', 'https://img.com/2.png'],
    }
    const request = buildSearchRequest({ includeImages: true })

    const result = mapTavilySearchPayload(payload, request)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.images.length).toBeGreaterThan(0)
    expect(result.data.imageCount).toBe(result.data.images.length)
  })

  it('data.resultCount === data.results.length always', () => {
    const payload = {
      results: [
        { url: 'https://a.com', title: 'A', content: 'content A' },
        { url: '', title: 'Invalid', content: 'no url' }, // should be skipped
        { url: 'https://c.com', title: 'C', content: 'content C' },
      ],
    }
    const request = buildSearchRequest()

    const result = mapTavilySearchPayload(payload, request)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.resultCount).toBe(result.data.results.length)
    // The entry with empty url should have been skipped
    expect(result.data.resultCount).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// mapTavilyExtractPayload
// ---------------------------------------------------------------------------

describe('mapTavilyExtractPayload', () => {
  it('valid payload with results → ok:true, data.source="tavily_extract"', () => {
    const payload = {
      results: [
        { url: 'https://example.com', raw_content: 'Some extracted content from the page' },
      ],
    }
    const request = buildExtractRequest()

    const result = mapTavilyExtractPayload(payload, request)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.source).toBe('tavily_extract')
    expect(result.data.resultCount).toBe(1)
    expect(result.data.results).toHaveLength(1)
  })

  it('empty results → ok:false with descriptive error containing getFailureMessage', () => {
    const payload = {
      results: [],
      failed_results: [{ url: 'https://bad.com', error: 'Could not fetch' }],
    }
    const request = buildExtractRequest({ urls: ['https://bad.com'] })

    const result = mapTavilyExtractPayload(payload, request)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('no extractable content')
    expect(result.error).toContain('Could not fetch')
  })

  it('partial extract: 3 URLs requested, 1 result, 2 in failed_results → data.message contains "2"', () => {
    const payload = {
      results: [{ url: 'https://a.com', raw_content: 'Content A is here for testing purposes' }],
      failed_results: [
        { url: 'https://b.com', error: 'Timeout' },
        { url: 'https://c.com', error: 'Not found' },
      ],
    }
    const request = buildExtractRequest({
      urls: ['https://a.com', 'https://b.com', 'https://c.com'],
    })

    const result = mapTavilyExtractPayload(payload, request)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.message).toBeDefined()
    expect(result.data.message).toContain('2')
  })

  it('all URLs extracted: no message field', () => {
    const payload = {
      results: [
        { url: 'https://a.com', raw_content: 'Content A for testing' },
        { url: 'https://b.com', raw_content: 'Content B for testing' },
      ],
      failed_results: [],
    }
    const request = buildExtractRequest({
      urls: ['https://a.com', 'https://b.com'],
    })

    const result = mapTavilyExtractPayload(payload, request)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.message).toBeUndefined()
  })

  it('includeImages=false → images empty', () => {
    const payload = {
      results: [
        {
          url: 'https://a.com',
          raw_content: 'Content with images',
          images: ['https://img.com/pic.png'],
        },
      ],
    }
    const request = buildExtractRequest({ includeImages: false })

    const result = mapTavilyExtractPayload(payload, request)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.images).toEqual([])
    expect(result.data.imageCount).toBe(0)
  })

  it('data.resultCount and data.imageCount consistent', () => {
    const payload = {
      results: [
        {
          url: 'https://a.com',
          raw_content: 'Content A with images for testing',
          images: ['https://img.com/1.png'],
        },
        {
          url: 'https://b.com',
          raw_content: 'Content B with images for testing',
          images: ['https://img.com/2.png', 'https://img.com/3.png'],
        },
        { url: '', raw_content: 'Invalid entry no url' }, // should be skipped
      ],
    }
    const request = buildExtractRequest({
      urls: ['https://a.com', 'https://b.com', 'https://invalid.com'],
      includeImages: true,
    })

    const result = mapTavilyExtractPayload(payload, request)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.resultCount).toBe(result.data.results.length)
    expect(result.data.imageCount).toBe(result.data.images.length)
    // 2 valid results (the one with empty url is skipped)
    expect(result.data.resultCount).toBe(2)
    // 3 images total from both valid results
    expect(result.data.imageCount).toBe(3)
  })
})
