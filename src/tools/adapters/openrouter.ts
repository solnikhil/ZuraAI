// OpenRouter/OpenAI Function Calling Adapter
// Converts tool definitions to OpenAI-compatible format

import { ToolDefinition, ToolSchemaProperty, getToolByName } from '../definitions'
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
                properties?: Record<string, unknown>
                required?: string[]
                items?: unknown
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
 * Convert ZuraAI tool definitions to OpenAI/OpenRouter format
 */
function convertProperty(value: ToolSchemaProperty): Record<string, unknown> {
    const base: Record<string, unknown> = {
        type: value.type,
        description: value.description,
        ...(value.enum && { enum: value.enum }),
        ...(value.default !== undefined && { default: value.default })
    }
    if (value.properties) {
        base.properties = Object.fromEntries(
            Object.entries(value.properties).map(([key, property]) => [key, convertProperty(property)])
        )
        base.required = value.required || []
    }
    if (value.type === 'array' && value.items) {
        base.items = convertProperty(value.items)
    }
    return base
}

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
                        convertProperty(value)
                    ])
                ) as OpenAITool['function']['parameters']['properties'],
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

/**
 * Return synthetic args that will fail validation when a tool call has empty/invalid arguments.
 * Ensures we send an error result back to the model so the stream continues instead of hanging.
 */
function getSyntheticErrorArgs(toolName: string): Record<string, unknown> {
    const toolDef = getToolByName(toolName)
    if (!toolDef?.parameters?.required?.length) {
        return {}
    }
    const required = toolDef.parameters.required
    return Object.fromEntries(required.map(p => [p, '']))
}

/**
 * Fallback context for tool calls when parsing fails (e.g. empty args from streaming).
 * Attach to response as response._fallbackContext when calling handleToolCalls.
 */
export interface ToolCallFallbackContext {
    lastUserMessage?: string
    reasoning?: string
}

/**
 * Extract a fallback search query from conversation context when tool args are empty.
 * Tries: last user message (trimmed) → patterns in reasoning.
 */
function extractFallbackQuery(
    toolName: string,
    fallbackContext?: ToolCallFallbackContext | null
): string | null {
    if (toolName !== 'web_search' || !fallbackContext) return null

    const { lastUserMessage, reasoning } = fallbackContext

    // 1. Use last user message as query (most reliable for "what is X?" type questions)
    if (lastUserMessage && typeof lastUserMessage === 'string') {
        const trimmed = lastUserMessage.trim()
        if (trimmed.length > 0) {
            return trimmed.length > 300 ? trimmed.slice(0, 300) : trimmed
        }
    }

    // 2. Search for query-like patterns in reasoning (e.g. "search for 'kiro'", "I'll look up X")
    if (reasoning && typeof reasoning === 'string') {
        const patterns = [
            /search\s+for\s+['"]([^'"]+)['"]/i,
            /search\s+for\s+(\S[^.]{2,80}?)(?:\s|\.|$)/i,
            /web\s+search[:\s]+['"]?([^'"]+)['"]?/i,
            /look\s+up\s+['"]?([^'".]+)['"]?/i,
            /search\s+['"]?([^'"]+)['"]?\s+(?:to|for)/i,
            /query\s*[=:]\s*['"]?([^'"]+)['"]?/i,
            /["']([^"']{3,100})["']\s+(?:to\s+)?search/i
        ]
        for (const re of patterns) {
            const m = reasoning.match(re)
            if (m?.[1]?.trim()) return m[1].trim().slice(0, 300)
        }
    }

    return null
}

/**
 * Try to repair incomplete JSON by closing unclosed strings and appending braces/brackets.
 * Handles common streaming truncation (e.g. {"query": "value" without final } or {"query": "world pop without closing).
 */
function tryRepairIncompleteJson(str: string): string | null {
    const trimmed = str.trim()
    if (!trimmed || trimmed.length < 2) return null

    let openBraces = 0
    let openBrackets = 0
    let inString = false
    let escapeNext = false
    let inStringChar = ''

    for (const char of trimmed) {
        if (escapeNext) {
            escapeNext = false
            continue
        }
        if (char === '\\') {
            escapeNext = true
            continue
        }
        if ((char === '"' || char === "'") && !inString) {
            inString = true
            inStringChar = char
            continue
        }
        if (char === inStringChar) {
            inString = false
            continue
        }
        if (!inString) {
            if (char === '{') openBraces++
            if (char === '}') openBraces--
            if (char === '[') openBrackets++
            if (char === ']') openBrackets--
        }
    }

    if (openBraces <= 0 && openBrackets <= 0 && !inString) return null

    let suffix = ''
    if (inString) suffix += inStringChar
    suffix += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces))
    return trimmed + suffix
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
        return extractFallbackArgs(toolName, argsStr)
    } else {
        const repaired = tryRepairIncompleteJson(argsStr)
        if (repaired) {
            try {
                const parsed = JSON.parse(repaired)
                const normalized = normalizeParsedArgs(toolName, parsed)
                if (normalized) {
                    return normalized
                }
            } catch {
                /* fall through to extractFallbackArgs */
            }
        }
        const fallback = extractFallbackArgs(toolName, argsStr)
        if (fallback) {
            console.info('[openrouter] Incomplete JSON for tool call, recovered via fallback:', {
                tool: toolName,
                argsPreview: argsStr.slice(0, 80)
            })
        } else {
            console.warn('[openrouter] Incomplete JSON for tool call, fallback failed:', {
                tool: toolName,
                argsLength: argsStr.length,
                argsPreview: argsStr.slice(0, 100)
            })
        }
        return fallback
    }
}

