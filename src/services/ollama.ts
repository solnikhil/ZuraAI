
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

export const generateOllamaCompletion = async (
    baseUrl: string,
    model: string,
    messages: any[],
    options?: {
        temperature?: number
        num_ctx?: number // Context window size
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
