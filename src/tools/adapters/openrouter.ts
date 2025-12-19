// OpenRouter/OpenAI Function Calling Adapter
// Converts tool definitions to OpenAI-compatible format

import { ToolDefinition } from '../definitions'

/**
 * OpenAI/OpenRouter tool format
 */
export interface OpenAITool {
    type: 'function'
    function: {
        name: string
        description: string
        parameters: {
            type: 'object'
            properties: Record<string, any>
            required: string[]
        }
    }
}

/**
 * Tool call from OpenAI response
 */
export interface OpenAIToolCall {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string  // JSON string
    }
}

/**
 * Convert Zura tool definitions to OpenAI/OpenRouter format
 */
export function convertToOpenRouterFormat(tools: ToolDefinition[]): OpenAITool[] {
    return tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: {
                type: 'object',
                properties: Object.fromEntries(
                    Object.entries(tool.parameters.properties).map(([key, value]) => [
                        key,
                        {
                            type: value.type,
                            description: value.description,
                            ...(value.enum && { enum: value.enum }),
                            ...(value.default !== undefined && { default: value.default })
                        }
                    ])
                ),
                required: tool.parameters.required
            }
        }
    }))
}

/**
 * Parse tool calls from OpenRouter/OpenAI response
 */
export function parseOpenRouterToolCalls(response: any): Array<{ id: string; name: string; arguments: Record<string, any> }> {
    const message = response.choices?.[0]?.message
    
    if (!message?.tool_calls || message.tool_calls.length === 0) {
        return []
    }
    
    return message.tool_calls.map((tc: OpenAIToolCall) => {
        let args: Record<string, any> = {}
        try {
            args = JSON.parse(tc.function.arguments)
        } catch (e) {
            console.error('Failed to parse tool arguments:', tc.function.arguments)
        }
        
        return {
            id: tc.id,
            name: tc.function.name,
            arguments: args
        }
    })
}

/**
 * Format tool results for sending back to OpenRouter
 */
export function formatToolResultsForOpenRouter(
    toolCalls: Array<{ id: string; name: string }>,
    results: Array<{ success: boolean; data?: any; error?: string }>
): Array<{ role: 'tool'; tool_call_id: string; content: string }> {
    return toolCalls.map((tc, i) => ({
        role: 'tool' as const,
        tool_call_id: tc.id,
        content: results[i].success 
            ? JSON.stringify(results[i].data)
            : `Error: ${results[i].error}`
    }))
}

/**
 * Check if response contains tool calls
 */
export function hasToolCalls(response: any): boolean {
    const message = response.choices?.[0]?.message
    return message?.tool_calls && message.tool_calls.length > 0
}

/**
 * Get the finish reason from response
 */
export function getFinishReason(response: any): string | undefined {
    return response.choices?.[0]?.finish_reason
}

