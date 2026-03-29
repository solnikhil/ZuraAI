import { search as duckDuckScrapeSearch, SafeSearchType } from 'duck-duck-scrape'
import type { ToolResult } from '../../types'
import { SEARCH_FETCH_TIMEOUT_MS } from '../constants'
import { compactMap, parseDuckDuckScrapeResult } from '../helpers'

export async function searchWithDuckDuckGo(
  query: string,
  numResults: number
): Promise<ToolResult> {
  let searchResults: Awaited<ReturnType<typeof duckDuckScrapeSearch>>

  try {
    searchResults = await Promise.race([
      duckDuckScrapeSearch(query, { safeSearch: SafeSearchType.MODERATE }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Search timed out')), SEARCH_FETCH_TIMEOUT_MS)
      ),
    ])
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to search with DuckDuckGo'
    return {
      success: false,
      error: message,
    }
  }

  const rawResults = Array.isArray(searchResults?.results) ? searchResults.results : []
  const results = compactMap(rawResults.slice(0, numResults), parseDuckDuckScrapeResult)

  if (results.length === 0) {
    return {
      success: true,
      data: {
        query,
        answer: null,
        results: [],
        resultCount: 0,
        source: 'duckduckgo',
        message: 'No results found. For better search quality, add a Tavily API key in Settings > Search APIs.',
      },
    }
  }

  return {
    success: true,
    data: {
      query,
      answer: null,
      results,
      resultCount: results.length,
      source: 'duckduckgo',
    },
  }
}