/**
 * Parse tool calls from OpenRouter/OpenAI response
 * Supports optional fallback context (response._fallbackContext) to infer query when args are empty.
 */
export function parseOpenRouterToolCalls(response: OpenRouterResponse & { _fallbackContext?: ToolCallFallbackContext }): ToolCall[] {
    const message = response.choices?.[0]?.message

    if (!message?.tool_calls || message.tool_calls.length === 0) {
        return []
    }

    const fallbackContext = response._fallbackContext
    const toolCalls: ToolCall[] = []

    message.tool_calls.forEach((tc: OpenRouterToolCall) => {
        const rawArgs = tc.function.arguments || ''
        let args = parseToolArguments(tc.function.name, rawArgs)

        if (!args) {
            let fallbackQuery = extractFallbackQuery(tc.function.name, fallbackContext)
            if (!fallbackQuery && tc.function.name === 'web_search' && rawArgs.trim().length > 0) {
                const m = rawArgs.match(/"query"\s*:\s*"((?:[^"\\]|\\.)*)"?/i) ?? rawArgs.match(/"query"\s*:\s*"([^"]*)/i)
                const extracted = m?.[1]?.trim()
                if (extracted && extracted.length > 0) {
                    fallbackQuery = extracted.replace(/\\(.)/g, '$1')
                }
            }
            if (fallbackQuery) {
                args = { query: fallbackQuery }
                console.info('[openrouter] Empty args for web_search, used fallback from context:', { query: fallbackQuery.slice(0, 60) + (fallbackQuery.length > 60 ? '...' : '') })
        } else {
            console.warn('[openrouter] Tool call had empty/invalid arguments, using synthetic error args so model receives a result:', {
                    tool: tc.function.name,
                    argsLength: rawArgs.length,
                    argsPreview: rawArgs.slice(0, 100)
                })
                args = getSyntheticErrorArgs(tc.function.name)
            }
        }

        toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: args
        })
    })

    return toolCalls
}

/** Max chars per tool result to avoid 400 from oversized payloads */
const MAX_TOOL_RESULT_CHARS = 32000

/**
 * Strip UI-only fields from web search data before sending to the model.
 * Removes favicon, source, displayed_link from results and images array
 * to reduce token usage and prevent models from echoing raw metadata.
 */
function stripUiFieldsFromToolData(data: unknown): unknown {
    if (!data || typeof data !== 'object') return data
    const obj = data as Record<string, unknown>

    if (Array.isArray(obj.results)) {
        const cleaned: Record<string, unknown> = { query: obj.query }
        cleaned.results = (obj.results as Array<Record<string, unknown>>).map(r => {
            const { favicon, source, displayed_link, ...rest } = r
            return rest
        })
        cleaned.resultCount = obj.resultCount
        return cleaned
    }

    return data
}

/**
 * Format tool results for sending back to OpenRouter.
 * Truncates large results to avoid 400 errors from context limits.
 */
export function formatToolResultsForOpenRouter(
    toolCalls: Array<{ id: string; name: string }>,
    results: ToolResult[]
): OpenRouterToolResultMessage[] {
    return toolCalls.map((tc, i) => {
        const r = results[i]
        if (!r) {
            return {
                role: 'tool' as const,
                tool_call_id: tc.id,
                content: 'Error: No result available for this tool call'
            }
        }
        const data = tc.name === 'web_search' && r.success
            ? stripUiFieldsFromToolData(r.data)
            : r.data
        const content = r.success
            ? JSON.stringify(data)
            : `Error: ${r.error}`
        const truncated = content.length > MAX_TOOL_RESULT_CHARS
            ? content.slice(0, MAX_TOOL_RESULT_CHARS) + '...[truncated]'
            : content
        return {
            role: 'tool' as const,
            tool_call_id: tc.id,
            content: truncated
        }
    })
}

/**
 * Check if response contains tool calls
 */
export function hasToolCalls(response: OpenRouterResponse): boolean {
    const message = response.choices?.[0]?.message
    return !!(message?.tool_calls && message.tool_calls.length > 0)
}

