// URL Fetcher Tool - Fetch and extract content from webpages

import type { ToolResult } from './types'

interface FetchUrlArgs {
    url: string
    max_length?: number
}

/**
 * Fetch content from a URL and extract readable text
 */
export async function executeFetchUrl(args: FetchUrlArgs): Promise<ToolResult> {
    const { url, max_length = 10000 } = args
    
    if (!url || typeof url !== 'string') {
        return {
            success: false,
            error: 'URL is required'
        }
    }
    
    // Validate URL
    try {
        const parsedUrl = new URL(url)
        
        // Block local/internal URLs for security
        const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]']
        if (blockedHosts.includes(parsedUrl.hostname)) {
            return {
                success: false,
                error: 'Cannot fetch local URLs for security reasons'
            }
        }
        
        // Only allow http/https
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return {
                success: false,
                error: 'Only HTTP and HTTPS URLs are supported'
            }
        }
    } catch {
        return {
            success: false,
            error: 'Invalid URL format'
        }
    }
    
    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15000) // 15 second timeout
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            signal: controller.signal
        })
        
        clearTimeout(timeout)
        
        if (!response.ok) {
            return {
                success: false,
                error: `Failed to fetch URL: ${response.status} ${response.statusText}`
            }
        }
        
        // Check content type
        const contentType = response.headers.get('content-type') || ''
        if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/json')) {
            return {
                success: false,
                error: `Unsupported content type: ${contentType}. Only HTML, plain text, and JSON are supported.`
            }
        }
        
        const html = await response.text()
        
        // Extract text content
        let text = extractTextContent(html)
        
        // Truncate if needed
        const truncated = text.length > max_length
        if (truncated) {
            text = text.slice(0, max_length)
        }
        
        // Extract title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
        const title = titleMatch ? titleMatch[1].trim() : null
        
        return {
            success: true,
            data: {
                url,
                title,
                content: text,
                contentLength: text.length,
                truncated,
                originalLength: truncated ? html.length : text.length
            }
        }
    } catch (error: any) {
        if (error.name === 'AbortError') {
            return {
                success: false,
                error: 'Request timed out after 15 seconds'
            }
        }
        
        return {
            success: false,
            error: error.message || 'Failed to fetch URL'
        }
    }
}

/**
 * Extract readable text content from HTML
 */
function extractTextContent(html: string): string {
    // Remove script and style elements
    let text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    
    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, '')
    
    // Convert some tags to line breaks
    text = text
        .replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, '\n')
        .replace(/<(br|hr)[^>]*\/?>/gi, '\n')
    
    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ')
    
    // Decode HTML entities
    text = decodeHtmlEntities(text)
    
    // Clean up whitespace
    text = text
        .replace(/\s+/g, ' ')           // Multiple spaces to single space
        .replace(/\n\s+/g, '\n')        // Remove spaces after newlines
        .replace(/\s+\n/g, '\n')        // Remove spaces before newlines
        .replace(/\n{3,}/g, '\n\n')     // Multiple newlines to double newline
        .trim()
    
    return text
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
        '&nbsp;': ' ',
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'",
        '&mdash;': '—',
        '&ndash;': '–',
        '&hellip;': '...',
        '&copy;': '©',
        '&reg;': '®',
        '&trade;': '™',
    }
    
    let decoded = text
    for (const [entity, char] of Object.entries(entities)) {
        decoded = decoded.replace(new RegExp(entity, 'gi'), char)
    }
    
    // Decode numeric entities
    decoded = decoded.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)))
    decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    
    return decoded
}

