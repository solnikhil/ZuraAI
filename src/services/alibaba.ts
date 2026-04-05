import { ChatMessage, ToolDefinition, parseErrorResponse, extractErrorMessage } from './types'
import { parseSSEStream } from './streamUtils'
import { getProviderEndpoint } from '../providers'

/**
 * Alibaba Cloud DashScope API Service
 * Uses OpenAI-compatible API at https://dashscope-intl.aliyuncs.com/compatible-mode/v1
 * Supports Qwen models (qwen-plus, qwen-max, qwen-flash, qwen-turbo, etc.)
 */

const ALIBABA_BASE_URL =
    getProviderEndpoint('alibaba', 'baseUrl') ??
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'

export interface AlibabaResponse {
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
    }
}

export interface AlibabaStreamChunk {
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
    }
}

interface AlibabaRequestBody {
    model: string
    messages: ChatMessage[]
    stream?: boolean
    stream_options?: { include_usage?: boolean }
    temperature?: number
    max_tokens?: number
    tools?: ToolDefinition[]
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
}

export async function* streamAlibabaCompletion(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    options?: {
        temperature?: number
        max_tokens?: number
        tools?: ToolDefinition[]
        toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
        onChunk?: (chunk: AlibabaStreamChunk) => void
        signal?: AbortSignal
    }
): AsyncGenerator<AlibabaStreamChunk, void, unknown> {
    if (!apiKey) {
        throw new Error("Alibaba API Key is missing")
    }

    const requestBody: AlibabaRequestBody = {
        model,
        messages,
        stream: true,
        stream_options: { include_usage: true }
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

    const response = await fetch(`${ALIBABA_BASE_URL}/chat/completions`, {
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

    yield* parseSSEStream<AlibabaStreamChunk>(reader, {
        onChunk: options?.onChunk,
        providerName: 'Alibaba'
    })
}

export const generateAlibabaCompletion = async (
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
): Promise<AlibabaResponse> => {
    if (!apiKey) {
        throw new Error("Alibaba API Key is missing")
    }

    const requestBody: AlibabaRequestBody = {
        model,
        messages
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

    const response = await fetch(`${ALIBABA_BASE_URL}/chat/completions`, {
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

    const result = await response.json() as AlibabaResponse
    return result
}
