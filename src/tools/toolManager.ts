// ============================================================================
// TOOL MANAGER - Coordinates tool execution in chat flow
// ============================================================================
//
// IMPORTANT: Provider Tool Support Policy
// ----------------------------------------
// The following providers are EXCLUDED from tool support:
//
// 1. PERPLEXITY - Has native built-in web search and research capabilities.
//    Adding external tools would interfere with their native functionality.
//
// DO NOT add 'perplexity' to tool support functions.
//
// Providers WITH tool support: openrouter, groq, ollama, nvidia, alibaba
// ============================================================================

// Tool Manager - Coordinates tool execution in chat flow

import { getAllToolDefinitions, getToolByName } from './definitions'
import { convertToolsForProvider, providerSupportsTools, modelSupportsTools } from './adapters'
import { parseOpenRouterToolCalls, hasToolCalls, formatToolResultsForOpenRouter } from './adapters/openrouter'
import { executeToolCalls } from './executor'
import { executeResearchPlanTool } from './researchPlanHandler'
import { 
    ToolCall, 
    ToolCallResult,
    OpenRouterResponse,
    OpenRouterToolResultMessage
} from './types'

// Type for provider API responses
type ProviderResponse = OpenRouterResponse

// Type for formatted tool results
type FormattedToolResults = OpenRouterToolResultMessage[]

/**
 * Validate that all required parameters are present in tool arguments
 * Returns an error message if validation fails, null if valid
 */
function validateRequiredParameters(toolCall: ToolCall): string | null {
    const toolDef = getToolByName(toolCall.name)
    
    // Check if tool exists
    if (!toolDef) {
        const availableTools = getAllToolDefinitions().map(t => t.name).join(', ')
        return `Unknown tool "${toolCall.name}". Available tools: ${availableTools}`
    }
    
    const requiredParams = toolDef.parameters.required || []
    const missingParams: string[] = []
    
    for (const param of requiredParams) {
        const value = toolCall.arguments[param]
        // Check if parameter is missing, null, undefined, or empty string
        if (value === undefined || value === null || value === '') {
            missingParams.push(param)
        }
    }
    
    if (missingParams.length > 0) {
        return `Missing required parameter(s): ${missingParams.join(', ')}. Please provide ${missingParams.map(p => `'${p}'`).join(' and ')} to use ${toolCall.name}.`
    }
    
    return null
}

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
    provider: 'openrouter' | 'groq' | 'ollama' | 'perplexity' | 'nvidia' | 'alibaba'
    model: string
    enabledTools?: string[]  // If not provided, all tools enabled
    onToolStart?: (toolCall: ToolCall) => void
    onToolComplete?: (result: ToolCallResult) => void
    /** Called during research_plan execution for step-by-step progress (currentStep, totalSteps, query) */
    onResearchPlanProgress?: (currentStep: number, totalSteps: number, query?: string) => void
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
 * EXCLUDED: perplexity (see header comment)
 */
export function parseToolCallsFromResponse(response: ProviderResponse, provider: string): ToolCall[] {
    switch (provider) {
        case 'openrouter':
        case 'groq':
        case 'ollama':
        case 'nvidia':
        case 'alibaba':
            return parseOpenRouterToolCalls(response as OpenRouterResponse)
        case 'perplexity':
            // EXCLUDED: This provider has native capabilities
            return []
        default:
            return []
    }
}

/**
 * Check if response has tool calls based on provider
 * EXCLUDED: perplexity (see header comment)
 */
export function responseHasToolCalls(response: ProviderResponse, provider: string): boolean {
    switch (provider) {
        case 'openrouter':
        case 'groq':
        case 'ollama':
        case 'nvidia':
        case 'alibaba':
            return hasToolCalls(response as OpenRouterResponse)
        case 'perplexity':
            // EXCLUDED: This provider has native capabilities
            return false
        default:
            return false
    }
}

/**
 * Format tool results for sending back to AI based on provider
 * EXCLUDED: perplexity (see header comment)
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
        case 'nvidia':
        case 'alibaba':
            return formatToolResultsForOpenRouter(toolCalls, toolResults)
        case 'perplexity':
            // EXCLUDED: This provider has native capabilities
            return []
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
        
        // Validate required parameters before executing
        const validationError = validateRequiredParameters(coercedToolCall)
        if (validationError) {
            console.warn(`Tool validation failed for ${coercedToolCall.name}:`, validationError)
            // Notify tool start (so UI shows the attempt)
            config.onToolStart?.(coercedToolCall)
            // Add error result without executing
            const errorResult: ToolCallResult = {
                toolCall: coercedToolCall,
                result: {
                    success: false,
                    error: validationError
                }
            }
            results.push(errorResult)
            config.onToolComplete?.(errorResult)
            continue
        }
        
        // Notify tool start (UI can show research plan from toolCall.arguments when name === 'research_plan')
        config.onToolStart?.(coercedToolCall)
        
        // Execute tool - research_plan is handled in renderer (expands to web_search per step)
        try {
            let result: ToolCallResult[]
            if (coercedToolCall.name === 'research_plan') {
                const singleResult = await executeResearchPlanTool(
                    coercedToolCall,
                    config.onResearchPlanProgress
                )
                result = [singleResult]
            } else {
                result = await executeToolCalls([coercedToolCall])
            }
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

type ProviderMessage = OpenRouterMessage

/**
 * Build messages array with tool results for follow-up API call
 * EXCLUDED: perplexity (see header comment)
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
        case 'nvidia':
        case 'alibaba':
            return [
                ...originalMessages,
                assistantMessage,
                ...toolResults
            ] as ProviderMessage[]

        case 'perplexity':
            // EXCLUDED: This provider has native capabilities
            return originalMessages

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

