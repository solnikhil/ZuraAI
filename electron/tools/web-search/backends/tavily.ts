import type { ToolResult } from '../../types'
import {
  SEARCH_EXTRACT_FETCH_TIMEOUT_MS,
  SEARCH_MAX_EXTRACT_URLS,
  SEARCH_FETCH_TIMEOUT_MS,
} from '../constants'
import {
  compactMap,
  extractTavilyImages,
  getFailureMessage,
  isRecord,
  parseTavilyImage,
  parseTavilyExtractResult,
  parseTavilySearchResult,
} from '../helpers'
import { normalizeUrlCandidate } from '../intent'
import type { SearchExecutionOptions, TavilyExtractArgs } from '../types'

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function extractWithTavily({
  urls,
  query,
  apiKey,
  intent,
  includeImages,
}: TavilyExtractArgs): Promise<ToolResult> {
  try {
    const normalizedUrls = [...new Set(
      urls
        .map((url) => normalizeUrlCandidate(url) || '')
        .filter(Boolean)
    )].slice(0, SEARCH_MAX_EXTRACT_URLS)

    if (normalizedUrls.length === 0) {
      return {
        success: false,
        error: 'No valid URL was found to extract from.',
      }
    }

    const cleanedQuery = typeof query === 'string' ? query.trim() : ''
    const extractionQuery = cleanedQuery.length > 400
      ? `${cleanedQuery.slice(0, 397)}...`
      : cleanedQuery
    const extractDepth = extractionQuery ? 'advanced' : 'basic'

    const body: Record<string, unknown> = {
      api_key: apiKey,
      urls: normalizedUrls,
      format: 'markdown',
      extract_depth: extractDepth,
      include_images: includeImages,
      include_favicon: true,
    }

    if (extractionQuery) {
      body.query = extractionQuery
      body.chunks_per_source = 3
    }

    const response = await fetchWithTimeout(
      'https://api.tavily.com/extract',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      SEARCH_EXTRACT_FETCH_TIMEOUT_MS
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Tavily Extract API error: ${response.status} - ${error}`)
    }

    const data = await response.json()
    const payload = isRecord(data) ? data : {}
    const rawResults = Array.isArray(payload.results) ? payload.results : []
    const results = compactMap(rawResults, parseTavilyExtractResult)

    if (results.length === 0) {
      const failures = Array.isArray(payload.failed_results) ? payload.failed_results : []
      const firstFailure = getFailureMessage(failures)
      return {
        success: false,
        error: `Tavily Extract returned no extractable content.${firstFailure}`,
      }
    }

    const images = includeImages ? extractTavilyImages(rawResults) : []
    const failures = Array.isArray(payload.failed_results) ? payload.failed_results : []
    const partialFailureMessage = failures.length > 0
      ? `${failures.length} URL(s) could not be extracted.`
      : undefined

    return {
      success: true,
      data: {
        query: extractionQuery || normalizedUrls[0],
        urls: normalizedUrls,
        results,
        images,
        resultCount: results.length,
        imageCount: images.length,
        source: 'tavily_extract',
        extractDepth,
        intent,
        ...(partialFailureMessage ? { message: partialFailureMessage } : {}),
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to extract with Tavily'
    if (message.includes('abort')) {
      return {
        success: false,
        error: 'URL extraction timed out. Please try again.',
      }
    }

    return {
      success: false,
      error: message,
    }
  }
}

export async function searchWithTavily(
  apiKey: string,
  options: SearchExecutionOptions
): Promise<ToolResult> {
  try {
    const body: Record<string, unknown> = {
      api_key: apiKey,
      query: options.query,
      search_depth: options.searchDepth,
      max_results: options.numResults,
      include_answer: false,
      include_raw_content: false,
      include_images: options.includeImages,
    }

    if (options.searchDepth === 'advanced') {
      body.chunks_per_source = 3
    }

    if (options.timeRange) {
      body.time_range = options.timeRange
    }
    if (options.topic) {
      body.topic = options.topic
    }

    const response = await fetchWithTimeout(
      'https://api.tavily.com/search',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      SEARCH_FETCH_TIMEOUT_MS
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Tavily API error: ${response.status} - ${error}`)
    }

    const data = await response.json()
    const payload = isRecord(data) ? data : {}
    const rawResults = Array.isArray(payload.results) ? payload.results : []
    const rawImages = Array.isArray(payload.images) ? payload.images : []

    const results = compactMap(rawResults, parseTavilySearchResult)
    const images = options.includeImages ? compactMap(rawImages, (image) => parseTavilyImage(image)) : []

    return {
      success: true,
      data: {
        query: options.query,
        results,
        images,
        resultCount: results.length,
        imageCount: images.length,
        source: 'tavily',
        searchDepth: options.searchDepth,
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to search with Tavily'
    if (message.includes('abort')) {
      return {
        success: false,
        error: 'Search request timed out. Please try again.',
      }
    }

    return {
      success: false,
      error: message,
    }
  }
}
