
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
    messages: any[],
    options?: {
        temperature?: number
        num_ctx?: number
        think?: boolean | string
        tools?: any[]
        onChunk?: (chunk: OllamaStreamChunk) => void
        signal?: AbortSignal
    }
): AsyncGenerator<OllamaStreamChunk, void, unknown> {
    try {
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
                tools: options?.tools && Array.isArray(options.tools) && options.tools.length > 0 ? options.tools : undefined,
                tool_choice: options?.tools && Array.isArray(options.tools) && options.tools.length > 0 ? 'auto' : undefined,
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
                    try {
                        const chunk: OllamaStreamChunk = JSON.parse(line)
                        if (options?.onChunk) {
                            options.onChunk(chunk)
                        }
                        yield chunk
                        if (chunk.done) {
                            return
                        }
                    } catch (e) {
                        // Skip invalid JSON
                        console.warn('Failed to parse Ollama chunk:', line)
                    }
                }
            }
        } finally {
            reader.releaseLock()
        }
    } catch (error: any) {
        console.error('Ollama stream error:', error)
        throw error
    }
}

export const generateOllamaCompletion = async (
    baseUrl: string,
    model: string,
    messages: any[],
    options?: {
        temperature?: number
        num_ctx?: number // Context window size
        think?: boolean | string
        tools?: any[]
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
    })

    if (!response.ok) {
        throw new Error(`Ollama API Error: ${response.statusText}`)
    }

    return await response.json()
}
