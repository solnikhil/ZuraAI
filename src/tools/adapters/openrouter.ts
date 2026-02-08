// OpenRouter/OpenAI Function Calling Adapter
// Converts tool definitions to OpenAI-compatible format

import { ToolDefinition, getToolByName } from '../definitions'
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

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripOuterQuotes(value: string): string {
    return value.replace(/^['"]|['"]$/g, '').trim()
}

function wrapPrimitiveArgs(toolName: string, value: unknown): Record<string, unknown> | null {
    const toolDef = getToolByName(toolName)
    if (!toolDef) return null

    const requiredParams = toolDef.parameters.required || []
    if (requiredParams.length !== 1) return null

    return { [requiredParams[0]]: value }
}

function extractFallbackArgs(toolName: string, rawArgs: string): Record<string, unknown> | null {
    const toolDef = getToolByName(toolName)
    if (!toolDef) return null

    const requiredParams = toolDef.parameters.required || []
    if (requiredParams.length !== 1) return null

    const key = requiredParams[0]
    const trimmed = rawArgs.trim()
    if (!trimmed) return null

    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        const keyPattern = escapeRegExp(key)
        const bareMatch = trimmed.match(new RegExp(`^${keyPattern}\\s*[:=]\\s*(.+)$`, 'i'))
        if (bareMatch?.[1]?.trim()) {
            const value = stripOuterQuotes(bareMatch[1].trim())
            return value ? { [key]: value } : null
        }

        const value = stripOuterQuotes(trimmed)
        return value ? { [key]: value } : null
    }

    const keyPattern = escapeRegExp(key)
    const quotedMatch = trimmed.match(new RegExp(`["']${keyPattern}["']\\s*:\\s*["']([^"']*)`, 'i'))
    if (quotedMatch?.[1]?.trim()) {
        return { [key]: quotedMatch[1].trim() }
    }

    const unquotedMatch = trimmed.match(new RegExp(`${keyPattern}\\s*:\\s*([^,}\\n]+)`, 'i'))
    if (unquotedMatch?.[1]?.trim()) {
        const value = stripOuterQuotes(unquotedMatch[1].trim())
        return value ? { [key]: value } : null
    }

    return null
}

function normalizeParsedArgs(toolName: string, parsed: unknown): Record<string, unknown> | null {
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
    }

    return wrapPrimitiveArgs(toolName, parsed)
}

function parseToolArguments(toolName: string, rawArgs: string): Record<string, unknown> | null {
    const argsStr = rawArgs?.trim() || ''
    if (!argsStr) return null

    if (isJsonComplete(argsStr)) {
        try {
            const parsed = JSON.parse(argsStr)
            const normalized = normalizeParsedArgs(toolName, parsed)
            if (normalized) {
                return normalized
            }
        } catch (e) {
            console.warn('[openrouter] Failed to parse tool arguments, falling back:', {
                tool: toolName,
                error: e instanceof Error ? e.message : String(e),
                args: argsStr.slice(0, 200)
            })
        }
    } else {
        console.warn('[openrouter] Incomplete JSON for tool call, falling back:', {
            tool: toolName,
            argsLength: argsStr.length,
            argsPreview: argsStr.slice(0, 100)
        })
    }

    return extractFallbackArgs(toolName, argsStr)
}

/**
 * Parse tool calls from OpenRouter/OpenAI response
 */
export function parseOpenRouterToolCalls(response: OpenRouterResponse): ToolCall[] {
    const message = response.choices?.[0]?.message

    if (!message?.tool_calls || message.tool_calls.length === 0) {
        return []
    }

    const toolCalls: ToolCall[] = []

    message.tool_calls.forEach((tc: OpenRouterToolCall) => {
        const rawArgs = tc.function.arguments || ''
        const args = parseToolArguments(tc.function.name, rawArgs)
        if (!args) {
            console.warn('[openrouter] Skipping tool call with empty/invalid arguments:', {
                tool: tc.function.name,
                argsLength: rawArgs.length,
                argsPreview: rawArgs.slice(0, 100)
            })
            return
        }

        toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: args
        })
    })

    return toolCalls
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

