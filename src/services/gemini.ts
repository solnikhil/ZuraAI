import { GeminiTools } from '../tools/adapters/gemini'

/**
 * Gemini API Safety Category
 */
export type GeminiSafetyCategory = 
    | 'HARM_CATEGORY_HARASSMENT'
    | 'HARM_CATEGORY_HATE_SPEECH'
    | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
    | 'HARM_CATEGORY_DANGEROUS_CONTENT'

/**
 * Gemini API Safety Threshold
 */
export type GeminiSafetyThreshold = 
    | 'BLOCK_NONE'
    | 'BLOCK_ONLY_HIGH'
    | 'BLOCK_MEDIUM_AND_ABOVE'
    | 'BLOCK_LOW_AND_ABOVE'

/**
 * Gemini API Safety Setting
 */
export interface GeminiSafetySetting {
    category: GeminiSafetyCategory
    threshold: GeminiSafetyThreshold
}

/**
 * Gemini API Generation Config
 */
export interface GeminiGenerationConfig {
    temperature?: number
    topP?: number
    topK?: number
    maxOutputTokens?: number
    candidateCount?: number
    stopSequences?: string[]
    responseMimeType?: string
    responseSchema?: {
        type: 'object'
        properties: Record<string, any>
        required?: string[]
    }
}

/**
 * Gemini API Grounding Config
 */
export interface GeminiGroundingConfig {
    googleSearchRetrieval?: {
        dynamicRetrievalConfig?: {
            mode?: 'MODE_DYNAMIC' | 'MODE_STATIC'
            dynamicThreshold?: number
        }
    }
}

/**
 * Gemini API Request Options
 */
export interface GeminiRequestOptions {
    // Generation config
    temperature?: number
    maxOutputTokens?: number
    topP?: number
    topK?: number
    candidateCount?: number
    stopSequences?: string[]
    
    // Advanced generation config
    generationConfig?: GeminiGenerationConfig
    
    // Safety settings
    safetySettings?: GeminiSafetySetting[]
    
    // System instruction
    systemInstruction?: string | { parts: Array<{ text: string }> }
    
    // Tools (function calling)
    tools?: GeminiTools
    
    // Grounding (Google Search)
    groundingConfig?: GeminiGroundingConfig
    
    // Structured output
    responseMimeType?: string
    responseSchema?: {
        type: 'object'
        properties: Record<string, any>
        required?: string[]
    }
    
    // Streaming callback
    onChunk?: (chunk: GeminiStreamChunk) => void

    // Abort signal
    signal?: AbortSignal
}

export interface GeminiResponse {
    candidates: {
        content: {
            parts: { text: string }[]
            role: string
        }
        finishReason: string
        safetyRatings?: Array<{
            category: GeminiSafetyCategory
            probability: 'NEGLIGIBLE' | 'LOW' | 'MEDIUM' | 'HIGH'
        }>
    }[]
    usageMetadata?: {
        promptTokenCount: number
        candidatesTokenCount: number
        totalTokenCount: number
    }
    groundingMetadata?: {
        groundingChunks?: Array<{
            web?: {
                uri: string
                title: string
            }
        }>
    }
}

export interface GeminiStreamChunk {
    candidates: Array<{
        content?: {
            parts: Array<{ text?: string }>
        }
        finishReason?: string
        safetyRatings?: Array<{
            category: GeminiSafetyCategory
            probability: 'NEGLIGIBLE' | 'LOW' | 'MEDIUM' | 'HIGH'
        }>
    }>
    usageMetadata?: {
        promptTokenCount: number
        candidatesTokenCount: number
        totalTokenCount: number
    }
    groundingMetadata?: {
        groundingChunks?: Array<{
            web?: {
                uri: string
                title: string
            }
        }>
    }
}

