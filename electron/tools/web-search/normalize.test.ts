// @vitest-environment node

/**
 * Unit tests for result/image shaping in normalize.ts.
 *
 * Covers: missing-url skipping, snippet/favicon/displayed-link shaping,
 * deterministic output for equal input, and image deduplication.
 *
 * Requirements: 9.1, 9.2, 9.6
 */

import { describe, it, expect } from 'vitest'

import {
  parseTavilySearchResult,
  parseTavilyExtractResult,
  parseTavilyImage,
  extractTavilyImages,
} from './normalize'

describe('parseTavilySearchResult', () => {
  // 1. Missing url → returns null
  it('returns null when url is missing', () => {
    const result = parseTavilySearchResult({ title: 'Test', content: 'snippet' })
    expect(result).toBeNull()
  })

  // 2. Empty string url → returns null
  it('returns null when url is an empty string', () => {
    const result = parseTavilySearchResult({ url: '', title: 'Test', content: 'snippet' })
    expect(result).toBeNull()
  })

  // 3. Whitespace-only url → returns null
  it('returns null when url is whitespace-only', () => {
    const result = parseTavilySearchResult({ url: '   ', title: 'Test', content: 'snippet' })
    expect(result).toBeNull()
  })

  // 4. Valid url → returns SearchResult with correct fields
  it('returns a SearchResult with correct fields for a valid url', () => {
    const input = {
      url: 'https://example.com/page',
      title: 'Example Page',
      content: 'This is a snippet.',
      published_date: '2024-01-15',
      score: 0.95,
    }

    const result = parseTavilySearchResult(input)

    expect(result).not.toBeNull()
    expect(result!.url).toBe('https://example.com/page')
    expect(result!.title).toBe('Example Page')
    expect(result!.snippet).toBe('This is a snippet.')
    expect(result!.favicon).toBe('https://www.google.com/s2/favicons?domain=example.com&sz=32')
    expect(result!.source).toBe('example.com')
    expect(result!.displayed_link).toBe('example.com > page')
    expect(result!.date).toBe('2024-01-15')
    expect(result!.score).toBe(0.95)
  })

  it('returns SearchResult with trimmed url when url has surrounding whitespace', () => {
    const result = parseTavilySearchResult({
      url: '  https://example.com  ',
      title: 'Test',
      content: 'Snippet',
    })

    expect(result).not.toBeNull()
    expect(result!.url).toBe('https://example.com')
  })
})

describe('parseTavilyExtractResult', () => {
  // 5. Missing url → returns null
  it('returns null when url is missing', () => {
    const result = parseTavilyExtractResult({ raw_content: 'some content' })
    expect(result).toBeNull()
  })

  it('returns null when url is an empty string', () => {
    const result = parseTavilyExtractResult({ url: '', raw_content: 'content' })
    expect(result).toBeNull()
  })

  it('returns null when url is whitespace-only', () => {
    const result = parseTavilyExtractResult({ url: '  \t  ', raw_content: 'content' })
    expect(result).toBeNull()
  })

  // 6. Valid url + raw_content → returns SearchResult with inferred title, snippet
  it('returns SearchResult with inferred title and snippet from raw_content', () => {
    const input = {
      url: 'https://docs.example.com/guide',
      raw_content: '# Getting Started\n\nThis is the guide content that explains how to use the system effectively.',
    }

    const result = parseTavilyExtractResult(input)

    expect(result).not.toBeNull()
    expect(result!.url).toBe('https://docs.example.com/guide')
    expect(result!.title).toBe('Getting Started')
    expect(result!.snippet).toContain('Getting Started')
    expect(result!.favicon).toBe(
      'https://www.google.com/s2/favicons?domain=docs.example.com&sz=32'
    )
    expect(result!.source).toBe('docs.example.com')
    expect(result!.displayed_link).toBe('docs.example.com > guide')
    expect(result!.raw_content).toBe(input.raw_content)
  })

  it('infers title from displayed_link when raw_content has no suitable line', () => {
    const input = {
      url: 'https://example.com/path',
      raw_content: 'ab',
    }

    const result = parseTavilyExtractResult(input)

    expect(result).not.toBeNull()
    // Title inferred from URL since no line qualifies (min 3 chars)
    expect(result!.title).toBe('example.com > path')
  })
})

