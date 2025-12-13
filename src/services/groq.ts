/**
 * Groq API Service
 * Uses OpenAI-compatible API at https://api.groq.com/openai/v1/chat/completions
 */

export interface GroqResponse {
    id: string
    object: string
    created: number
    model: string
    choices: {
        index: number
        message: {
            role: string
            content: string
        }
        finish_reason: string
    }[]
    usage: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
    }
}

export const generateGroqCompletion = async (
    apiKey: string,
    model: string,
    messages: any[],
    options?: {
        temperature?: number
        max_tokens?: number
    }
): Promise<GroqResponse> => {
    if (!apiKey) {
        throw new Error("Groq API Key is missing")
    }

    // Build request body
    const requestBody: Record<string, any> = {
        model: model,
        messages: messages
    }

    // Add optional parameters if defined
    if (options?.temperature !== undefined) {
        requestBody.temperature = options.temperature
    }
    if (options?.max_tokens !== undefined) {
        requestBody.max_completion_tokens = options.max_tokens
    }

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
            const errorMessage = errorData.error?.message || errorData.detail || errorText || `HTTP ${response.status}: ${response.statusText}`
            throw new Error(errorMessage)
        }

        const result: GroqResponse = await response.json()
        return result
    } catch (error: any) {
        throw error
    }
}
