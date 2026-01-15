// OpenRouter/OpenAI Function Calling Adapter
// Converts tool definitions to OpenAI-compatible format

import { ToolDefinition } from '../definitions'
import { 
    ToolCall,
    ToolResult,
    OpenRouterResponse,
    OpenRouterToolCall,
    OpenRouterToolResultMessage
} from '../types'

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
            properties: Record<string, {
                type: string
                description: string
                enum?: string[]
                default?: unknown
            }>
            required: string[]
        }
    }
}

/**
 * Tool call from OpenAI response (re-export for backward compatibility)
 */
export type OpenAIToolCall = OpenRouterToolCall

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
 * Check if a JSON string is complete (balanced braces and brackets)
 */
function isJsonComplete(str: string): boolean {
    const trimmed = str.trim()
    if (trimmed.length === 0) return false

    let depth = 0
    let inString = false
    let escapeNext = false

    for (const char of trimmed) {
        if (escapeNext) {
            escapeNext = false
            continue
        }

        if (char === '\\') {
            escapeNext = true
            continue
        }

        if (char === '"') {
            inString = !inString
            continue
        }

        if (!inString) {
            if (char === '{' || char === '[') depth++
            if (char === '}' || char === ']') depth--
        }
    }

    // JSON is complete if we're back at depth 0 and not inside a string
    return depth === 0 && !inString
}

/**
 * Parse tool calls from OpenRouter/OpenAI response
 */
export function parseOpenRouterToolCalls(response: OpenRouterResponse): ToolCall[] {
    const message = response.choices?.[0]?.message

    if (!message?.tool_calls || message.tool_calls.length === 0) {
        return []
    }

    return message.tool_calls.map((tc: OpenRouterToolCall) => {
        let args: Record<string, unknown> = {}
        try {
            const argsStr = tc.function.arguments || ''
            // Only attempt to parse if JSON appears complete
            if (isJsonComplete(argsStr)) {
                args = JSON.parse(argsStr)
            } else {
                console.warn('[openrouter] Incomplete JSON for tool call, skipping:', {
                    tool: tc.function.name,
                    argsLength: argsStr.length,
                    argsPreview: argsStr.slice(0, 100)
                })
            }
        } catch (e) {
            console.error('[openrouter] Failed to parse tool arguments:', {
                tool: tc.function.name,
                error: e instanceof Error ? e.message : String(e),
                args: tc.function.arguments?.slice(0, 200)
            })
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
    results: ToolResult[]
): OpenRouterToolResultMessage[] {
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
export function hasToolCalls(response: OpenRouterResponse): boolean {
    const message = response.choices?.[0]?.message
    return !!(message?.tool_calls && message.tool_calls.length > 0)
}

