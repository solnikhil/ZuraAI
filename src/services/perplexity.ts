import { ChatMessage, parseErrorResponse, extractErrorMessage } from './types'
import { parseSSEStream } from './streamUtils'

/**
 * Citation/search result from Perplexity API
 */
export interface PerplexityCitation {
    title?: string
    url: string
    date?: string
}

export interface PerplexityResponse {
    id: string
    model: string
    created: number
    choices: {
        index: number
        finish_reason: string
        message: {
            role: string
            content: string
        }
    }[]
    usage: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
    }
    // Perplexity returns citations as an array of URLs
    citations?: string[]
    // Or as search_results with more details
    search_results?: PerplexityCitation[]
}

/**
 * Cleans Sonar model responses by removing XML citation markup
 * and converting citation markers to clickable links
 */
export function cleanSonarResponse(content: string, citations?: string[], searchResults?: PerplexityCitation[]): string {
    if (!content) return content
    
    // Remove <grok:richcontent> tags and their contents (citation markers)
    // Pattern: <grok:richcontent id="N" type="render_inline_citation"> <argument name="citation_id">N</argument> </grok:richcontent>
    let cleaned = content.replace(/<grok:richcontent[^>]*>[\s\S]*?<\/grok:richcontent>/gi, '')
    
    // Also remove any standalone grok tags that might be malformed
    cleaned = cleaned.replace(/<\/?grok:[^>]*>/gi, '')
    
    // Build citation URL map from either citations array or search_results
    const citationUrls: Map<number, { url: string; title?: string }> = new Map()
    
    if (citations && citations.length > 0) {
        citations.forEach((url, index) => {
            citationUrls.set(index + 1, { url, title: undefined })
        })
    } else if (searchResults && searchResults.length > 0) {
        searchResults.forEach((result, index) => {
            citationUrls.set(index + 1, { url: result.url, title: result.title })
        })
    }
    
    // Convert citation markers [1], [2], etc. to inline clickable links
    if (citationUrls.size > 0) {
        // Replace [1], [2], etc. with clickable markdown links [[1]](url)
        cleaned = cleaned.replace(/\[(\d+)\]/g, (match, numStr) => {
            const num = parseInt(numStr, 10)
            const citation = citationUrls.get(num)
            if (citation) {
                // Create inline clickable citation link
                return `[[${num}]](${citation.url})`
            }
            return match // Keep original if no citation found
        })
    } else {
        // No citations available - just remove the markers to clean up
        cleaned = cleaned.replace(/\[\d+\]/g, '')
    }
    
    // Clean up multiple consecutive spaces that might result from tag removal
    cleaned = cleaned.replace(/  +/g, ' ')
    
    // Clean up multiple consecutive newlines (more than 2)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
    
    return cleaned.trim()
}



export interface PerplexityStreamChunk {
    id: string
    model: string
    created: number
    choices: Array<{
        index: number
        delta?: {
            content?: string
            role?: string
        }
        finish_reason?: string | null
    }>
    usage?: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
    }
}

interface PerplexityRequestBody {
    model: string
    messages: ChatMessage[]
    stream?: boolean
    temperature?: number
    max_tokens?: number
}

export async function* streamPerplexityCompletion(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    options?: {
        temperature?: number
        max_tokens?: number
        onChunk?: (chunk: PerplexityStreamChunk) => void
        signal?: AbortSignal
    }
): AsyncGenerator<PerplexityStreamChunk, void, unknown> {
    if (!apiKey) {
        throw new Error("Perplexity API Key is missing")
    }

    const requestBody: PerplexityRequestBody = {
        model,
        messages,
        stream: true
    }

    if (options?.temperature !== undefined) {
        requestBody.temperature = options.temperature
    }
    if (options?.max_tokens !== undefined) {
        requestBody.max_tokens = options.max_tokens
    }

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: options?.signal
    })

    if (!response.ok) {
        const errorText = await response.text()
        const errorData = parseErrorResponse(errorText)
        const errorMessage = extractErrorMessage(errorData, errorText, response.status, response.statusText)
        throw new Error(errorMessage)
    }

    const reader = response.body?.getReader()
    if (!reader) {
        throw new Error("Failed to get response reader")
    }

    yield* parseSSEStream<PerplexityStreamChunk>(reader, {
        onChunk: options?.onChunk,
        providerName: 'Perplexity'
    })
}

export const generatePerplexityCompletion = async (
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    options?: {
        temperature?: number
        max_tokens?: number
    }
): Promise<PerplexityResponse> => {
    if (!apiKey) {
        throw new Error("Perplexity API Key is missing")
    }

    // Build request body with only defined properties
    const requestBody: PerplexityRequestBody = {
        model: model,
        messages: messages
    }

    // Only add optional parameters if they are defined
    if (options?.temperature !== undefined) {
        requestBody.temperature = options.temperature
    }
    if (options?.max_tokens !== undefined) {
        requestBody.max_tokens = options.max_tokens
    }

    const makeRequest = async (body: PerplexityRequestBody) => {
            const res = await fetch("https://api.perplexity.ai/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            })
            return res
        }

        let response = await makeRequest(requestBody)

        // If 400 (Bad Request) or 422 (Unprocessable Entity), try stripping optional parameters
        if (!response.ok && (response.status === 400 || response.status === 422)) {
            const minimalBody: PerplexityRequestBody = {
                model: model,
                messages: messages
            }
            response = await makeRequest(minimalBody)
        }

        if (!response.ok) {
            const errorText = await response.text()
            const errorData = parseErrorResponse(errorText)
            const errorMessage = extractErrorMessage(errorData, errorText, response.status, response.statusText)
            throw new Error(errorMessage)
        }

        const result: PerplexityResponse = await response.json()
        
        // Clean the response content and process citations
        if (result.choices && result.choices[0]?.message?.content) {
            result.choices[0].message.content = cleanSonarResponse(
                result.choices[0].message.content,
                result.citations,
                result.search_results
            )
        }
        
        return result
}
