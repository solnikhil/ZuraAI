import { parseNDJSONStream } from './streamUtils'
import type { ChatMessage, ToolDefinition } from './types'

export interface OllamaModel {
    name: string
    modified_at: string
    size: number
    digest: string
    details: {
        format: string
        family: string
        families: string[]
        parameter_size: string
        quantization_level: string
    }
}

export interface OllamaResponse {
    model: string
    created_at: string
    message: {
        role: string
        content: string
        thinking?: string
        images?: string[]
    }
    done: boolean
    total_duration?: number
    load_duration?: number
    prompt_eval_count?: number
    prompt_eval_duration?: number
    eval_count?: number
    eval_duration?: number
}

export const checkOllamaStatus = async (baseUrl: string): Promise<boolean> => {
    try {
        const response = await fetch(`${baseUrl}/api/tags`, { method: 'HEAD' })
        return response.ok
    } catch (error) {
        return false
    }
}

export const listOllamaModels = async (baseUrl: string): Promise<OllamaModel[]> => {
    try {
        const response = await fetch(`${baseUrl}/api/tags`)
        if (!response.ok) throw new Error('Failed to fetch models')
        const data = await response.json()
        return data.models || []
    } catch (error) {
        console.error('Error fetching Ollama models:', error)
        return []
    }
}

/** Default Ollama context length when /api/show doesn't return one */
const OLLAMA_DEFAULT_CONTEXT = 4096

/**
 * Fetch context length for a single Ollama model via /api/show.
 * Returns the context_length from model_info, or OLLAMA_DEFAULT_CONTEXT on failure.
 */
const getOllamaModelContextLength = async (
    baseUrl: string,
    modelName: string
): Promise<number> => {
    try {
        const response = await fetch(`${baseUrl}/api/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: modelName }),
        })
        if (!response.ok) return OLLAMA_DEFAULT_CONTEXT
        const data = await response.json()
        // model_info keys are like "<architecture>.context_length"
        const modelInfo = data.model_info
        if (modelInfo && typeof modelInfo === 'object') {
            for (const key of Object.keys(modelInfo)) {
                if (key.endsWith('.context_length') && typeof modelInfo[key] === 'number') {
                    return modelInfo[key]
                }
            }
        }
        return OLLAMA_DEFAULT_CONTEXT
    } catch {
        return OLLAMA_DEFAULT_CONTEXT
    }
}

/**
 * Enrich an array of basic Ollama model entries with context lengths fetched in parallel.
 */
export const enrichOllamaModelsWithContext = async (
    baseUrl: string,
    models: Array<{ code: string; displayName: string; [key: string]: unknown }>
): Promise<Array<{ code: string; displayName: string; maxContext: number; [key: string]: unknown }>> => {
    const results = await Promise.allSettled(
        models.map(m => getOllamaModelContextLength(baseUrl, m.code))
    )
    return models.map((m, i) => ({
        ...m,
        maxContext: results[i].status === 'fulfilled' ? results[i].value : OLLAMA_DEFAULT_CONTEXT,
    }))
}

export interface OllamaStreamChunk {
    model: string
    created_at: string
    message?: {
        role: string
        content: string
        thinking?: string
        tool_calls?: Array<{
            id?: string
            type?: 'function'
            function?: {
                name?: string
                arguments?: string
            }
        }>
    }
    done: boolean
    total_duration?: number
    load_duration?: number
    prompt_eval_count?: number
    prompt_eval_duration?: number
    eval_count?: number
    eval_duration?: number
}

export async function* streamOllamaCompletion(
    baseUrl: string,
    model: string,
    messages: ChatMessage[],
    options?: {
        temperature?: number
        num_ctx?: number
        think?: boolean | string
        tools?: ToolDefinition[]
        onChunk?: (chunk: OllamaStreamChunk) => void
        signal?: AbortSignal
    }
): AsyncGenerator<OllamaStreamChunk, void, unknown> {
    const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages,
            stream: true,
            think: options?.think ?? true,
            tools: options?.tools && options.tools.length > 0 ? options.tools : undefined,
            tool_choice: options?.tools && options.tools.length > 0 ? 'auto' : undefined,
            options: {
                temperature: options?.temperature,
                num_ctx: options?.num_ctx
            }
        }),
        signal: options?.signal
    })

    if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(`Ollama API Error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
        throw new Error("Failed to get response reader")
    }

    yield* parseNDJSONStream<OllamaStreamChunk>(reader, {
        onChunk: options?.onChunk,
    })
}

export const generateOllamaCompletion = async (
    baseUrl: string,
    model: string,
    messages: ChatMessage[],
    options?: {
        temperature?: number
        num_ctx?: number // Context window size
        think?: boolean | string
        tools?: ToolDefinition[]
        signal?: AbortSignal
    }
): Promise<OllamaResponse> => {
    const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages,
            stream: false, // For now, we use non-streaming
            think: options?.think ?? true,
            tools: options?.tools && Array.isArray(options.tools) && options.tools.length > 0 ? options.tools : undefined,
            tool_choice: options?.tools && Array.isArray(options.tools) && options.tools.length > 0 ? 'auto' : undefined,
            options: {
                temperature: options?.temperature,
                num_ctx: options?.num_ctx
            }
        }),
        signal: options?.signal,
    })

    if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(`Ollama API Error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    return await response.json()
}
