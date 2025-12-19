// Agent Loop Utilities - Handles agent mode execution logic

import { ToolCallResult, ToolCall } from '../tools/executor'

/**
 * Format a tool result for AI consumption in the conversation
 * Includes success/error status and structured data
 * 
 * **Feature: agent-mode, Property 4: Tool results are incorporated into conversation**
 * **Validates: Requirements 2.3, 3.2**
 */
export function formatToolResultForConversation(result: ToolCallResult): string {
    const { toolCall, result: toolResult } = result
    
    if (!toolResult.success) {
        return JSON.stringify({
            tool: toolCall.name,
            status: 'error',
            error: toolResult.error || 'Unknown error',
            executionTime: toolResult.executionTime
        }, null, 2)
    }
    
    return JSON.stringify({
        tool: toolCall.name,
        status: 'success',
        arguments: toolCall.arguments,
        result: toolResult.data,
        executionTime: toolResult.executionTime
    }, null, 2)
}

/**
 * Format multiple tool results for AI consumption
 * Returns a formatted string that can be added to conversation history
 */
export function formatToolResultsForConversation(results: ToolCallResult[]): string {
    if (results.length === 0) {
        return ''
    }
    
    const formattedResults = results.map(formatToolResultForConversation)
    return formattedResults.join('\n\n')
}

/**
 * Check if an AI response indicates the agent should continue looping
 * Returns true if there are tool calls to process
 */
export function shouldContinueAgentLoop(
    response: any,
    provider: string
): boolean {
    switch (provider) {
        case 'openrouter':
        case 'groq':
        case 'ollama':
            // OpenAI-compatible format: check for tool_calls in message
            return !!(
                response?.choices?.[0]?.message?.tool_calls &&
                Array.isArray(response.choices[0].message.tool_calls) &&
                response.choices[0].message.tool_calls.length > 0
            )
        
        case 'gemini':
            // Gemini format: check for functionCall in parts
            const parts = response?.candidates?.[0]?.content?.parts
            if (!parts || !Array.isArray(parts)) return false
            return parts.some((part: any) => part.functionCall)
        
        default:
            return false
    }
}

/**
 * Extract text content from AI response based on provider
 */
export function extractResponseContent(response: any, provider: string): string {
    switch (provider) {
        case 'openrouter':
        case 'groq':
        case 'ollama':
            return response?.choices?.[0]?.message?.content || ''
        
        case 'gemini':
            const parts = response?.candidates?.[0]?.content?.parts
            if (!parts || !Array.isArray(parts)) return ''
            return parts
                .filter((part: any) => part.text)
                .map((part: any) => part.text)
                .join(' ')
        
        case 'perplexity':
            return response?.choices?.[0]?.message?.content || ''
        
        default:
            return ''
    }
}

/**
 * Build conversation history entry for tool results
 * This creates a properly formatted message for the AI to understand tool outcomes
 */
export function buildToolResultMessage(
    results: ToolCallResult[],
    provider: string
): any {
    const formattedContent = formatToolResultsForConversation(results)
    
    switch (provider) {
        case 'openrouter':
        case 'groq':
        case 'ollama':
            // For OpenAI-compatible APIs, tool results are sent as separate messages
            // with role 'tool' and tool_call_id
            return results.map(result => ({
                role: 'tool',
                tool_call_id: result.toolCall.id,
                content: formatToolResultForConversation(result)
            }))
        
        case 'gemini':
            // Gemini expects function responses in a specific format
            return {
                role: 'function',
                parts: results.map(result => ({
                    functionResponse: {
                        name: result.toolCall.name,
                        response: {
                            success: result.result.success,
                            data: result.result.data,
                            error: result.result.error
                        }
                    }
                }))
            }
        
        default:
            // Fallback: return as user message with tool results
            return {
                role: 'user',
                content: `Tool execution results:\n${formattedContent}`
            }
    }
}

/**
 * Configuration for agent loop execution
 */
export interface AgentLoopConfig {
    maxIterations: number
    onIterationStart?: (iteration: number) => void
    onIterationComplete?: (iteration: number, hasMoreTools: boolean) => void
    onToolStart?: (toolCall: ToolCall) => void
    onToolComplete?: (result: ToolCallResult) => void
    shouldStop?: () => boolean
}

/**
 * Default agent loop configuration
 */
export const DEFAULT_AGENT_LOOP_CONFIG: AgentLoopConfig = {
    maxIterations: 10
}

/**
 * Accumulate tool results from multiple iterations
 * Preserves order of execution for sequential tool execution property
 * 
 * **Feature: agent-mode, Property 6: Sequential tool execution preserves order**
 * **Validates: Requirements 3.4**
 */
export function accumulateToolResults(
    existingResults: ToolCallResult[],
    newResults: ToolCallResult[]
): ToolCallResult[] {
    return [...existingResults, ...newResults]
}

/**
 * Check if any tool result contains an error
 * 
 * **Feature: agent-mode, Property 5: Tool errors are reported**
 * **Validates: Requirements 2.4**
 */
export function hasToolErrors(results: ToolCallResult[]): boolean {
    return results.some(result => !result.result.success)
}

/**
 * Get all error messages from tool results
 */
export function getToolErrors(results: ToolCallResult[]): string[] {
    return results
        .filter(result => !result.result.success)
        .map(result => `${result.toolCall.name}: ${result.result.error || 'Unknown error'}`)
}
