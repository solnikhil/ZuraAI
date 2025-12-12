
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

export const generateGeminiCompletion = async (
    apiKey: string,
    model: string,
    messages: { role: string; content: string }[],
    options?: {
        temperature?: number
        maxOutputTokens?: number
    }
): Promise<GeminiResponse> => {
    if (!apiKey) {
        throw new Error("Gemini API Key is missing")
    }

    // Convert OpenAI-style messages to Gemini format
    // Gemini uses 'user' and 'model' roles, and 'parts' array
    const geminiContents = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }))

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

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
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
