// Web Search Tool - Search the internet for information
// Supports multiple search providers: Tavily (recommended), SerpAPI, Brave

import type { ToolResult } from './types'
import { getSecureValueAsync } from '../secureStorage'

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
    // LobeHub-compatible metadata fields
    source?: string // Domain name (e.g., "example.com")
    displayed_link?: string // Display-friendly link (e.g., "example.com › path")
    date?: string // Publication date if available
}

interface ImageResult {
    url: string
    description?: string
}

/**
 * Execute web search using available API
 * Priority: Tavily > DuckDuckGo (fallback, no key needed)
 */
export async function executeWebSearch(args: WebSearchArgs): Promise<ToolResult> {
    // Coerce num_results to number if it's a string
    let num_results = args.num_results ?? 5
    if (typeof num_results === 'string') {
        const parsed = Number(num_results)
        num_results = isNaN(parsed) ? 5 : parsed
    }
    if (typeof num_results !== 'number' || num_results < 1) {
        num_results = 5
    }

    const { query, search_depth = 'basic' } = args

    if (!query || typeof query !== 'string') {
        return {
            success: false,
            error: 'Search query is required'
        }
    }

    // Use the query as-is - don't append date automatically
    // The model can add specific dates if needed (e.g., "2025", "January 2025")
    const enhancedQuery = query

    // Try to get API key from environment or secure storage
    const tavilyKey = process.env.TAVILY_API_KEY || await getSecureValueAsync('tavilyApiKey')

    if (tavilyKey && tavilyKey.trim()) {
        return searchWithTavily(enhancedQuery, num_results, tavilyKey, search_depth)
    }

    // Fallback to DuckDuckGo Instant Answer API (limited but free)
    return searchWithDuckDuckGo(enhancedQuery, num_results)
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
 * Example: "example.com › path › to › page"
 */
function getDisplayedLink(url: string): string {
    try {
        const urlObj = new URL(url)
        const hostname = urlObj.hostname.replace(/^www\./, '')
        const pathname = urlObj.pathname
        
        if (pathname === '/' || !pathname) {
            return hostname
        }
        
        // Clean up pathname and create display-friendly version
        const pathParts = pathname
            .split('/')
            .filter(part => part && part !== 'index.html' && part !== 'index')
            .slice(0, 2) // Limit to 2 path segments for readability
        
        if (pathParts.length === 0) {
            return hostname
        }
        
        return `${hostname} › ${pathParts.join(' › ')}`
    } catch {
        return url
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
        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: apiKey,
                query,
                search_depth: searchDepth,
                max_results: Math.min(numResults, 10),
                include_answer: true,
                include_raw_content: false,
                include_images: true
            })
        })

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

        // Parse image results from Tavily response
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
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to search with Tavily'
        }
    }
}

/**
 * Fallback search using DuckDuckGo Instant Answer API
 * Limited functionality but doesn't require API key
 */
async function searchWithDuckDuckGo(query: string, numResults: number = 5): Promise<ToolResult> {
    try {
        const encodedQuery = encodeURIComponent(query)
        const response = await fetch(
            `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1&pretty=1`
        )
        
        if (!response.ok) {
            throw new Error(`DuckDuckGo API error: ${response.status}`)
        }
        
        const data = await response.json()
        
        const results: SearchResult[] = []
        const seenUrls = new Set<string>()
        const maxResults = Math.min(numResults, 10) // Cap at 10 like Tavily
        
        // Helper to add result with deduplication and metadata
        const addResult = (title: string, url: string, snippet: string) => {
            if (!url || seenUrls.has(url) || results.length >= maxResults) {
                return
            }
            seenUrls.add(url)
            results.push({
                title: title || url,
                url,
                snippet: snippet || '',
                favicon: getFaviconUrl(url),
                source: getSourceFromUrl(url),
                displayed_link: getDisplayedLink(url)
            })
        }
        
        // Add abstract if available (prioritize it)
        if (data.Abstract && data.AbstractURL) {
            addResult(data.Heading || query, data.AbstractURL, data.Abstract)
        }
        
        // Add related topics (web results) - prioritize those with FirstURL
        if (data.RelatedTopics) {
            for (const topic of data.RelatedTopics) {
                if (results.length >= maxResults) break
                // Skip if it's not a web result topic (has no FirstURL)
                if (!topic.FirstURL) continue
                if (topic.Text) {
                    const title = topic.Text.split(' - ')[0] || topic.Text.slice(0, 80)
                    addResult(title, topic.FirstURL, topic.Text)
                }
            }
        }
        
        // Add results from data.Results if available
        if (data.Results && data.Results.length > 0) {
            for (const result of data.Results) {
                if (results.length >= maxResults) break
                if (result.FirstURL) {
                    addResult(result.Text || result.FirstURL, result.FirstURL, result.Text || '')
                }
            }
        }
        
        if (results.length === 0) {
            return {
                success: true,
                data: {
                    query,
                    answer: null,
                    results: [],
                    resultCount: 0,
                    source: 'duckduckgo',
                    message: 'No results found. Try a different search query.'
                }
            }
        }
        
        return {
            success: true,
            data: {
                query,
                answer: data.Abstract || null,
                results,
                resultCount: results.length,
                source: 'duckduckgo'
            }
        }
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to search with DuckDuckGo'
        }
    }
}

