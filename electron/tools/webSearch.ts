// Web Search Tool - Search the internet for information
// Supports multiple search providers: Tavily (recommended), SerpAPI, Brave

import type { ToolResult } from './types'

interface WebSearchArgs {
    query: string
    num_results?: number
}

interface SearchResult {
    title: string
    url: string
    snippet: string
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
    
    const { query } = args
    
    if (!query || typeof query !== 'string') {
        return {
            success: false,
            error: 'Search query is required'
        }
    }
    
    // Try to get API key from settings stored in userData
    // Check environment variable first, then try to get from settings
    const tavilyKey = process.env.TAVILY_API_KEY || (global as any).tavilyApiKey
    
    if (tavilyKey && tavilyKey.trim()) {
        return searchWithTavily(query, num_results, tavilyKey)
    }
    
    // Fallback to DuckDuckGo Instant Answer API (limited but free)
    return searchWithDuckDuckGo(query)
}

/**
 * Search using Tavily API (best for AI applications)
 * Get API key at: https://tavily.com
 */
async function searchWithTavily(query: string, numResults: number, apiKey: string): Promise<ToolResult> {
    try {
        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: apiKey,
                query,
                search_depth: 'basic',
                max_results: Math.min(numResults, 10),
                include_answer: true,
                include_raw_content: false,
                include_images: false
            })
        })
        
        if (!response.ok) {
            const error = await response.text()
            throw new Error(`Tavily API error: ${response.status} - ${error}`)
        }
        
        const data = await response.json()
        
        const results: SearchResult[] = (data.results || []).map((r: any) => ({
            title: r.title,
            url: r.url,
            snippet: r.content
        }))
        
        return {
            success: true,
            data: {
                query,
                answer: data.answer,  // Tavily provides a direct answer
                results,
                resultCount: results.length,
                source: 'tavily'
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
async function searchWithDuckDuckGo(query: string): Promise<ToolResult> {
    try {
        const encodedQuery = encodeURIComponent(query)
        const response = await fetch(
            `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`
        )
        
        if (!response.ok) {
            throw new Error(`DuckDuckGo API error: ${response.status}`)
        }
        
        const data = await response.json()
        
        const results: SearchResult[] = []
        
        // Add abstract if available
        if (data.Abstract) {
            results.push({
                title: data.Heading || query,
                url: data.AbstractURL || '',
                snippet: data.Abstract
            })
        }
        
        // Add related topics
        if (data.RelatedTopics) {
            for (const topic of data.RelatedTopics.slice(0, 5)) {
                if (topic.Text && topic.FirstURL) {
                    results.push({
                        title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 50),
                        url: topic.FirstURL,
                        snippet: topic.Text
                    })
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
                    message: 'No instant answer available. For better results, configure a Tavily API key in Settings.'
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

