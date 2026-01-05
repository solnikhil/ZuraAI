// Tool Manager - Coordinates tool execution in chat flow

import { getAllToolDefinitions, getToolByName } from './definitions'
import { convertToolsForProvider, providerSupportsTools, modelSupportsTools } from './adapters'
import { parseOpenRouterToolCalls, hasToolCalls, formatToolResultsForOpenRouter } from './adapters/openrouter'
import { parseGeminiFunctionCalls, hasGeminiFunctionCalls, formatToolResultsForGemini } from './adapters/gemini'
import { executeToolCalls } from './executor'
import { 
    ToolCall, 
    ToolCallResult,
    OpenRouterResponse,
    GeminiResponse,
    OpenRouterToolResultMessage,
    GeminiFunctionResponse
} from './types'

// Type for provider API responses
type ProviderResponse = OpenRouterResponse | GeminiResponse

// Type for formatted tool results
type FormattedToolResults = OpenRouterToolResultMessage[] | GeminiFunctionResponse[]

/**
 * Coerce tool arguments to correct types based on tool definition schema
 */
function coerceToolArguments(toolCall: ToolCall): ToolCall {
    const toolDef = getToolByName(toolCall.name)
    if (!toolDef) return toolCall
    
    const coercedArgs: Record<string, unknown> = {}
    
    for (const [key, value] of Object.entries(toolCall.arguments)) {
        const paramDef = toolDef.parameters.properties[key]
        if (!paramDef) {
            // Unknown parameter, keep as-is
            coercedArgs[key] = value
            continue
        }
        
        // Coerce based on expected type
        if (paramDef.type === 'number') {
            // Convert string numbers to actual numbers
            if (typeof value === 'string' && value.trim() !== '') {
                const num = Number(value)
                coercedArgs[key] = isNaN(num) ? (paramDef.default !== undefined ? paramDef.default : value) : num
            } else if (typeof value === 'number') {
                coercedArgs[key] = value
            } else {
                coercedArgs[key] = paramDef.default !== undefined ? paramDef.default : value
            }
        } else if (paramDef.type === 'boolean') {
            // Convert string booleans to actual booleans
            if (typeof value === 'string') {
                coercedArgs[key] = value.toLowerCase() === 'true' || value === '1'
            } else {
                coercedArgs[key] = Boolean(value)
            }
        } else {
            // Keep as-is for strings, objects, arrays
            coercedArgs[key] = value
        }
    }
    
    return {
        ...toolCall,
        arguments: coercedArgs
    }
}

export type { ToolCall, ToolCallResult }

export interface ToolManagerConfig {
    provider: 'openrouter' | 'gemini' | 'groq' | 'ollama' | 'perplexity' | 'codex'
    model: string
    enabledTools?: string[]  // If not provided, all tools enabled
    requireApprovalFor?: string[]  // Tools that need user approval
    onToolStart?: (toolCall: ToolCall) => void
    onToolComplete?: (result: ToolCallResult) => void
    onApprovalNeeded?: (toolCall: ToolCall) => Promise<boolean>
}

/**
 * Get tools formatted for the current provider
 */
export function getToolsForProvider(config: ToolManagerConfig) {
    if (!providerSupportsTools(config.provider)) {
        return null
    }
    
    if (!modelSupportsTools(config.provider, config.model)) {
        return null
    }
    
    // Filter tools if specific ones are enabled
    let tools = getAllToolDefinitions()
    if (config.enabledTools && config.enabledTools.length > 0) {
        tools = tools.filter(t => config.enabledTools!.includes(t.name))
    }
    
    return convertToolsForProvider(tools, config.provider)
}

/**
 * Parse tool calls from AI response based on provider
 */
export function parseToolCallsFromResponse(response: ProviderResponse, provider: string): ToolCall[] {
    switch (provider) {
        case 'openrouter':
        case 'groq':
        case 'ollama':
        case 'codex':
            return parseOpenRouterToolCalls(response as OpenRouterResponse)
        case 'gemini':
            return parseGeminiFunctionCalls(response as GeminiResponse)
        default:
            return []
    }
}

/**
 * Check if response has tool calls based on provider
 */
export function responseHasToolCalls(response: ProviderResponse, provider: string): boolean {
    switch (provider) {
        case 'openrouter':
        case 'groq':
        case 'ollama':
        case 'codex':
            return hasToolCalls(response as OpenRouterResponse)
        case 'gemini':
            return hasGeminiFunctionCalls(response as GeminiResponse)
        default:
            return false
    }
}

