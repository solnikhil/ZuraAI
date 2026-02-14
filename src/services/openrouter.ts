import { ChatMessage, ToolDefinition, parseErrorResponse, extractErrorMessage } from './types'

// OpenRouter API service with streaming support

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

export async function generateOpenRouterCompletion(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    options?: {
        temperature?: number
        maxTokens?: number
        stream?: boolean
        tools?: ToolDefinition[]
        toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
        responseFormat?: OpenRouterRequestBody['response_format']
        reasoning?: {
            max_tokens?: number
            effort?: 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none'
            exclude?: boolean
            enabled?: boolean
        }
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
    if (options?.maxTokens !== undefined) {
        requestBody.max_tokens = options.maxTokens
    }
    if (options?.stream !== undefined) {
        requestBody.stream = options.stream
    }
    if (options?.tools && Array.isArray(options.tools) && options.tools.length > 0) {
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
    if (options?.responseFormat) {
        requestBody.response_format = options.responseFormat
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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

    const result = await response.json()
    return result
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
    if (options?.tools && Array.isArray(options.tools) && options.tools.length > 0) {
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

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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

    const decoder = new TextDecoder()
    let buffer = ''

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.trim() === '') continue
                if (line.startsWith('data: ')) {
                    const data = line.slice(6)
                    if (data === '[DONE]') {
                        return
                    }
                    try {
                        const chunk: OpenRouterStreamChunk = JSON.parse(data)
                        if (options?.onChunk) {
                            options.onChunk(chunk)
                        }
                        yield chunk
                    } catch (e) {
                        // Skip invalid JSON
                        console.warn('Failed to parse chunk:', data)
                    }
                }
            }
        }
    } finally {
        reader.releaseLock()
    }
}

const SYNTHESIS_SYSTEM = `You are a research synthesizer. Given a user question and web search results, write a clear, well-structured answer. Use the research to support your response. Cite sources when relevant. Be concise but thorough.`

/**
 * Stream the synthesis of research results into a final answer.
 * Used by structured research mode (step-by-step research).
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
