import type { ToolResult } from '../types'
import { SEARCH_MAX_QUERY_LENGTH, SEARCH_MAX_RESULTS } from './constants'
import type { NormalizedRequest, WebSearchArgs } from './types'

// ---------------------------------------------------------------------------
// Request Normalizer (web-search-backend-rebuild)
//
// Pure validation + coercion of untrusted `WebSearchArgs` into a
// `NormalizedRequest`. This module performs NO I/O and NEVER mutates the input
// `args` object. On invalid input it returns a `ToolResult` (`success: false`)
// so the orchestrator can discriminate via `'success' in result`.
// ---------------------------------------------------------------------------

type SearchDepth = 'ultra-fast' | 'fast' | 'basic' | 'advanced'
type TimeRange = 'day' | 'week' | 'month' | 'year'
type Topic = 'general' | 'news' | 'finance'

/**
 * Normalize `search_depth` to a valid tier, defaulting to `basic` when the
 * supplied value is not one of the recognized depths.
 */
function coerceSearchDepth(value: unknown): SearchDepth {
  if (value === 'ultra-fast' || value === 'fast' || value === 'basic' || value === 'advanced') {
    return value
  }

  return 'basic'
}

/**
 * Coerce `time_range` to a valid enum member or `undefined` when absent/invalid.
 */
function coerceTimeRange(value: unknown): TimeRange | undefined {
  if (value === 'day' || value === 'week' || value === 'month' || value === 'year') {
    return value
  }

  return undefined
}

/**
 * Coerce `topic` to a valid enum member or `undefined` when absent/invalid.
 */
function coerceTopic(value: unknown): Topic | undefined {
  if (value === 'general' || value === 'news' || value === 'finance') {
    return value
  }

  return undefined
}

/**
 * A provided-but-unrecognized `time_range` is a hard validation error.
 */
function hasInvalidTimeRange(value: unknown): boolean {
  return value !== undefined && coerceTimeRange(value) === undefined
}

/**
 * A provided-but-unrecognized `topic` is a hard validation error.
 */
function hasInvalidTopic(value: unknown): boolean {
  return value !== undefined && coerceTopic(value) === undefined
}

/**
 * Default `include_images` to `true` whenever a boolean is not supplied.
 */
function coerceIncludeImages(value: unknown): boolean {
  return typeof value === 'boolean' ? value : true
}

/**
 * Coerce `num_results` to an integer clamped to `[1, SEARCH_MAX_RESULTS]`,
 * defaulting to `SEARCH_MAX_RESULTS` when missing or not coercible to a number.
 */
function coerceNumResults(value: unknown): number {
  let numResults: number

  if (typeof value === 'number') {
    numResults = value
  } else if (typeof value === 'string' && value.trim() !== '') {
    numResults = Number(value)
  } else {
    numResults = SEARCH_MAX_RESULTS
  }

  if (!Number.isFinite(numResults)) {
    numResults = SEARCH_MAX_RESULTS
  }

  const asInteger = Math.trunc(numResults)
  return Math.min(Math.max(asInteger, 1), SEARCH_MAX_RESULTS)
}

/**
 * Carry through `urls` only when it is an array, copying it into a fresh array
 * of string entries so the input `args` object is never referenced or mutated.
 * Returns `undefined` when no usable URL list is present.
 */
function coerceUrls(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const urls = value.filter((entry): entry is string => typeof entry === 'string')
  return urls.length > 0 ? urls : undefined
}

/**
 * Validate and coerce untrusted `WebSearchArgs` into a `NormalizedRequest`.
 *
 * @returns A `NormalizedRequest` on success, or a `ToolResult` with
 * `success: false` and a descriptive `error` when validation fails. Callers
 * discriminate the two via `'success' in result`.
 */
export function normalizeRequest(args: WebSearchArgs): NormalizedRequest | ToolResult {
  const rawQuery = args?.query
  if (!rawQuery || typeof rawQuery !== 'string') {
    return {
      success: false,
      error: 'Search query is required',
    }
  }

  let query = rawQuery.trim()
  if (!query) {
    return {
      success: false,
      error: 'Search query cannot be empty',
    }
  }

  if (query.length > SEARCH_MAX_QUERY_LENGTH) {
    query = query.slice(0, SEARCH_MAX_QUERY_LENGTH)
  }

  if (hasInvalidTimeRange(args.time_range)) {
    return {
      success: false,
      error: 'Invalid time_range. Expected one of: day, week, month, year.',
    }
  }

  if (hasInvalidTopic(args.topic)) {
    return {
      success: false,
      error: 'Invalid topic. Expected one of: general, news, finance.',
    }
  }

  const normalized: NormalizedRequest = {
    query,
    numResults: coerceNumResults(args.num_results),
    searchDepth: coerceSearchDepth(args.search_depth),
    includeImages: coerceIncludeImages(args.include_images),
    timeRange: coerceTimeRange(args.time_range),
    topic: coerceTopic(args.topic),
  }

  const urls = coerceUrls(args.urls)
  if (urls) {
    normalized.urls = urls
  }

  return normalized
}