export const generateGeminiCompletion = async (
    apiKey: string,
    model: string,
    messages: { role: string; content: string }[],
    options?: GeminiRequestOptions
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

    // Add system instruction if provided
    if (options?.systemInstruction) {
        if (typeof options.systemInstruction === 'string') {
            requestBody.systemInstruction = {
                parts: [{ text: options.systemInstruction }]
            }
        } else {
            requestBody.systemInstruction = options.systemInstruction
        }
    }

    // Build generation config
    if (options) {
        requestBody.generationConfig = options.generationConfig || {}
        
        // Support both direct options and generationConfig object
        if (options.temperature !== undefined) {
            requestBody.generationConfig.temperature = options.temperature
        }
        if (options.maxOutputTokens !== undefined) {
            requestBody.generationConfig.maxOutputTokens = options.maxOutputTokens
        }
        if (options.topP !== undefined) {
            requestBody.generationConfig.topP = options.topP
        }
        if (options.topK !== undefined) {
            requestBody.generationConfig.topK = options.topK
        }
        if (options.candidateCount !== undefined) {
            requestBody.generationConfig.candidateCount = options.candidateCount
        }
        if (options.stopSequences !== undefined) {
            requestBody.generationConfig.stopSequences = options.stopSequences
        }
        if (options.responseMimeType !== undefined) {
            requestBody.generationConfig.responseMimeType = options.responseMimeType
        }
        if (options.responseSchema !== undefined) {
            requestBody.generationConfig.responseSchema = options.responseSchema
        }
    }

    // Add safety settings if provided
    if (options?.safetySettings && options.safetySettings.length > 0) {
        requestBody.safetySettings = options.safetySettings
    }

    // Add tools if provided
    if (options?.tools) {
        requestBody.tools = [options.tools]
    }

    // Add grounding config if provided
    if (options?.groundingConfig) {
        requestBody.groundingConfig = options.groundingConfig
    }

    try {
        // Using v1beta API endpoint (works for all Gemini models including 3.x)
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
            console.error('Gemini API error (non-streaming):', {
                status: response.status,
                statusText: response.statusText,
                error: errorData,
                errorText,
                model
            })
            throw new Error(errorMessage)
        }

        const result = await response.json()
        
        // Validate result structure
        if (!result || typeof result !== 'object') {
            console.error('Invalid Gemini response format:', result)
            throw new Error('Invalid response format from Gemini API')
        }
        
        // Ensure result has candidates array (even if empty)
        if (!result.candidates) {
            result.candidates = []
        }
        
        // Log if no candidates (for debugging)
        if (result.candidates.length === 0) {
            console.warn('Gemini API returned no candidates:', {
                model,
                result: JSON.stringify(result).substring(0, 500)
            })
        }
        
        return result
    } catch (error: any) {
        console.error('Gemini API request failed:', error)
        throw error
    }
}

export async function* streamGeminiCompletion(
    apiKey: string,
    model: string,
    messages: { role: string; content: string }[],
    options?: GeminiRequestOptions
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

    // Add system instruction if provided
    if (options?.systemInstruction) {
        if (typeof options.systemInstruction === 'string') {
            requestBody.systemInstruction = {
                parts: [{ text: options.systemInstruction }]
            }
        } else {
            requestBody.systemInstruction = options.systemInstruction
        }
    }

    // Build generation config
    if (options) {
        requestBody.generationConfig = options.generationConfig || {}
        
        // Support both direct options and generationConfig object
        if (options.temperature !== undefined) {
            requestBody.generationConfig.temperature = options.temperature
        }
        if (options.maxOutputTokens !== undefined) {
            requestBody.generationConfig.maxOutputTokens = options.maxOutputTokens
        }
        if (options.topP !== undefined) {
            requestBody.generationConfig.topP = options.topP
        }
        if (options.topK !== undefined) {
            requestBody.generationConfig.topK = options.topK
        }
        if (options.candidateCount !== undefined) {
            requestBody.generationConfig.candidateCount = options.candidateCount
        }
        if (options.stopSequences !== undefined) {
            requestBody.generationConfig.stopSequences = options.stopSequences
        }
        if (options.responseMimeType !== undefined) {
            requestBody.generationConfig.responseMimeType = options.responseMimeType
        }
        if (options.responseSchema !== undefined) {
            requestBody.generationConfig.responseSchema = options.responseSchema
        }
    }

    // Add safety settings if provided
    if (options?.safetySettings && options.safetySettings.length > 0) {
        requestBody.safetySettings = options.safetySettings
    }

    // Add tools if provided
    if (options?.tools) {
        requestBody.tools = [options.tools]
    }

    // Add grounding config if provided
    if (options?.groundingConfig) {
        requestBody.groundingConfig = options.groundingConfig
    }

    try {
        // Use v1beta API endpoint for streaming (works for all Gemini models including 3.x)
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey
                },
                body: JSON.stringify(requestBody),
                signal: options?.signal
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
            console.error('Gemini API error (streaming):', {
                status: response.status,
                statusText: response.statusText,
                error: errorData,
                errorText,
                model
            })
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
                        const parsed = JSON.parse(line)
                        // Validate chunk structure
                        if (!parsed || typeof parsed !== 'object') {
                            console.warn('Invalid Gemini chunk format:', line)
                            continue
                        }
                        
                        const chunk: GeminiStreamChunk = parsed
                        
                        // Always yield the chunk for processing - don't skip based on content
                        // This ensures we get finishReason and other metadata
                        if (options?.onChunk) {
                            options.onChunk(chunk)
                        }
                        yield chunk
                    } catch (e) {
                        // Skip invalid JSON but log it
                        console.warn('Failed to parse Gemini chunk:', line, e)
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
