// OpenRouter API service with streaming support

export interface OpenRouterStreamChunk {
    id: string
    choices: Array<{
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
        prompt_cache_tokens?: number
        completion_cache_tokens?: number
    }
}

export interface OpenRouterResponse {
    id: string
    choices: Array<{
        message: {
            role: string
            content: string
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
    }
}

export async function generateOpenRouterCompletion(
    apiKey: string,
    model: string,
    messages: { role: string; content: string | any[] }[],
    options?: {
        temperature?: number
        maxTokens?: number
        stream?: boolean
        tools?: any[]
    }
): Promise<OpenRouterResponse> {
    if (!apiKey) {
        throw new Error("OpenRouter API Key is missing")
    }

    const requestBody: any = {
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
        requestBody.tool_choice = 'auto'
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
        const errorText = await response.text()
        let errorData: any = {}
        try {
            errorData = JSON.parse(errorText)
        } catch {
            // Not JSON
        }
        const errorMessage = errorData.error?.message || errorText || `HTTP ${response.status}: ${response.statusText}`
        throw new Error(errorMessage)
    }

    const result = await response.json()
    return result
}

export async function* streamOpenRouterCompletion(
    apiKey: string,
    model: string,
    messages: { role: string; content: string | any[] }[],
    options?: {
        temperature?: number
        maxTokens?: number
        tools?: any[]
        onChunk?: (chunk: OpenRouterStreamChunk) => void
    }
): AsyncGenerator<OpenRouterStreamChunk, void, unknown> {
    if (!apiKey) {
        throw new Error("OpenRouter API Key is missing")
    }

    const requestBody: any = {
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
        requestBody.tool_choice = 'auto'
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
        const errorText = await response.text()
        let errorData: any = {}
        try {
            errorData = JSON.parse(errorText)
        } catch {
            // Not JSON
        }
        const errorMessage = errorData.error?.message || errorText || `HTTP ${response.status}: ${response.statusText}`
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

