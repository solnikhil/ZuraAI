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

export const generateGroqCompletion = async (
    apiKey: string,
    model: string,
    messages: any[],
    options?: {
        temperature?: number
        max_tokens?: number
        tools?: any[]
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
    if (options?.tools && Array.isArray(options.tools) && options.tools.length > 0) {
        requestBody.tools = options.tools
        requestBody.tool_choice = 'auto'
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
            
            // Handle Groq's tool_use_failed error - try to extract tool calls from failed_generation
            if (errorData.error?.code === 'tool_use_failed' && errorData.error?.failed_generation) {
                const failedContent = errorData.error.failed_generation
                
                // Try to extract tool call from failed_generation text (model generated tool call as text)
                // Look for JSON arrays or objects that look like tool calls
                try {
                    // Try to find JSON array/object in the text
                    const jsonMatch = failedContent.match(/\[[\s\S]*?\]|{[\s\S]*?}/)
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0])
                        // Check if it looks like a tool call
                        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].name && parsed[0].parameters) {
                            const toolCall = parsed[0]
                            // Coerce num_results to number if present
                            if (toolCall.parameters.num_results && typeof toolCall.parameters.num_results === 'string') {
                                const num = Number(toolCall.parameters.num_results)
                                if (!isNaN(num)) {
                                    toolCall.parameters.num_results = num
                                }
                            }
                            // Return a mock response with tool_calls format
                            return {
                                id: 'groq-extracted-tool-call',
                                object: 'chat.completion',
                                created: Math.floor(Date.now() / 1000),
                                model: model,
                                choices: [{
                                    index: 0,
                                    message: {
                                        role: 'assistant',
                                        content: '',
                                        tool_calls: [{
                                            id: `call_${Date.now()}`,
                                            type: 'function' as const,
                                            function: {
                                                name: toolCall.name,
                                                arguments: JSON.stringify(toolCall.parameters)
                                            }
                                        }]
                                    },
                                    finish_reason: 'tool_calls'
                                }],
                                usage: {
                                    prompt_tokens: 0,
                                    completion_tokens: 0,
                                    total_tokens: 0
                                }
                            } as GroqResponse
                        }
                    }
                } catch (e) {
                    // Failed to parse, fall through to returning failed_generation as content
                }
                
                // Fallback: Return failed_generation as regular content
                return {
                    id: 'groq-failed-generation',
                    object: 'chat.completion',
                    created: Math.floor(Date.now() / 1000),
                    model: model,
                    choices: [{
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: failedContent
                        },
                        finish_reason: 'stop'
                    }],
                    usage: {
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        total_tokens: 0
                    }
                } as GroqResponse
            }
            
            const errorMessage = errorData.error?.message || errorData.detail || errorText || `HTTP ${response.status}: ${response.statusText}`
            throw new Error(errorMessage)
        }

        const result: any = await response.json()
        
        // Check for Groq-specific error fields in successful response (shouldn't happen but handle it)
        if ((result as any).error || (result as any).failed_generation) {
            const errorMsg = (result as any).error?.message || (result as any).failed_generation?.message || 'Failed to call a function. Please adjust your prompt. See \'failed_generation\' for more details.'
            throw new Error(errorMsg)
        }
        
        return result as GroqResponse
    } catch (error: any) {
        throw error
    }
}
