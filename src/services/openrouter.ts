import { ChatMessage, ToolDefinition, parseErrorResponse, extractErrorMessage } from './types'
import { parseSSEStream } from './streamUtils'

// OpenRouter API service with streaming support

// Retry configuration for transient errors (429, 502, 503, 529)
const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 1500
const BACKOFF_MULTIPLIER = 2
const RETRYABLE_STATUS_CODES = [429, 502, 503, 529]

/**
 * Parse retry delay from OpenRouter error response or use exponential backoff.
 * OpenRouter 429 responses may include metadata.retry_after (seconds).
 */
function getRetryDelay(attempt: number, errorBody?: string): number {
    if (errorBody) {
        try {
            const parsed = JSON.parse(errorBody)
            const retryAfter = parsed?.error?.metadata?.retry_after
            if (typeof retryAfter === 'number' && retryAfter > 0) {
                return Math.min(retryAfter * 1000, 30000) // Cap at 30s, convert to ms
            }
        } catch { /* ignore parse errors */ }
    }
    return INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, attempt)
}

/** Sleep helper */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export interface OpenRouterStreamChunk {
    id: string
    choices: Array<{
        delta?: {
            content?: string
            role?: string
            reasoning?: string
            reasoning_details?: Array<{
                id: string | null
                format: string
                index?: number
                type?: 'summary' | 'encrypted' | 'text'
                [key: string]: any
            }>
            tool_calls?: Array<{
                index?: number
                id?: string
                type?: 'function'
                function?: {
                    name?: string
                    arguments?: string
                }
            }>
        }
        finish_reason?: string | null
    }>
    usage?: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
        prompt_cache_tokens?: number
        completion_cache_tokens?: number
        completion_tokens_details?: {
            reasoning_tokens?: number
            accepted_prediction_tokens?: number
            rejected_prediction_tokens?: number
        }
        reasoning_tokens?: number // Some providers return this directly
    }
}

export interface OpenRouterResponse {
    id: string
    choices: Array<{
        message: {
            role: string
            content: string
            reasoning?: string
            reasoning_details?: Array<{
                id: string | null
                format: string
                index?: number
                type?: 'summary' | 'encrypted' | 'text'
                [key: string]: any
            }>
            tool_calls?: Array<{
                id: string
                type: string
                function: {
                    name: string
                    arguments: string
                }
            }>
        }
        finish_reason: string | null
    }>
    usage?: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
        completion_tokens_details?: {
            reasoning_tokens?: number
            accepted_prediction_tokens?: number
            rejected_prediction_tokens?: number
        }
        reasoning_tokens?: number // Some providers return this directly
    }
}

interface OpenRouterRequestBody {
    model: string
    messages: ChatMessage[]
    stream?: boolean
    temperature?: number
    max_tokens?: number
    tools?: ToolDefinition[]
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
    response_format?: {
        type: 'json_schema'
        json_schema: {
            name: string
            strict?: boolean
            schema: Record<string, unknown>
        }
    }
    reasoning?: {
        max_tokens?: number
        effort?: 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none'
        exclude?: boolean
        enabled?: boolean
    }
}

