// @vitest-environment node

/**
 * Unit tests for `normalizeRequest` — concrete edge-case examples.
 *
 * Requirements validated: 2.1, 2.4, 2.7, 2.8, 2.9
 */

import { describe, it, expect } from 'vitest'

import { normalizeRequest } from './request'
import { SEARCH_MAX_QUERY_LENGTH, SEARCH_MAX_RESULTS } from './constants'
import type { NormalizedRequest } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type guard: result is a validation error (ToolResult with success:false) */
function isError(result: unknown): result is { success: false; error: string } {
  return (
    typeof result === 'object' &&
    result !== null &&
    'success' in result &&
    (result as { success: boolean }).success === false
  )
}

/** Type guard: result is a successful NormalizedRequest (no `success` key) */
function isNormalized(result: unknown): result is NormalizedRequest {
  return typeof result === 'object' && result !== null && !('success' in result)
}

// ---------------------------------------------------------------------------
// 1. Whitespace-only query → success:false
// ---------------------------------------------------------------------------

describe('normalizeRequest — whitespace-only query', () => {
  it('rejects a single space', () => {
    const result = normalizeRequest({ query: ' ' } as never)
    expect(isError(result)).toBe(true)
    if (isError(result)) {
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    }
  })

  it('rejects tab + newline', () => {
    const result = normalizeRequest({ query: '\t\n' } as never)
    expect(isError(result)).toBe(true)
    if (isError(result)) {
      expect(result.success).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Query longer than SEARCH_MAX_QUERY_LENGTH → truncated
// ---------------------------------------------------------------------------

describe('normalizeRequest — over-length query truncation', () => {
  it('truncates a query to exactly SEARCH_MAX_QUERY_LENGTH', () => {
    const longQuery = 'a'.repeat(SEARCH_MAX_QUERY_LENGTH + 100)
    const result = normalizeRequest({ query: longQuery } as never)
    expect(isNormalized(result)).toBe(true)
    if (isNormalized(result)) {
      expect(result.query.length).toBe(SEARCH_MAX_QUERY_LENGTH)
      expect(result.query).toBe('a'.repeat(SEARCH_MAX_QUERY_LENGTH))
    }
  })
})

// ---------------------------------------------------------------------------
// 3. num_results as float → truncated to integer
// ---------------------------------------------------------------------------

describe('normalizeRequest — num_results as float', () => {
  it('truncates 2.7 to integer 2', () => {
    const result = normalizeRequest({ query: 'test', num_results: 2.7 } as never)
    expect(isNormalized(result)).toBe(true)
    if (isNormalized(result)) {
      expect(result.numResults).toBe(2)
    }
  })
})

// ---------------------------------------------------------------------------
// 4. num_results as string '3' → coerced to 3
// ---------------------------------------------------------------------------

describe('normalizeRequest — num_results as string', () => {
  it('coerces string "3" to integer 3', () => {
    const result = normalizeRequest({ query: 'test', num_results: '3' as unknown as number })
    expect(isNormalized(result)).toBe(true)
    if (isNormalized(result)) {
      expect(result.numResults).toBe(3)
    }
  })
})

// ---------------------------------------------------------------------------
// 5. num_results as non-numeric string → defaults to SEARCH_MAX_RESULTS
// ---------------------------------------------------------------------------

describe('normalizeRequest — num_results non-numeric string', () => {
  it('defaults "abc" to SEARCH_MAX_RESULTS', () => {
    const result = normalizeRequest({ query: 'test', num_results: 'abc' as unknown as number })
    expect(isNormalized(result)).toBe(true)
    if (isNormalized(result)) {
      expect(result.numResults).toBe(SEARCH_MAX_RESULTS)
    }
  })
})

// ---------------------------------------------------------------------------
// 6. num_results as 0 → clamped to 1
// ---------------------------------------------------------------------------

describe('normalizeRequest — num_results as 0', () => {
  it('clamps 0 to 1', () => {
    const result = normalizeRequest({ query: 'test', num_results: 0 } as never)
    expect(isNormalized(result)).toBe(true)
    if (isNormalized(result)) {
      expect(result.numResults).toBe(1)
    }
  })
})

// ---------------------------------------------------------------------------
// 7. num_results as 999 → clamped to SEARCH_MAX_RESULTS
// ---------------------------------------------------------------------------

describe('normalizeRequest — num_results as 999', () => {
  it('clamps 999 to SEARCH_MAX_RESULTS', () => {
    const result = normalizeRequest({ query: 'test', num_results: 999 } as never)
    expect(isNormalized(result)).toBe(true)
    if (isNormalized(result)) {
      expect(result.numResults).toBe(SEARCH_MAX_RESULTS)
    }
  })
})

// ---------------------------------------------------------------------------
// 8. Valid enums preserved
// ---------------------------------------------------------------------------

describe('normalizeRequest — valid enums preserved', () => {
  it('preserves search_depth=advanced, time_range=week, topic=finance', () => {
    const result = normalizeRequest({
      query: 'test',
      search_depth: 'advanced',
      time_range: 'week',
      topic: 'finance',
    })
    expect(isNormalized(result)).toBe(true)
    if (isNormalized(result)) {
      expect(result.searchDepth).toBe('advanced')
      expect(result.timeRange).toBe('week')
      expect(result.topic).toBe('finance')
    }
  })
})

// ---------------------------------------------------------------------------
// 9. Invalid search_depth → normalized to 'basic'
// ---------------------------------------------------------------------------

describe('normalizeRequest — invalid search_depth', () => {
  it('normalizes "deep" to "basic"', () => {
    const result = normalizeRequest({
      query: 'test',
      search_depth: 'deep' as unknown as 'basic',
    })
    expect(isNormalized(result)).toBe(true)
    if (isNormalized(result)) {
      expect(result.searchDepth).toBe('basic')
    }
  })
})

// ---------------------------------------------------------------------------
// 10. include_images as string → defaults to true
// ---------------------------------------------------------------------------

describe('normalizeRequest — include_images as string', () => {
  it('defaults string "yes" to true', () => {
    const result = normalizeRequest({
      query: 'test',
      include_images: 'yes' as unknown as boolean,
    })
    expect(isNormalized(result)).toBe(true)
    if (isNormalized(result)) {
      expect(result.includeImages).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// 11. include_images as false → preserved
// ---------------------------------------------------------------------------

describe('normalizeRequest — include_images as false', () => {
  it('preserves explicit false', () => {
    const result = normalizeRequest({ query: 'test', include_images: false })
    expect(isNormalized(result)).toBe(true)
    if (isNormalized(result)) {
      expect(result.includeImages).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// 12. Input object is not mutated (freeze test)
// ---------------------------------------------------------------------------

describe('normalizeRequest — input not mutated', () => {
  it('does not mutate a frozen input object', () => {
    const input = Object.freeze({
      query: 'hello world',
      num_results: 2.9,
      search_depth: 'advanced' as const,
      time_range: 'week' as const,
      topic: 'news' as const,
      include_images: false,
      urls: Object.freeze(['https://example.com']),
    })

    // Should not throw on a frozen object
    expect(() => normalizeRequest(input as never)).not.toThrow()

    const result = normalizeRequest(input as never)
    expect(isNormalized(result)).toBe(true)

    // Verify original fields remain unchanged
    expect(input.query).toBe('hello world')
    expect(input.num_results).toBe(2.9)
    expect(input.search_depth).toBe('advanced')
    expect(input.time_range).toBe('week')
    expect(input.topic).toBe('news')
    expect(input.include_images).toBe(false)
    expect(input.urls).toEqual(['https://example.com'])
  })
})
