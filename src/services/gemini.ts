import { GeminiTools } from '../tools/adapters/gemini'

export interface GeminiResponse {
    candidates: {
        content: {
            parts: { text: string }[]
            role: string
        }
        finishReason: string
    }[]
    usageMetadata?: {
        promptTokenCount: number
        candidatesTokenCount: number
        totalTokenCount: number
    }
}

export interface GeminiStreamChunk {
    candidates: Array<{
        content?: {
            parts: Array<{ text?: string }>
        }
        finishReason?: string
    }>
    usageMetadata?: {
        promptTokenCount: number
        candidatesTokenCount: number
        totalTokenCount: number
    }
}

export const generateGeminiCompletion = async (
    apiKey: string,
    model: string,
    messages: { role: string; content: string }[],
    options?: {
        temperature?: number
        maxOutputTokens?: number
        tools?: GeminiTools
    }
): Promise<GeminiResponse> => {
    if (!apiKey) {
        throw new Error("Gemini API Key is missing")
    }

    // Convert OpenAI-style messages to Gemini format
    // Gemini uses 'user' and 'model' roles, and 'parts' array
    // Handle function responses specially
    const geminiContents = messages.map(msg => {
        // If message has parts already (function response), use as-is
        if ((msg as any).parts) {
            return {
                role: msg.role === 'assistant' ? 'model' : msg.role === 'function' ? 'function' : 'user',
                parts: (msg as any).parts
            }
        }
        // Regular text message
        return {
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }
    })

    // Build request body
    const requestBody: Record<string, any> = {
        contents: geminiContents
    }

    // Add generation config if options provided
    if (options) {
        requestBody.generationConfig = {}
        if (options.temperature !== undefined) {
            requestBody.generationConfig.temperature = options.temperature
        }
        if (options.maxOutputTokens !== undefined) {
            requestBody.generationConfig.maxOutputTokens = options.maxOutputTokens
        }
    }

    // Add tools if provided
    if (options?.tools) {
        requestBody.tools = [options.tools]
    }

    try {
        // Using the official REST API format with x-goog-api-key header
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey
                },
                body: JSON.stringify(requestBody)
            }
        )

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
    } catch (error: any) {
        throw error
    }
}

export async function* streamGeminiCompletion(
    apiKey: string,
    model: string,
    messages: { role: string; content: string }[],
    options?: {
        temperature?: number
        maxOutputTokens?: number
        tools?: GeminiTools
        onChunk?: (chunk: GeminiStreamChunk) => void
    }
): AsyncGenerator<GeminiStreamChunk, void, unknown> {
    if (!apiKey) {
        throw new Error("Gemini API Key is missing")
    }

    // Convert OpenAI-style messages to Gemini format
    // Handle function responses specially
    const geminiContents = messages.map(msg => {
        // If message has parts already (function response), use as-is
        if ((msg as any).parts) {
            return {
                role: msg.role === 'assistant' ? 'model' : msg.role === 'function' ? 'function' : 'user',
                parts: (msg as any).parts
            }
        }
        // Regular text message
        return {
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }
    })

    // Build request body
    const requestBody: Record<string, any> = {
        contents: geminiContents
    }

    // Add generation config if options provided
    if (options) {
        requestBody.generationConfig = {}
        if (options.temperature !== undefined) {
            requestBody.generationConfig.temperature = options.temperature
        }
        if (options.maxOutputTokens !== undefined) {
            requestBody.generationConfig.maxOutputTokens = options.maxOutputTokens
        }
    }

    // Add tools if provided
    if (options?.tools) {
        requestBody.tools = [options.tools]
    }

    try {
        // Use streamGenerateContent endpoint for streaming
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey
                },
                body: JSON.stringify(requestBody)
            }
        )

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
                    try {
                        const chunk: GeminiStreamChunk = JSON.parse(line)
                        if (options?.onChunk) {
                            options.onChunk(chunk)
                        }
                        yield chunk
                    } catch (e) {
                        // Skip invalid JSON
                        console.warn('Failed to parse Gemini chunk:', line)
                    }
                }
            }
        } finally {
            reader.releaseLock()
        }
    } catch (error: any) {
        throw error
    }
}
