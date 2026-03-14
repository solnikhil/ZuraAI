// Web Search Tool - Search the internet for information
// Primary: Tavily API (best for AI applications)
// Fallback: duck-duck-scrape (real DuckDuckGo web search, no key needed)

import { search as duckDuckScrapeSearch, SafeSearchType } from 'duck-duck-scrape'
import type { ToolResult } from './types'
import { getSecureValueAsync } from '../secureStorage'

const FETCH_TIMEOUT_MS = 12000
const EXTRACT_FETCH_TIMEOUT_MS = 30000
const MAX_QUERY_LENGTH = 500
const MAX_EXTRACT_URLS = 20
const EXTRACT_SNIPPET_LENGTH = 500

export interface WebSearchArgs {
    query: string
    num_results?: number
    search_depth?: 'basic' | 'advanced'
    time_range?: 'day' | 'week' | 'month' | 'year'
    topic?: 'general' | 'news' | 'finance'
    /** Optional explicit URLs; mostly inferred from query text. */
    urls?: string[]
}

interface SearchResult {
    title: string
    url: string
    snippet: string
    raw_content?: string
    favicon?: string
    source?: string
    displayed_link?: string
    date?: string
}

interface ImageResult {
    url: string
    description?: string
    sourceUrl?: string
}

type WebInputIntent =
    | 'query_search'
    | 'url_extract'
    | 'url_extract_with_query'
    | 'site_exploration'

interface ClassifiedWebInput {
    intent: WebInputIntent
    urls: string[]
    queryWithoutUrls: string
    originalQuery: string
}