describe('parseTavilyImage', () => {
  // 7. Empty string → returns null
  it('returns null when given an empty string', () => {
    const result = parseTavilyImage('')
    expect(result).toBeNull()
  })

  it('returns null when given a whitespace-only string', () => {
    const result = parseTavilyImage('   ')
    expect(result).toBeNull()
  })

  // 8. Valid string url → returns ImageResult
  it('returns ImageResult when given a valid string url', () => {
    const result = parseTavilyImage('https://img.example.com/photo.jpg')
    expect(result).not.toBeNull()
    expect(result!.url).toBe('https://img.example.com/photo.jpg')
    expect(result!.description).toBeUndefined()
  })

  it('returns ImageResult with sourceUrl when provided', () => {
    const result = parseTavilyImage('https://img.example.com/photo.jpg', 'https://example.com')
    expect(result).not.toBeNull()
    expect(result!.url).toBe('https://img.example.com/photo.jpg')
    expect(result!.sourceUrl).toBe('https://example.com')
  })

  // 9. Object with empty url → returns null
  it('returns null when given an object with empty url', () => {
    const result = parseTavilyImage({ url: '', description: 'A photo' })
    expect(result).toBeNull()
  })

  it('returns null when given an object with whitespace-only url', () => {
    const result = parseTavilyImage({ url: '   ', description: 'A photo' })
    expect(result).toBeNull()
  })

  // 10. Object with valid url → returns ImageResult with description
  it('returns ImageResult with description when given an object with valid url', () => {
    const result = parseTavilyImage({
      url: 'https://img.example.com/photo.png',
      description: 'A beautiful sunset',
    })

    expect(result).not.toBeNull()
    expect(result!.url).toBe('https://img.example.com/photo.png')
    expect(result!.description).toBe('A beautiful sunset')
  })

  it('uses alt field as description fallback', () => {
    const result = parseTavilyImage({
      url: 'https://img.example.com/photo.png',
      alt: 'Alt text for image',
    })

    expect(result).not.toBeNull()
    expect(result!.description).toBe('Alt text for image')
  })
})

describe('Deterministic output', () => {
  // 11. Calling same function twice with same input yields equal output
  it('parseTavilySearchResult produces equal output for equal input', () => {
    const input = {
      url: 'https://example.com/article',
      title: 'Article Title',
      content: 'Article content snippet',
      published_date: '2024-03-01',
      score: 0.87,
    }

    const result1 = parseTavilySearchResult(input)
    const result2 = parseTavilySearchResult(input)

    expect(result1).toEqual(result2)
  })

  it('parseTavilyExtractResult produces equal output for equal input', () => {
    const input = {
      url: 'https://docs.example.com/api',
      raw_content: '# API Reference\n\nThis document describes the API endpoints.',
    }

    const result1 = parseTavilyExtractResult(input)
    const result2 = parseTavilyExtractResult(input)

    expect(result1).toEqual(result2)
  })

  it('parseTavilyImage produces equal output for equal input', () => {
    const input = {
      url: 'https://cdn.example.com/image.webp',
      description: 'Product screenshot',
    }

    const result1 = parseTavilyImage(input)
    const result2 = parseTavilyImage(input)

    expect(result1).toEqual(result2)
  })

  it('extractTavilyImages produces equal output for equal input', () => {
    const input = [
      {
        url: 'https://example.com/page1',
        images: ['https://img1.com/a.png', 'https://img2.com/b.png'],
      },
      {
        url: 'https://example.com/page2',
        images: [{ url: 'https://img3.com/c.png', description: 'C image' }],
      },
    ]

    const result1 = extractTavilyImages(input)
    const result2 = extractTavilyImages(input)

    expect(result1).toEqual(result2)
  })
})

describe('extractTavilyImages', () => {
  // 12. Deduplicates images by url
  it('deduplicates images by url across results', () => {
    const input = [
      {
        url: 'https://page1.com',
        images: ['https://shared-image.com/photo.jpg', 'https://unique1.com/img.png'],
      },
      {
        url: 'https://page2.com',
        images: ['https://shared-image.com/photo.jpg', 'https://unique2.com/img.png'],
      },
    ]

    const images = extractTavilyImages(input)
    const urls = images.map((img) => img.url)

    // The shared image should appear only once
    expect(urls.filter((u) => u === 'https://shared-image.com/photo.jpg')).toHaveLength(1)
    expect(images).toHaveLength(3)
  })

  it('skips images with empty urls within results', () => {
    const input = [
      {
        url: 'https://page.com',
        images: ['', 'https://valid.com/img.png', '   '],
      },
    ]

    const images = extractTavilyImages(input)

    expect(images).toHaveLength(1)
    expect(images[0].url).toBe('https://valid.com/img.png')
  })

  it('skips non-record entries in the results array', () => {
    const input = [null, undefined, 42, 'string', { url: 'https://page.com', images: ['https://img.com/a.png'] }]

    const images = extractTavilyImages(input as unknown[])

    expect(images).toHaveLength(1)
    expect(images[0].url).toBe('https://img.com/a.png')
  })

  it('associates sourceUrl from the parent result', () => {
    const input = [
      {
        url: 'https://source-page.com/article',
        images: ['https://cdn.example.com/hero.jpg'],
      },
    ]

    const images = extractTavilyImages(input)

    expect(images).toHaveLength(1)
    expect(images[0].sourceUrl).toBe('https://source-page.com/article')
  })
})
