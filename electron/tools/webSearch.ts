// Web Search Tool - Search the internet for information
// Primary: Tavily API (best for AI applications)
// Fallback: duck-duck-scrape (real DuckDuckGo web search, no key needed)

import { search as duckDuckScrapeSearch, SafeSearchType } from 'duck-duck-scrape'
import type { ToolResult } from './types'
import { getSecureValueAsync } from '../secureStorage'

const FETCH_TIMEOUT_MS = 20000
const MAX_QUERY_LENGTH = 500

interface WebSearchArgs {
    query: string
    num_results?: number
    search_depth?: 'basic' | 'advanced'
}

interface SearchResult {
    title: string
    url: string
    snippet: string
    favicon?: string
    source?: string
    displayed_link?: string
    date?: string
}

interface ImageResult {
    url: string
    description?: string
}

/**
 * Coerce search_depth to valid value
 */
function coerceSearchDepth(value: unknown): 'basic' | 'advanced' {
    if (value === 'advanced') return 'advanced'
    return 'basic'
}

/**
 * Execute web search using available API
 * Priority: Tavily > duck-duck-scrape (fallback when no key or Tavily fails)
 */
export async function executeWebSearch(args: WebSearchArgs): Promise<ToolResult> {
    // Coerce num_results to number
    let num_results = args.num_results ?? 5
    if (typeof num_results === 'string') {
        const parsed = Number(num_results)
        num_results = isNaN(parsed) ? 5 : parsed
    }
    if (typeof num_results !== 'number' || num_results < 1) {
        num_results = 5
    }
    num_results = Math.min(Math.max(num_results, 1), 10)

    const search_depth = coerceSearchDepth(args.search_depth ?? 'basic')

    // Validate and sanitize query
    let query = args.query
    if (!query || typeof query !== 'string') {
        return {
            success: false,
            error: 'Search query is required'
        }
    }
    query = query.trim()
    if (!query) {
        return {
            success: false,
            error: 'Search query cannot be empty'
        }
    }
    if (query.length > MAX_QUERY_LENGTH) {
        query = query.slice(0, MAX_QUERY_LENGTH)
    }

    const tavilyKey = process.env.TAVILY_API_KEY || await getSecureValueAsync('tavilyApiKey')

    if (tavilyKey && tavilyKey.trim()) {
        const tavilyResult = await searchWithTavily(query, num_results, tavilyKey.trim(), search_depth)
        if (tavilyResult.success) {
            return tavilyResult
        }
        // Tavily failed - try fallback before giving up
        const fallbackResult = await searchWithDuckDuckScrape(query, num_results)
        if (fallbackResult.success) {
            return fallbackResult
        }
        // Both failed - return user-friendly message
        return {
            success: false,
            error: `Web search failed. ${tavilyResult.error} Fallback also failed. Please check your internet connection and try again. For best results, add a valid Tavily API key in Settings > Search APIs.`
        }
    }

    // No Tavily key - use duck-duck-scrape directly
    return searchWithDuckDuckScrape(query, num_results)
}

/**
 * Extract favicon URL from a website URL
 */
function getFaviconUrl(url: string): string {
    try {
        const domain = new URL(url).hostname
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
    } catch {
        return ''
    }
}

/**
 * Extract domain name (source) from a URL
 */
function getSourceFromUrl(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return ''
    }
}

/**
 * Generate displayed_link from URL (LobeHub-style)
 */
function getDisplayedLink(url: string): string {
    try {
        const urlObj = new URL(url)
        const hostname = urlObj.hostname.replace(/^www\./, '')
        const pathname = urlObj.pathname

        if (pathname === '/' || !pathname) {
            return hostname
        }

        const pathParts = pathname
            .split('/')
            .filter(part => part && part !== 'index.html' && part !== 'index')
            .slice(0, 2)

        if (pathParts.length === 0) {
            return hostname
        }

        return `${hostname} › ${pathParts.join(' › ')}`
    } catch {
        return url
    }
}

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        })
        return response
    } finally {
        clearTimeout(timeoutId)
    }
}

/**
 * Search using Tavily API (best for AI applications)
 * Get API key at: https://tavily.com
 */
async function searchWithTavily(
    query: string,
    numResults: number,
    apiKey: string,
    searchDepth: 'basic' | 'advanced' = 'basic'
): Promise<ToolResult> {
    try {
        const response = await fetchWithTimeout(
            'https://api.tavily.com/search',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: apiKey,
                    query,
                    search_depth: searchDepth,
                    max_results: Math.min(numResults, 10),
                    include_answer: true,
                    include_raw_content: false,
                    include_images: true
                })
            },
            FETCH_TIMEOUT_MS
        )

        if (!response.ok) {
            const error = await response.text()
            throw new Error(`Tavily API error: ${response.status} - ${error}`)
        }

        const data = await response.json()

        const results: SearchResult[] = (data.results || []).map((r: any) => {
            const url = r.url || ''
            return {
                title: r.title || '',
                url,
                snippet: r.content || '',
                favicon: getFaviconUrl(url),
                source: getSourceFromUrl(url),
                displayed_link: getDisplayedLink(url),
                date: r.published_date || r.date || undefined
            }
        })

        const images: ImageResult[] = (data.images || []).map((img: any) => {
            if (typeof img === 'string') {
                return { url: img }
            }
            return {
                url: img.url || img,
                description: img.description || img.alt || undefined
            }
        })

        return {
            success: true,
            data: {
                query,
                answer: data.answer,
                results,
                images,
                resultCount: results.length,
                imageCount: images.length,
                source: 'tavily',
                searchDepth
            }
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to search with Tavily'
        if (message.includes('abort')) {
            return {
                success: false,
                error: 'Search request timed out. Please try again.'
            }
        }
        return {
            success: false,
            error: message
        }
    }
}

/**
 * Fallback search using duck-duck-scrape (real DuckDuckGo web search)
 * Returns actual search results for any query - no API key needed
 */
async function searchWithDuckDuckScrape(query: string, numResults: number = 5): Promise<ToolResult> {
    const maxResults = Math.min(numResults, 10)

    let searchResults: Awaited<ReturnType<typeof duckDuckScrapeSearch>>
    try {
        searchResults = await Promise.race([
            duckDuckScrapeSearch(query, { safeSearch: SafeSearchType.MODERATE }),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Search timed out')), FETCH_TIMEOUT_MS)
            )
        ])
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to search with DuckDuckGo'
        return {
            success: false,
            error: message
        }
    }

    const rawResults = searchResults?.results || []
    const results: SearchResult[] = rawResults.slice(0, maxResults).map((r: any) => {
        const url = r.url || ''
        return {
            title: r.title || url,
            url,
            snippet: r.description || r.rawDescription || '',
            favicon: getFaviconUrl(url),
            source: getSourceFromUrl(url),
            displayed_link: getDisplayedLink(url)
        }
    })

    const emptyHint =
        'No results found. For better search quality, add a Tavily API key in Settings > Search APIs.'

    if (results.length === 0) {
        return {
            success: true,
            data: {
                query,
                answer: null,
                results: [],
                resultCount: 0,
                source: 'duckduckgo',
                message: emptyHint
            }
        }
    }

    return {
        success: true,
        data: {
            query,
            answer: null,
            results,
            resultCount: results.length,
            source: 'duckduckgo'
        }
    }
}
