import {
    ChatMessage,
    ReasoningDetail,
    ServiceToolCall,
    ToolDefinition,
    parseErrorResponse,
    extractErrorMessage
} from './types'
import { parseSSEStream } from './streamUtils'
import { getProviderEndpoint, getProviderRetryPolicy } from '../providers'

// OpenRouter API service with streaming support

const OPENROUTER_CHAT_COMPLETIONS_URL =
    getProviderEndpoint('openrouter', 'chatCompletionsUrl') ??
    'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_RETRY_POLICY = getProviderRetryPolicy('openrouter')

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
    return OPENROUTER_RETRY_POLICY.initialBackoffMs * Math.pow(OPENROUTER_RETRY_POLICY.backoffMultiplier, attempt)
}

/** Sleep helper */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export interface OpenRouterStreamChunk {
    id: string
    model?: string
    choices: Array<{
        delta?: {
            content?: string
            role?: string
            images?: Array<{
                type?: string
                image_url?: {
                    url?: string
                }
            }>
            reasoning?: string
            reasoning_details?: ReasoningDetail[]
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
    model?: string
    choices: Array<{
        message: {
            role: string
            content: string
            images?: Array<{
                type?: string
                image_url?: {
                    url?: string
                }
            }>
            reasoning?: string
            reasoning_details?: ReasoningDetail[]
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
    modalities?: Array<'text' | 'image'>
    image_config?: {
        aspect_ratio?: string
        image_size?: string
    }
    temperature?: number
    max_completion_tokens?: number
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

type OpenRouterDeltaToolCall = NonNullable<
    NonNullable<OpenRouterStreamChunk['choices'][number]['delta']>['tool_calls']
>[number]

function summarizeChunkToolCalls(
    toolCalls: OpenRouterDeltaToolCall[] | undefined
): Array<{ index?: number; id?: string; name?: string; argumentsPreview: string }> {
  return (toolCalls || []).map((toolCall) => ({
    index: toolCall?.index,
    id: toolCall?.id,
    name: toolCall?.function?.name,
    argumentsPreview: (toolCall?.function?.arguments || '').slice(0, 120),
  }))
}

function logOpenRouterDebug(enabled: boolean | undefined, event: string, details?: Record<string, unknown>): void {
    if (!enabled) return
    console.debug('[openrouter-debug]', event, details || {})
}

function summarizeMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
    return messages.map((message, index) => {
        const rawContent =
            typeof message.content === 'string'
                ? message.content
                : Array.isArray(message.content)
                    ? message.content
                        .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : '[non-text]'))
                        .join(' ')
                    : ''
        const content = rawContent.trim()

        return {
            index,
            role: message.role,
            contentLength: content.length,
            contentPreview: content.slice(0, 160),
            hasToolCalls: Array.isArray((message as ChatMessage & { tool_calls?: ServiceToolCall[] }).tool_calls)
                ? ((message as ChatMessage & { tool_calls?: ServiceToolCall[] }).tool_calls?.length || 0) > 0
                : false,
        }
    })
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
        modalities?: Array<'text' | 'image'>
        imageConfig?: {
            aspect_ratio?: string
            image_size?: string
        }
        reasoning?: {
            max_tokens?: number
            effort?: 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none'
            exclude?: boolean
            enabled?: boolean
        }
        debug?: boolean
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
    if (options?.modalities?.length) {
        requestBody.modalities = options.modalities
    }
    if (options?.imageConfig) {
        requestBody.image_config = options.imageConfig
    }
    if (options?.maxTokens !== undefined) {
        requestBody.max_completion_tokens = options.maxTokens
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
    logOpenRouterDebug(options?.debug, 'request.start', {
        model,
        messageCount: messages.length,
        messages: summarizeMessages(messages),
        toolCount: options?.tools?.length || 0,
        toolChoice: options?.toolChoice || 'provider-default',
        modalities: options?.modalities,
        reasoning: options?.reasoning,
        imageConfig: options?.imageConfig,
    })

    // Retry loop for the initial HTTP request (before streaming starts)
    let response: Response | null = null
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= OPENROUTER_RETRY_POLICY.maxRetries; attempt++) {
        if (attempt > 0) {
            const delay = getRetryDelay(attempt - 1, lastError?.message)
            console.log(`[ZuraAI] OpenRouter stream retry ${attempt}/${OPENROUTER_RETRY_POLICY.maxRetries} after ${delay}ms`)
            await sleep(delay)
        }

        response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
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

        if (
            OPENROUTER_RETRY_POLICY.retryableStatusCodes.includes(response.status) &&
            attempt < OPENROUTER_RETRY_POLICY.maxRetries
        ) {
            console.warn(`[ZuraAI] OpenRouter stream ${response.status} (attempt ${attempt + 1}): ${errorMessage}`)
            lastError = new Error(errorText)
            continue
        }

        throw new Error(`[${response.status}] ${errorMessage}`)
    }

    logOpenRouterDebug(options?.debug, 'request.connected', {
        model,
        status: response?.status,
        contentType: response?.headers.get('content-type') || '',
    })

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
            const chunk = parsed as OpenRouterStreamChunk & {
                error?: {
                    message?: string
                    code?: string
                    metadata?: {
                        provider_name?: string
                        raw?: string
                    }
                }
            }
            logOpenRouterDebug(options?.debug, 'stream.chunk', {
                id: chunk?.id,
                model: chunk?.model,
                finishReason: chunk?.choices?.[0]?.finish_reason || null,
                contentLength: chunk?.choices?.[0]?.delta?.content?.length || 0,
                contentPreview: (chunk?.choices?.[0]?.delta?.content || '').slice(0, 120),
                reasoningLength:
                    chunk?.choices?.[0]?.delta?.reasoning?.length ||
                    chunk?.choices?.[0]?.delta?.reasoning_details?.length ||
                    0,
                toolCalls: summarizeChunkToolCalls(chunk?.choices?.[0]?.delta?.tool_calls),
                usage: chunk?.usage,
            })
            // OpenRouter can send error objects inside the SSE stream
            // when the upstream provider fails mid-generation
            if (chunk.error) {
                const errorMsg = chunk.error.message || 'Stream error from provider'
                const code = chunk.error.code || 'unknown'
                const provider = chunk.error.metadata?.provider_name || ''
                const raw = chunk.error.metadata?.raw || ''
                const detail = provider ? ` (provider: ${provider})` : ''
                const rawDetail = raw && raw !== errorMsg ? ` - ${String(raw).slice(0, 200)}` : ''
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
        signal?: AbortSignal
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
        requestBody.max_completion_tokens = options.max_tokens
    }

    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
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

    if (!response.ok) {
        const errorText = await response.text()
        const errorData = parseErrorResponse(errorText)
        throw new Error(extractErrorMessage(errorData, errorText, response.status, response.statusText))
    }

    return response.json()
}