function sanitizeUrlToken(token: string): string {
    return token
        .trim()
        .replace(/^[\[\]{}()<>"'`]+/, '')
        .replace(/[\[\]{}()<>"'`,;:!?]+$/, '')
}

function normalizeUrlCandidate(value: string): string | null {
    const trimmed = sanitizeUrlToken(value)
    if (!trimmed) return null

    try {
        if (/^https?:\/\//i.test(trimmed)) {
            const parsed = new URL(trimmed)
            if (!parsed.hostname || parsed.hostname === 'localhost') return null
            return parsed.toString()
        }

        if (/\s/.test(trimmed)) return null
        if (!trimmed.includes('.')) return null
        if (trimmed.startsWith('.') || trimmed.endsWith('.')) return null

        const parsed = new URL(`https://${trimmed}`)
        if (!parsed.hostname || parsed.hostname === 'localhost') return null
        return parsed.toString()
    } catch {
        return null
    }
}

function extractUrlsFromQuery(query: string, explicitUrls?: unknown): string[] {
    const candidates: string[] = []

    if (Array.isArray(explicitUrls)) {
        for (const value of explicitUrls) {
            if (typeof value === 'string') {
                candidates.push(value)
            }
        }
    }

    for (const token of query.split(/\s+/g)) {
        if (!token) continue
        const normalized = normalizeUrlCandidate(token)
        if (normalized) {
            candidates.push(normalized)
        }
    }

    const deduped = [...new Set(candidates.map(url => url.toLowerCase()))]
        .slice(0, MAX_EXTRACT_URLS)
        .map(lower => {
            const match = candidates.find(c => c.toLowerCase() === lower)
            return match || lower
        })

    return deduped
}

function removeUrlsFromQuery(query: string): string {
    const filteredTokens = query
        .split(/\s+/g)
        .filter(Boolean)
        .filter(token => normalizeUrlCandidate(token) === null)

    return filteredTokens.join(' ').trim()
}

function isSiteExplorationIntent(text: string): boolean {
    if (!text) return false

    const patterns = [
        /\b(go through|scan|explore|crawl|map)\b.*\b(site|docs|documentation)\b/i,
        /\b(find|locate|discover)\b.*\b(auth|api|reference|endpoint|documentation|docs)\b/i,
        /\b(site map|sitemap|api references?)\b/i,
    ]

    return patterns.some(re => re.test(text))
}

function classifyWebInput(query: string, explicitUrls?: unknown): ClassifiedWebInput {
    const originalQuery = query.trim()
    const urls = extractUrlsFromQuery(originalQuery, explicitUrls)
    const queryWithoutUrls = removeUrlsFromQuery(originalQuery)
    const hasUrls = urls.length > 0
    const hasNonUrlQuery = queryWithoutUrls.length > 0
    const siteExploration = isSiteExplorationIntent(originalQuery)

    if (hasUrls && siteExploration) {
        return {
            intent: 'site_exploration',
            urls,
            queryWithoutUrls,
            originalQuery,
        }
    }

    if (hasUrls && hasNonUrlQuery) {
        return {
            intent: 'url_extract_with_query',
            urls,
            queryWithoutUrls,
            originalQuery,
        }
    }

    if (hasUrls) {
        return {
            intent: 'url_extract',
            urls,
            queryWithoutUrls,
            originalQuery,
        }
    }

    return {
        intent: 'query_search',
        urls: [],
        queryWithoutUrls,
        originalQuery,
    }
}

function buildFallbackSearchQuery(classified: ClassifiedWebInput): string {
    if (classified.intent === 'query_search') {
        return classified.queryWithoutUrls || classified.originalQuery
    }

    const firstUrl = classified.urls[0] || ''
    const query = classified.queryWithoutUrls || classified.originalQuery
    if (!firstUrl) return query

    try {
        const hostname = new URL(firstUrl).hostname.replace(/^www\./, '')
        if (!query || query === firstUrl) {
            return firstUrl
        }
        return `${query} site:${hostname}`
    } catch {
        return query || firstUrl
    }
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
            message: existingMessage ? `${existingMessage} ${message}` : message
        }
    }
}

function buildSnippetFromRawContent(rawContent: string): string {
    const flattened = rawContent
        .replace(/\s+/g, ' ')
        .trim()

    if (!flattened) return ''
    if (flattened.length <= EXTRACT_SNIPPET_LENGTH) return flattened
    return `${flattened.slice(0, EXTRACT_SNIPPET_LENGTH - 3)}...`
}

function inferTitleFromRawContent(rawContent: string, url: string): string {
    const candidate = rawContent
        .split('\n')
        .map(line => line.trim())
        .map(line => line.replace(/^#{1,6}\s+/, '').trim())
        .find(line => line.length >= 3 && line.length <= 140)

    if (candidate) {
        return candidate
    }

    return getDisplayedLink(url)
}

/**
 * Coerce search_depth to valid value
 */
function coerceSearchDepth(value: unknown): 'basic' | 'advanced' {
    if (value === 'advanced') return 'advanced'
    return 'basic'
}

/**
 * Coerce time_range to valid value
 */
function coerceTimeRange(value: unknown): 'day' | 'week' | 'month' | 'year' | undefined {
    if (value === 'day' || value === 'week' || value === 'month' || value === 'year') return value
    return undefined
}

/**
 * Coerce topic to valid value
 */
function coerceTopic(value: unknown): 'general' | 'news' | 'finance' | undefined {
    if (value === 'news') return 'news'
    if (value === 'finance') return 'finance'
    if (value === 'general') return 'general'
    return undefined
}

/**
 * Reformulate poor queries (long or conversational) into keyword-focused search queries.
 * Uses heuristics only - no LLM call. Keeps queries under 400 chars per Tavily best practices.
 */
function reformulateQueryIfNeeded(query: string): string {
    const trimmed = query.trim()
    if (!trimmed) return trimmed

    const CONVERSATIONAL_PREFIXES = [
        /^can you (?:please )?(?:find|search|look up|tell me|get)\s+/i,
        /^could you (?:please )?(?:find|search|look up|tell me|get)\s+/i,
        /^would you (?:please )?(?:find|search|look up|tell me|get)\s+/i,
        /^i want to know (?:about )?/i,
        /^i need to (?:find|know|search for)\s+/i,
        /^please (?:find|search|look up|tell me)\s+/i,
        /^what (?:is|are) (?:the )?(?:latest|best|current)\s+/i,
        /^tell me (?:about )?/i,
        /^search for\s+/i,
        /^look up\s+/i,
        /^find (?:out )?(?:about )?/i
    ]

    let result = trimmed

    // Strip conversational prefixes
    for (const re of CONVERSATIONAL_PREFIXES) {
        result = result.replace(re, '').trim()
    }

    // Remove trailing question marks and "?" for cleaner keywords
    result = result.replace(/\?+$/, '').trim()

    // If still over 400 chars, truncate to first 400 (Tavily recommends under 400)
    if (result.length > 400) {
        result = result.slice(0, 397) + '...'
    }

    return result || trimmed
}

/**
 * Execute web search using available API
 * Priority: Tavily (secure storage key) > duck-duck-scrape fallback
 */
export async function executeWebSearch(args: WebSearchArgs): Promise<ToolResult> {
    // Coerce num_results to number
    let num_results = args.num_results ?? 10
    if (typeof num_results === 'string') {
        const parsed = Number(num_results)
        num_results = isNaN(parsed) ? 10 : parsed
    }
    if (typeof num_results !== 'number' || num_results < 1) {
        num_results = 10
    }
    num_results = Math.min(Math.max(num_results, 1), 20)

    const search_depth = coerceSearchDepth(args.search_depth ?? 'basic')
    const time_range = coerceTimeRange(args.time_range)
    const topic = coerceTopic(args.topic)

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

    const classifiedInput = classifyWebInput(query, args.urls)
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
            })

            if (tavilyExtractResult.success) {
                return tavilyExtractResult
            }

            const fallbackQuery = reformulateQueryIfNeeded(buildFallbackSearchQuery(classifiedInput))
            const tavilySearchFallback = await searchWithTavily(
                fallbackQuery,
                num_results,
                safeTavilyKey,
                search_depth,
                time_range,
                topic
            )
            if (tavilySearchFallback.success) {
                return appendMessageToResult(
                    tavilySearchFallback,
                    'Direct URL extraction failed, so fallback search results were returned.'
                )
            }

            const ddgFallback = await searchWithDuckDuckScrape(fallbackQuery, num_results)
            if (ddgFallback.success) {
                return appendMessageToResult(
                    ddgFallback,
                    'Direct URL extraction failed, so fallback web results were returned.'
                )
            }

            return {
                success: false,
                error: `Web extraction failed. ${tavilyExtractResult.error} Search fallback also failed. Please check your internet connection and try again.`
            }
        }

        const fallbackQuery = reformulateQueryIfNeeded(buildFallbackSearchQuery(classifiedInput))
        const fallbackResult = await searchWithDuckDuckScrape(fallbackQuery, num_results)
        if (fallbackResult.success) {
            return appendMessageToResult(
                fallbackResult,
                'URL-focused extraction is available with a Tavily API key (Settings > Search APIs). Returned search results instead.'
            )
        }

        return {
            success: false,
            error: 'This request includes a specific URL. Add a Tavily API key in Settings > Search APIs to enable direct URL extraction.'
        }
    }

    // Regular search intent (no URL dominance)
    query = reformulateQueryIfNeeded(classifiedInput.queryWithoutUrls || classifiedInput.originalQuery)

    if (hasTavilyKey) {
        const tavilyResult = await searchWithTavily(query, num_results, safeTavilyKey, search_depth, time_range, topic)
        if (tavilyResult.success) {
            return tavilyResult
        }

        const fallbackResult = await searchWithDuckDuckScrape(query, num_results)
        if (fallbackResult.success) {
            return fallbackResult
        }

        return {
            success: false,
            error: `Web search failed. ${tavilyResult.error} Fallback also failed. Please check your internet connection and try again. For best results, add a valid Tavily API key in Settings > Search APIs.`
        }
    }

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

interface TavilyExtractArgs {
    urls: string[]
    query?: string
    apiKey: string
    intent: WebInputIntent
}

/**
 * Extract focused content from explicit URLs using Tavily Extract.
 * - URL only: basic extraction
 * - Query + URL: advanced extraction with reranking query/chunks
 */
async function extractWithTavily({
    urls,
    query,
    apiKey,
    intent,
}: TavilyExtractArgs): Promise<ToolResult> {
    try {
        const normalizedUrls = [...new Set(
            urls
                .map(url => normalizeUrlCandidate(url) || '')
                .filter(Boolean)
        )].slice(0, MAX_EXTRACT_URLS)

        if (normalizedUrls.length === 0) {
            return {
                success: false,
                error: 'No valid URL was found to extract from.'
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
            include_images: true,
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
                body: JSON.stringify(body)
            },
            EXTRACT_FETCH_TIMEOUT_MS
        )

        if (!response.ok) {
            const error = await response.text()
            throw new Error(`Tavily Extract API error: ${response.status} - ${error}`)
        }

        const data = await response.json()
        const rawResults = Array.isArray(data.results) ? data.results : []

        const results: SearchResult[] = rawResults
            .map((r: any) => {
                const url = typeof r?.url === 'string' ? r.url : ''
                const rawContent = typeof r?.raw_content === 'string' ? r.raw_content : ''
                return {
                    title: inferTitleFromRawContent(rawContent, url),
                    url,
                    snippet: buildSnippetFromRawContent(rawContent),
                    raw_content: rawContent || undefined,
                    favicon: typeof r?.favicon === 'string' && r.favicon.trim()
                        ? r.favicon
                        : getFaviconUrl(url),
                    source: getSourceFromUrl(url),
                    displayed_link: getDisplayedLink(url),
                }
            })
            .filter((r: SearchResult) => Boolean(r.url))

        if (results.length === 0) {
            const failures = Array.isArray(data.failed_results) ? data.failed_results : []
            const firstFailure = failures[0]?.error ? ` ${String(failures[0].error)}` : ''
            return {
                success: false,
                error: `Tavily Extract returned no extractable content.${firstFailure}`
            }
        }

        const images: ImageResult[] = []
        const imageSet = new Set<string>()

        for (const r of rawResults) {
            const sourceUrl = typeof r?.url === 'string' ? r.url : undefined
            const sourceImages = Array.isArray(r?.images) ? r.images : []
            for (const img of sourceImages) {
                const imageUrl = typeof img === 'string' ? img : (typeof img?.url === 'string' ? img.url : '')
                if (!imageUrl || imageSet.has(imageUrl)) continue
                imageSet.add(imageUrl)
                images.push({
                    url: imageUrl,
                    description: typeof img?.description === 'string'
                        ? img.description
                        : (typeof img?.alt === 'string' ? img.alt : undefined),
                    sourceUrl,
                })
            }
        }

        const failures = Array.isArray(data.failed_results) ? data.failed_results : []
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
            }
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to extract with Tavily'
        if (message.includes('abort')) {
            return {
                success: false,
                error: 'URL extraction timed out. Please try again.'
            }
        }
        return {
            success: false,
            error: message
        }
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
    searchDepth: 'basic' | 'advanced' = 'basic',
    timeRange?: 'day' | 'week' | 'month' | 'year',
    topic?: 'general' | 'news' | 'finance'
): Promise<ToolResult> {
    try {
        const body: Record<string, unknown> = {
            api_key: apiKey,
            query,
            search_depth: searchDepth,
            max_results: Math.min(numResults, 20),
            include_answer: false,
            include_raw_content: false,
            include_images: true
        }

        // Tavily best practices: advanced depth + chunks for specific queries
        if (searchDepth === 'advanced') {
            body.chunks_per_source = 3
        }

        if (timeRange) {
            body.time_range = timeRange
        }
        if (topic) {
            body.topic = topic
        }

        const response = await fetchWithTimeout(
            'https://api.tavily.com/search',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
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
async function searchWithDuckDuckScrape(query: string, numResults: number = 10): Promise<ToolResult> {
    const maxResults = Math.min(numResults, 20)

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