export async function* streamOpenRouterCompletion(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    options?: {
        temperature?: number
        maxTokens?: number
        tools?: ToolDefinition[]
        toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
        onChunk?: (chunk: OpenRouterStreamChunk) => void
        reasoning?: {
            max_tokens?: number
            effort?: 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none'
            exclude?: boolean
            enabled?: boolean
        }
        signal?: AbortSignal
    }
): AsyncGenerator<OpenRouterStreamChunk, void, unknown> {
    if (!apiKey) {
        throw new Error("OpenRouter API Key is missing")
    }

    const requestBody: OpenRouterRequestBody = {
        model,
        messages,
        stream: true
    }

    if (options?.temperature !== undefined) {
        requestBody.temperature = options.temperature
    }
    if (options?.maxTokens !== undefined) {
        requestBody.max_tokens = options.maxTokens
    }
    if (options?.tools && options.tools.length > 0) {
        requestBody.tools = options.tools
        // Only set tool_choice if explicitly provided - let OpenRouter use provider defaults otherwise
        // Some providers don't support 'auto', so we only set it when explicitly requested
        if (options.toolChoice !== undefined) {
            requestBody.tool_choice = options.toolChoice
        }
    }
    if (options?.reasoning) {
        requestBody.reasoning = options.reasoning
    }

    // Retry loop for the initial HTTP request (before streaming starts)
    let response: Response | null = null
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
            const delay = getRetryDelay(attempt - 1, lastError?.message)
            console.log(`[ZuraAI] OpenRouter stream retry ${attempt}/${MAX_RETRIES} after ${delay}ms`)
            await sleep(delay)
        }

        response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://zuraai.in",
                "X-Title": "ZuraAI"
            },
            body: JSON.stringify(requestBody),
            signal: options?.signal
        })

        if (response.ok) break // Success, proceed to streaming

        const errorText = await response.text()
        const errorData = parseErrorResponse(errorText)
        const errorMessage = extractErrorMessage(errorData, errorText, response.status, response.statusText)

        if (RETRYABLE_STATUS_CODES.includes(response.status) && attempt < MAX_RETRIES) {
            console.warn(`[ZuraAI] OpenRouter stream ${response.status} (attempt ${attempt + 1}): ${errorMessage}`)
            lastError = new Error(errorText)
            continue
        }

        throw new Error(`[${response.status}] ${errorMessage}`)
    }

    if (!response || !response.ok) {
        throw lastError || new Error('OpenRouter stream request failed after retries')
    }

    const reader = response.body?.getReader()
    if (!reader) {
        throw new Error("Failed to get response reader")
    }

    yield* parseSSEStream<OpenRouterStreamChunk>(reader, {
        onChunk: options?.onChunk,
        providerName: 'OpenRouter',
        onParsed(parsed: unknown) {
            const chunk = parsed as any
            // OpenRouter can send error objects inside the SSE stream
            // when the upstream provider fails mid-generation
            if (chunk.error) {
                const errorMsg = chunk.error.message || 'Stream error from provider'
                const code = chunk.error.code || 'unknown'
                const provider = chunk.error.metadata?.provider_name || ''
                const raw = chunk.error.metadata?.raw || ''
                const detail = provider ? ` (provider: ${provider})` : ''
                const rawDetail = raw && raw !== errorMsg ? ` — ${String(raw).slice(0, 200)}` : ''
                throw new Error(`${code} ${errorMsg}${detail}${rawDetail}`)
            }
            return chunk as OpenRouterStreamChunk
        }
    })
}

/**
 * Non-streaming OpenRouter completion (used for lightweight calls like title generation).
 */
export async function generateOpenRouterCompletion(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    options?: {
        temperature?: number
        max_tokens?: number
    }
): Promise<OpenRouterResponse> {
    if (!apiKey) {
        throw new Error("OpenRouter API Key is missing")
    }

    const requestBody: OpenRouterRequestBody = {
        model,
        messages,
    }
    if (options?.temperature !== undefined) {
        requestBody.temperature = options.temperature
    }
    if (options?.max_tokens !== undefined) {
        requestBody.max_tokens = options.max_tokens
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://zuraai.in",
            "X-Title": "ZuraAI"
        },
        body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
        const errorText = await response.text()
        const errorData = parseErrorResponse(errorText)
        throw new Error(extractErrorMessage(errorData, errorText, response.status, response.statusText))
    }

    return response.json()
}

const SYNTHESIS_SYSTEM = `You are a research synthesizer. Given a user question and web search results, write a clear, well-structured answer. Use the research to support your response. Cite sources when relevant. Be concise but thorough.`

/**
 * Stream the synthesis of research results into a final answer.
 * Used when a research-heavy response needs a final synthesis pass.
 */
export async function* streamResearchSynthesis(
    apiKey: string,
    model: string,
    userQuestion: string,
    researchResults: string,
    options?: {
        temperature?: number
        maxTokens?: number
        signal?: AbortSignal
    }
): AsyncGenerator<OpenRouterStreamChunk, void, unknown> {
    if (!apiKey) {
        throw new Error("OpenRouter API Key is missing")
    }

    const messages: ChatMessage[] = [
        { role: 'system', content: SYNTHESIS_SYSTEM },
        { role: 'user', content: `User question: ${userQuestion}\n\nResearch results:\n${researchResults}\n\nPlease synthesize a clear answer based on the research above.` }
    ]

    yield* streamOpenRouterCompletion(apiKey, model, messages, {
        temperature: options?.temperature ?? 0.5,
        maxTokens: options?.maxTokens ?? 8000,
        signal: options?.signal
    })
}
