import { getSecureValueAsync } from '../../secureStorage'
import type { ToolResult } from '../types'
import {
  SEARCH_MAX_QUERY_LENGTH,
  SEARCH_MAX_RESULTS,
} from './constants'
import {
  buildFallbackSearchQuery,
  classifyWebInput,
  reformulateQueryIfNeeded,
} from './intent'
import { searchWithDuckDuckGo } from './backends/duckduckgo'
import { extractWithTavily, searchWithTavily } from './backends/tavily'
import type { SearchExecutionOptions, WebSearchArgs } from './types'

function truncateForLog(value: string, maxLength: number = 200): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 3)}...`
}

function logWebSearchFailure(
  stage: string,
  details: {
    query?: string
    intent?: string
    hasTavilyKey?: boolean
    error: string
  }
): void {
  console.error('[web_search] request failed', {
    stage,
    query: details.query ? truncateForLog(details.query) : undefined,
    intent: details.intent,
    hasTavilyKey: details.hasTavilyKey,
    error: details.error,
  })
}

function logWebSearchFallback(
  stage: string,
  details: {
    query?: string
    intent?: string
    hasTavilyKey?: boolean
    error: string
  }
): void {
  console.warn('[web_search] backend failed, attempting fallback', {
    stage,
    query: details.query ? truncateForLog(details.query) : undefined,
    intent: details.intent,
    hasTavilyKey: details.hasTavilyKey,
    error: details.error,
  })
}

function coerceSearchDepth(value: unknown): 'ultra-fast' | 'fast' | 'basic' | 'advanced' {
  if (value === 'ultra-fast' || value === 'fast' || value === 'basic' || value === 'advanced') {
    return value
  }

  return 'basic'
}

function coerceTimeRange(value: unknown): 'day' | 'week' | 'month' | 'year' | undefined {
  if (value === 'day' || value === 'week' || value === 'month' || value === 'year') return value
  return undefined
}

function coerceTopic(value: unknown): 'general' | 'news' | 'finance' | undefined {
  if (value === 'general' || value === 'news' || value === 'finance') return value
  return undefined
}

function coerceIncludeImages(value: unknown): boolean {
  return typeof value === 'boolean' ? value : true
}

function appendMessageToResult(result: ToolResult, message: string): ToolResult {
  if (!result.success || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
    return result
  }

  const existingMessage = typeof (result.data as Record<string, unknown>).message === 'string'
    ? String((result.data as Record<string, unknown>).message)
    : ''

  return {
    ...result,
    data: {
      ...(result.data as Record<string, unknown>),
      message: existingMessage ? `${existingMessage} ${message}` : message,
    },
  }
}

function coerceNumResults(value: unknown): number {
  let numResults: number | string = typeof value === 'number' || typeof value === 'string'
    ? value
    : SEARCH_MAX_RESULTS
  if (typeof numResults === 'string') {
    const parsed = Number(numResults)
    numResults = Number.isNaN(parsed) ? SEARCH_MAX_RESULTS : parsed
  }

  if (typeof numResults !== 'number' || numResults < 1) {
    numResults = SEARCH_MAX_RESULTS
  }

  const normalizedNumResults = numResults as number
  return Math.min(Math.max(normalizedNumResults, 1), SEARCH_MAX_RESULTS)
}

function normalizeSearchRequest(args: WebSearchArgs): SearchExecutionOptions | ToolResult {
  let query = args.query
  if (!query || typeof query !== 'string') {
    return {
      success: false,
      error: 'Search query is required',
    }
  }

  query = query.trim()
  if (!query) {
    return {
      success: false,
      error: 'Search query cannot be empty',
    }
  }

  if (query.length > SEARCH_MAX_QUERY_LENGTH) {
    query = query.slice(0, SEARCH_MAX_QUERY_LENGTH)
  }

  return {
    query,
    numResults: coerceNumResults(args.num_results),
    searchDepth: coerceSearchDepth(args.search_depth ?? 'basic'),
    includeImages: coerceIncludeImages(args.include_images),
    timeRange: coerceTimeRange(args.time_range),
    topic: coerceTopic(args.topic),
  }
}

export async function executeWebSearch(args: WebSearchArgs): Promise<ToolResult> {
  const normalizedRequest = normalizeSearchRequest(args)
  if ('success' in normalizedRequest) {
    logWebSearchFailure('validation', {
      query: typeof args?.query === 'string' ? args.query : undefined,
      error: normalizedRequest.error || 'Validation failed',
    })
    return normalizedRequest
  }

  const classifiedInput = classifyWebInput(normalizedRequest.query, args.urls)
  const isExtractIntent = classifiedInput.intent !== 'query_search'

  const tavilyKey = await getSecureValueAsync('tavilyApiKey')
  const hasTavilyKey = Boolean(tavilyKey && tavilyKey.trim())
  const safeTavilyKey = tavilyKey?.trim() || ''

  if (isExtractIntent) {
    const extractQuery = classifiedInput.queryWithoutUrls || undefined

    if (hasTavilyKey) {
      const tavilyExtractResult = await extractWithTavily({
        urls: classifiedInput.urls,
        query: extractQuery,
        apiKey: safeTavilyKey,
        intent: classifiedInput.intent,
        includeImages: normalizedRequest.includeImages,
      })

      if (tavilyExtractResult.success) {
        return tavilyExtractResult
      }

      logWebSearchFallback('tavily-extract', {
        query: normalizedRequest.query,
        intent: classifiedInput.intent,
        hasTavilyKey,
        error: tavilyExtractResult.error || 'Tavily extract failed',
      })

      const fallbackQuery = reformulateQueryIfNeeded(buildFallbackSearchQuery(classifiedInput))
      const tavilySearchFallback = await searchWithTavily(safeTavilyKey, {
        ...normalizedRequest,
        query: fallbackQuery,
      })
      if (tavilySearchFallback.success) {
        return appendMessageToResult(
          tavilySearchFallback,
          'Direct URL extraction failed, so fallback search results were returned.'
        )
      }

      logWebSearchFallback('tavily-search-fallback', {
        query: fallbackQuery,
        intent: classifiedInput.intent,
        hasTavilyKey,
        error: tavilySearchFallback.error || 'Tavily search fallback failed',
      })

      const ddgFallback = await searchWithDuckDuckGo(fallbackQuery, normalizedRequest.numResults)
      if (ddgFallback.success) {
        return appendMessageToResult(
          ddgFallback,
          'Direct URL extraction failed, so fallback web results were returned.'
        )
      }

      logWebSearchFallback('duckduckgo-fallback', {
        query: fallbackQuery,
        intent: classifiedInput.intent,
        hasTavilyKey,
        error: ddgFallback.error || 'DuckDuckGo fallback failed',
      })

      const result = {
        success: false,
        error: `Web extraction failed. ${tavilyExtractResult.error} Search fallback also failed. Please check your internet connection and try again.`,
      }
      logWebSearchFailure('extract-with-tavily-and-fallbacks', {
        query: normalizedRequest.query,
        intent: classifiedInput.intent,
        hasTavilyKey,
        error: result.error,
      })
      return result
    }

    const fallbackQuery = reformulateQueryIfNeeded(buildFallbackSearchQuery(classifiedInput))
    const fallbackResult = await searchWithDuckDuckGo(fallbackQuery, normalizedRequest.numResults)
    if (fallbackResult.success) {
      return appendMessageToResult(
        fallbackResult,
        'URL-focused extraction is available with a Tavily API key (Settings > Search APIs). Returned search results instead.'
      )
    }

    const result = {
      success: false,
      error: 'This request includes a specific URL. Add a Tavily API key in Settings > Search APIs to enable direct URL extraction.',
    }
    logWebSearchFailure('extract-without-tavily-key', {
      query: normalizedRequest.query,
      intent: classifiedInput.intent,
      hasTavilyKey,
      error: result.error,
    })
    return result
  }

  const searchQuery = reformulateQueryIfNeeded(
    classifiedInput.queryWithoutUrls || classifiedInput.originalQuery
  )

  if (hasTavilyKey) {
    const tavilyResult = await searchWithTavily(safeTavilyKey, {
      ...normalizedRequest,
      query: searchQuery,
    })
    if (tavilyResult.success) {
      return tavilyResult
    }

    logWebSearchFallback('tavily-search', {
      query: searchQuery,
      intent: classifiedInput.intent,
      hasTavilyKey,
      error: tavilyResult.error || 'Tavily search failed',
    })

    const fallbackResult = await searchWithDuckDuckGo(searchQuery, normalizedRequest.numResults)
    if (fallbackResult.success) {
      return fallbackResult
    }

    logWebSearchFallback('duckduckgo-fallback', {
      query: searchQuery,
      intent: classifiedInput.intent,
      hasTavilyKey,
      error: fallbackResult.error || 'DuckDuckGo fallback failed',
    })

    const result = {
      success: false,
      error: `Web search failed. ${tavilyResult.error} Fallback also failed. Please check your internet connection and try again. For best results, add a valid Tavily API key in Settings > Search APIs.`,
    }
    logWebSearchFailure('search-with-tavily-and-fallback', {
      query: searchQuery,
      intent: classifiedInput.intent,
      hasTavilyKey,
      error: result.error,
    })
    return result
  }

  const fallbackResult = await searchWithDuckDuckGo(searchQuery, normalizedRequest.numResults)
  if (!fallbackResult.success) {
    logWebSearchFailure('search-with-duckduckgo', {
      query: searchQuery,
      intent: classifiedInput.intent,
      hasTavilyKey,
      error: fallbackResult.error || 'DuckDuckGo search failed',
    })
  }

  return fallbackResult
}
