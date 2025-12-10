
export interface PerplexityResponse {
    id: string
    model: string
    created: number
    choices: {
        index: number
        finish_reason: string
        message: {
            role: string
            content: string
        }
    }[]
    usage: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
    }
}

export const generatePerplexityCompletion = async (
    apiKey: string,
    model: string,
    messages: any[],
    options?: {
        temperature?: number
        max_tokens?: number
    }
): Promise<PerplexityResponse> => {
    if (!apiKey) {
        throw new Error("Perplexity API Key is missing")
    }

    // Build request body with only defined properties
    const requestBody: Record<string, any> = {
        model: model,
        messages: messages
    }

    // Only add optional parameters if they are defined
    if (options?.temperature !== undefined) {
        requestBody.temperature = options.temperature
    }
    if (options?.max_tokens !== undefined) {
        requestBody.max_tokens = options.max_tokens
    }

    try {
        const makeRequest = async (body: any) => {
            const res = await fetch("https://api.perplexity.ai/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            })
            return res
        }

        let response = await makeRequest(requestBody)

        // If 400 (Bad Request) or 422 (Unprocessable Entity), try stripping optional parameters
        if (!response.ok && (response.status === 400 || response.status === 422)) {
            const minimalBody = {
                model: model,
                messages: messages
            }
            response = await makeRequest(minimalBody)
        }

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

        const result = await response.json()
        return result
    } catch (error: any) {
        throw error
    }
}
