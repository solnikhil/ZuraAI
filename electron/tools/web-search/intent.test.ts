// @vitest-environment node

/**
 * Unit tests for intent classification, query reformulation, and URL normalization.
 *
 * Covers: query-only, url-only, query+url, site-exploration wording, malformed/non-http
 * URLs, duplicate URL de-duplication, lead-in phrase stripping.
 *
 * _Requirements: 3.2, 3.4, 3.5, 3.6, 3.7, 3.10_
 */

import { describe, it, expect } from 'vitest'

import { classifyWebInput, reformulateQuery, normalizeUrlCandidate } from './intent'

// ---------------------------------------------------------------------------
// 1. Query-only (no URL) → intent: 'query_search', urls: []
// ---------------------------------------------------------------------------

describe('classifyWebInput — query-only (no URL)', () => {
  it('classifies a plain text query as query_search with empty urls', () => {
    const result = classifyWebInput('best typescript frameworks 2024')
    expect(result.intent).toBe('query_search')
    expect(result.urls).toEqual([])
  })

  it('classifies a question as query_search', () => {
    const result = classifyWebInput('what is the capital of France?')
    expect(result.intent).toBe('query_search')
    expect(result.urls).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 2. URL-only (just a URL) → intent: 'url_extract', urls has 1 entry
// ---------------------------------------------------------------------------

describe('classifyWebInput — URL-only', () => {
  it('classifies a single https URL as url_extract with one url', () => {
    const result = classifyWebInput('https://example.com')
    expect(result.intent).toBe('url_extract')
    expect(result.urls).toHaveLength(1)
    expect(result.urls[0]).toBe('https://example.com/')
  })

  it('classifies an http URL as url_extract', () => {
    const result = classifyWebInput('http://docs.example.org/page')
    expect(result.intent).toBe('url_extract')
    expect(result.urls).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 3. Query + URL → intent: 'url_extract_with_query'
// ---------------------------------------------------------------------------

describe('classifyWebInput — query + URL', () => {
  it('classifies query text with a URL as url_extract_with_query', () => {
    const result = classifyWebInput('summarize https://example.com/article')
    expect(result.intent).toBe('url_extract_with_query')
    expect(result.urls).toHaveLength(1)
    expect(result.queryWithoutUrls).toBe('summarize')
  })

  it('classifies query with URL in explicit urls as url_extract_with_query', () => {
    const result = classifyWebInput('get the main points', ['https://example.com/page'])
    expect(result.intent).toBe('url_extract_with_query')
    expect(result.urls).toHaveLength(1)
    expect(result.queryWithoutUrls).toBe('get the main points')
  })
})

// ---------------------------------------------------------------------------
// 4. Site-exploration wording with URL → intent: 'site_exploration'
// ---------------------------------------------------------------------------

describe('classifyWebInput — site-exploration wording', () => {
  it('classifies "explore" + URL as site_exploration', () => {
    const result = classifyWebInput('explore https://docs.example.com docs')
    expect(result.intent).toBe('site_exploration')
    expect(result.urls).toHaveLength(1)
  })

  it('classifies "browse" + URL as site_exploration', () => {
    const result = classifyWebInput('browse https://api.example.com/reference')
    expect(result.intent).toBe('site_exploration')
    expect(result.urls).toHaveLength(1)
  })

  it('classifies "docs" wording + URL as site_exploration', () => {
    const result = classifyWebInput('find the docs https://framework.dev')
    expect(result.intent).toBe('site_exploration')
    expect(result.urls).toHaveLength(1)
  })

  it('classifies "site" wording + URL as site_exploration', () => {
    const result = classifyWebInput('map this site https://example.com')
    expect(result.intent).toBe('site_exploration')
    expect(result.urls).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 5. Bare domain 'example.com' is NOT treated as URL (Req 3.2)
// ---------------------------------------------------------------------------

describe('classifyWebInput — bare domain not treated as URL', () => {
  it('treats bare domain example.com as query_search', () => {
    const result = classifyWebInput('example.com')
    expect(result.intent).toBe('query_search')
    expect(result.urls).toEqual([])
  })

  it('treats bare domain docs.google.com as query_search', () => {
    const result = classifyWebInput('docs.google.com/something')
    expect(result.intent).toBe('query_search')
    expect(result.urls).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 6. ftp:// URL is NOT treated as URL → intent: 'query_search'
// ---------------------------------------------------------------------------

describe('classifyWebInput — non-http schemes not treated as URL', () => {
  it('treats ftp:// URL as query_search', () => {
    const result = classifyWebInput('ftp://files.example.com/data')
    expect(result.intent).toBe('query_search')
    expect(result.urls).toEqual([])
  })

  it('treats file:// URL as query_search', () => {
    const result = classifyWebInput('file:///home/user/doc.txt')
    expect(result.intent).toBe('query_search')
    expect(result.urls).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 7. Duplicate URLs deduplicated: same URL in query twice → urls.length === 1
// ---------------------------------------------------------------------------

describe('classifyWebInput — duplicate URL de-duplication', () => {
  it('deduplicates same URL appearing twice in query', () => {
    const result = classifyWebInput(
      'https://example.com/page https://example.com/page',
    )
    expect(result.urls).toHaveLength(1)
  })

  it('deduplicates case-insensitive URLs', () => {
    const result = classifyWebInput(
      'https://Example.Com/Page https://example.com/page',
    )
    expect(result.urls).toHaveLength(1)
  })

  it('deduplicates across query and explicit urls', () => {
    const result = classifyWebInput('https://example.com', ['https://example.com'])
    expect(result.urls).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 8. URLs in first-occurrence order (Req 3.4)
// ---------------------------------------------------------------------------

describe('classifyWebInput — URL first-occurrence order', () => {
  it('preserves first-occurrence order from explicit urls then query', () => {
    const result = classifyWebInput(
      'check https://third.com content',
      ['https://first.com', 'https://second.com'],
    )
    expect(result.urls[0]).toContain('first.com')
    expect(result.urls[1]).toContain('second.com')
    expect(result.urls[2]).toContain('third.com')
  })

  it('preserves order of URLs within query text', () => {
    const result = classifyWebInput(
      'https://alpha.com https://beta.com https://gamma.com',
    )
    expect(result.urls[0]).toContain('alpha.com')
    expect(result.urls[1]).toContain('beta.com')
    expect(result.urls[2]).toContain('gamma.com')
  })
})

// ---------------------------------------------------------------------------
// 9. reformulateQuery strips "can you please find" prefix
// ---------------------------------------------------------------------------

describe('reformulateQuery — strips lead-in phrases', () => {
  it('strips "can you please find" prefix', () => {
    const result = reformulateQuery('can you please find the best react libraries')
    expect(result).toBe('the best react libraries')
  })

  it('strips "could you please search" prefix', () => {
    const result = reformulateQuery('could you please search node.js tutorials')
    expect(result).toBe('node.js tutorials')
  })

  it('strips "please find" prefix', () => {
    const result = reformulateQuery('please find documentation for vitest')
    expect(result).toBe('documentation for vitest')
  })

  it('strips "search for" prefix', () => {
    const result = reformulateQuery('search for typescript generics')
    expect(result).toBe('typescript generics')
  })

  it('strips "tell me about" prefix', () => {
    const result = reformulateQuery('tell me about rust programming')
    expect(result).toBe('rust programming')
  })

  it('strips "i want to know about" prefix', () => {
    const result = reformulateQuery('i want to know about machine learning')
    expect(result).toBe('machine learning')
  })

  it('is case-insensitive when stripping prefixes', () => {
    const result = reformulateQuery('Can You Please Find the latest news')
    expect(result).toBe('the latest news')
  })
})

// ---------------------------------------------------------------------------
// 10. reformulateQuery strips trailing question marks
// ---------------------------------------------------------------------------

describe('reformulateQuery — strips trailing question marks', () => {
  it('strips a single trailing question mark', () => {
    const result = reformulateQuery('what is typescript?')
    expect(result).not.toMatch(/\?$/)
  })

  it('strips multiple trailing question marks', () => {
    const result = reformulateQuery('how does react work???')
    expect(result).not.toMatch(/\?+$/)
  })

  it('does not strip question marks in the middle', () => {
    const result = reformulateQuery('is it? yes or no')
    expect(result).toContain('?')
  })
})

// ---------------------------------------------------------------------------
// 11. normalizeUrlCandidate returns null for bare domains, ftp://, empty strings
// ---------------------------------------------------------------------------

describe('normalizeUrlCandidate — invalid inputs return null', () => {
  it('returns null for a bare domain', () => {
    expect(normalizeUrlCandidate('example.com')).toBeNull()
  })

  it('returns null for a bare domain with path', () => {
    expect(normalizeUrlCandidate('docs.example.com/path')).toBeNull()
  })

  it('returns null for ftp:// URL', () => {
    expect(normalizeUrlCandidate('ftp://files.example.com')).toBeNull()
  })

  it('returns null for file:// URL', () => {
    expect(normalizeUrlCandidate('file:///home/user/doc.txt')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(normalizeUrlCandidate('')).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(normalizeUrlCandidate('   ')).toBeNull()
  })

  it('returns null for localhost URLs', () => {
    expect(normalizeUrlCandidate('http://localhost')).toBeNull()
    expect(normalizeUrlCandidate('https://localhost/path')).toBeNull()
  })

  it('returns a normalized URL string for valid http/https URLs', () => {
    const result = normalizeUrlCandidate('https://example.com/page')
    expect(result).not.toBeNull()
    expect(result).toContain('example.com')
  })
})