/**
 * Format tool results for sending back to AI based on provider
 */
export function formatResultsForProvider(
    toolCalls: ToolCall[],
    results: ToolCallResult[],
    provider: string
): FormattedToolResults {
    const toolResults = results.map(r => r.result)
    
    switch (provider) {
        case 'openrouter':
        case 'groq':
        case 'ollama':
        case 'codex':
            return formatToolResultsForOpenRouter(toolCalls, toolResults)
        case 'gemini':
            return formatToolResultsForGemini(toolCalls, toolResults)
        default:
            return []
    }
}

/**
 * Process tool calls from AI response
 * Returns the results formatted for the provider
 */
export async function processToolCalls(
    response: ProviderResponse,
    config: ToolManagerConfig
): Promise<{
    toolCalls: ToolCall[]
    results: ToolCallResult[]
    formattedResults: FormattedToolResults
}> {
    const toolCalls = parseToolCallsFromResponse(response, config.provider)
    
    if (toolCalls.length === 0) {
        return { toolCalls: [], results: [], formattedResults: [] }
    }
    
    const results: ToolCallResult[] = []
    
    for (const toolCall of toolCalls) {
        // Coerce arguments to correct types based on schema
        const coercedToolCall = coerceToolArguments(toolCall)
        
        // Check if tool needs approval
        const toolDef = getToolByName(coercedToolCall.name)
        const needsApproval = toolDef?.requiresApproval || 
            config.requireApprovalFor?.includes(coercedToolCall.name)
        
        if (needsApproval && config.onApprovalNeeded) {
            const approved = await config.onApprovalNeeded(coercedToolCall)
            if (!approved) {
                results.push({
                    toolCall: coercedToolCall,
                    result: { success: false, error: 'User denied permission' }
                })
                continue
            }
        }
        
        // Notify tool start
        config.onToolStart?.(coercedToolCall)
        
        // Execute tool with coerced arguments - wrap in try-catch to prevent crashes
        try {
            const result = await executeToolCalls([coercedToolCall])
            results.push(...result)
            
            // Notify tool complete
            config.onToolComplete?.(result[0])
        } catch (execError: unknown) {
            const errorMessage = execError instanceof Error ? execError.message : `Failed to execute ${coercedToolCall.name}`
            console.error(`Tool execution error for ${coercedToolCall.name}:`, execError)
            // Add error result instead of crashing
            results.push({
                toolCall: coercedToolCall,
                result: {
                    success: false,
                    error: errorMessage
                }
            })
        }
    }
    
    const formattedResults = formatResultsForProvider(toolCalls, results, config.provider)
    
    return { toolCalls, results, formattedResults }
}

// Message types for different providers
interface OpenRouterMessage {
    role: string
    content?: string | null
    tool_calls?: unknown[]
}

interface GeminiMessage {
    role: string
    parts: unknown[]
}

type ProviderMessage = OpenRouterMessage | GeminiMessage

/**
 * Build messages array with tool results for follow-up API call
 */
export function buildMessagesWithToolResults(
    originalMessages: ProviderMessage[],
    assistantMessage: ProviderMessage,
    toolResults: FormattedToolResults,
    provider: string
): ProviderMessage[] {
    switch (provider) {
        case 'openrouter':
        case 'groq':
        case 'ollama':
        case 'codex':
            return [
                ...originalMessages,
                assistantMessage,
                ...toolResults
            ] as ProviderMessage[]
        
        case 'gemini':
            // Gemini handles this differently - tool results go in content parts
            return [
                ...originalMessages,
                { role: 'model', parts: [assistantMessage] },
                { role: 'function', parts: toolResults }
            ]
        
        default:
            return originalMessages
    }
}

/**
 * Get a summary of available tools for the system prompt
 */
export function getToolsSummaryForPrompt(enabledTools?: string[]): string {
    let tools = getAllToolDefinitions()
    if (enabledTools && enabledTools.length > 0) {
        tools = tools.filter(t => enabledTools.includes(t.name))
    }
    
    const toolsList = tools.map(t => `- ${t.name}: ${t.description}`).join('\n')
    
    return `You have access to the following tools:

${toolsList}

When you need to use a tool, the system will automatically execute it and provide you with the results. You can then use those results to formulate your response to the user.`
}

