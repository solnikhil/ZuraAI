import { ChatMessage, ToolDefinition, parseErrorResponse, extractErrorMessage } from './types'
import { getProviderEndpoint } from '../providers'
import { streamOpenAICompatibleChat } from './openAICompatible'

/**
 * Fireworks AI API Service
 * Uses OpenAI-compatible API at https://api.fireworks.ai/inference/v1/chat/completions
 */

const FIREWORKS_CHAT_COMPLETIONS_URL =
    getProviderEndpoint('fireworks', 'chatCompletionsUrl') ??
    'https://api.fireworks.ai/inference/v1/chat/completions'

export interface FireworksResponse {
    id: string
    object: string
    created: number
    model: string
    choices: {
        index: number
        message: {
            role: string
            content: string
            tool_calls?: Array<{
                id: string
                type: 'function'
                function: {
                    name: string
                    arguments: string
                }
            }>
        }
        finish_reason: string
    }[]
    usage: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
        prompt_tokens_details?: {
            cached_tokens?: number
        }
    }
}

export interface FireworksStreamChunk {
    id: string
    object: string
    created: number
    model: string
    choices: Array<{
        index: number
        delta?: {
            content?: string
            role?: string
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
        prompt_tokens_details?: {
            cached_tokens?: number
        }
    }
}

interface FireworksRequestBody {
    model: string
    messages: ChatMessage[]
    stream?: boolean
    temperature?: number
    max_tokens?: number
    tools?: ToolDefinition[]
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
}

export async function* streamFireworksCompletion(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    options?: {
        temperature?: number
        max_tokens?: number
        tools?: ToolDefinition[]
        toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
        onChunk?: (chunk: FireworksStreamChunk) => void
        extraHeaders?: Record<string, string>
        signal?: AbortSignal
    }
): AsyncGenerator<FireworksStreamChunk, void, unknown> {
    if (!apiKey) {
        throw new Error("Fireworks API Key is missing")
    }

    const requestBody: FireworksRequestBody = {
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
    if (options?.tools && options.tools.length > 0) {
        requestBody.tools = options.tools
        requestBody.tool_choice = options.toolChoice || 'auto'
    }

    yield* streamOpenAICompatibleChat<FireworksStreamChunk>({
        url: FIREWORKS_CHAT_COMPLETIONS_URL,
        apiKey,
        providerName: 'Fireworks',
        body: requestBody,
        signal: options?.signal,
        headers: options?.extraHeaders,
        onChunk: options?.onChunk,
    })
}

export const generateFireworksCompletion = async (
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    options?: {
        temperature?: number
        max_tokens?: number
        tools?: ToolDefinition[]
        toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
        signal?: AbortSignal
    }
): Promise<FireworksResponse> => {
    if (!apiKey) {
        throw new Error("Fireworks API Key is missing")
    }

    const requestBody: FireworksRequestBody = {
        model: model,
        messages: messages
    }

    if (options?.temperature !== undefined) {
        requestBody.temperature = options.temperature
    }
    if (options?.max_tokens !== undefined) {
        requestBody.max_tokens = options.max_tokens
    }
    if (options?.tools && options.tools.length > 0) {
        requestBody.tools = options.tools
        requestBody.tool_choice = options.toolChoice || 'auto'
    }

    const response = await fetch(FIREWORKS_CHAT_COMPLETIONS_URL, {
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

    return await response.json() as FireworksResponse
}
