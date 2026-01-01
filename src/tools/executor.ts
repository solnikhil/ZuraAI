// Tool Executor - Executes tools via IPC to main process

import {
    ToolResult,
    ToolCall,
    ToolCallResult,
    WebSearchData,
    UrlFetchData,
    CalculatorData,
    DateTimeData,
    ClipboardData
} from './types'

// Re-export types for backward compatibility
export type { ToolResult, ToolCall, ToolCallResult }

/**
 * Execute a single tool call via IPC
 */
export async function executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const startTime = performance.now()
    const TIMEOUT_MS = 30000 // 30 second timeout
    
    try {
        if (!window.ipcRenderer) {
            return {
                success: false,
                error: 'IPC not available - tools only work in Electron'
            }
        }
        
        // Add timeout handling
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Tool execution timed out after ${TIMEOUT_MS / 1000} seconds`)), TIMEOUT_MS)
        })
        
        const result = await Promise.race([
            window.ipcRenderer.invoke('execute-tool', toolName, args),
            timeoutPromise
        ])
        
        const executionTime = Math.round(performance.now() - startTime)
        
        return {
            ...result,
            executionTime
        }
    } catch (error: unknown) {
        const executionTime = Math.round(performance.now() - startTime)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error executing tool'
        let formattedMessage = errorMessage
        
        // Provide more user-friendly error messages
        if (formattedMessage.includes('timeout')) {
            formattedMessage = `Tool "${toolName}" took too long to execute. Please try again.`
        } else if (formattedMessage.includes('network') || formattedMessage.includes('fetch')) {
            formattedMessage = `Network error while executing "${toolName}". Please check your internet connection.`
        } else if (formattedMessage.includes('API key') || formattedMessage.includes('authentication')) {
            formattedMessage = `Authentication error for "${toolName}". Please check your API key in Settings.`
        }
        
        return {
            success: false,
            error: formattedMessage,
            executionTime
        }
    }
}

/**
 * Execute a tool call object
 */
export async function executeToolCall(toolCall: ToolCall): Promise<ToolCallResult> {
    try {
        const result = await executeTool(toolCall.name, toolCall.arguments)
        
        return {
            toolCall,
            result
        }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : `Failed to execute ${toolCall.name}`
        console.error(`Error executing tool ${toolCall.name}:`, error)
        return {
            toolCall,
            result: {
                success: false,
                error: errorMessage
            }
        }
    }
}

/**
 * Execute multiple tool calls in parallel
 */
export async function executeToolCalls(toolCalls: ToolCall[]): Promise<ToolCallResult[]> {
    return Promise.all(toolCalls.map(executeToolCall))
}

/**
 * Execute multiple tool calls sequentially
 */
export async function executeToolCallsSequential(toolCalls: ToolCall[]): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = []
    
    for (const toolCall of toolCalls) {
        const result = await executeToolCall(toolCall)
        results.push(result)
    }
    
    return results
}

/**
 * Format tool result for display to user
 */
export function formatToolResultForDisplay(result: ToolCallResult): string {
    const { toolCall, result: toolResult } = result
    
    if (!toolResult.success) {
        return `❌ ${toolCall.name} failed: ${toolResult.error}`
    }
    
    switch (toolCall.name) {
        case 'web_search': {
            const searchData = toolResult.data as WebSearchData | undefined
            if (searchData?.results && searchData.results.length > 0) {
                return `🔍 Found ${searchData.results.length} results for "${toolCall.arguments.query}"`
            }
            return '🔍 No results found'
        }
        
        case 'fetch_url': {
            const urlData = toolResult.data as UrlFetchData | undefined
            const charCount = urlData?.content?.length || 0
            return `🌐 Fetched ${charCount.toLocaleString()} characters from URL`
        }
        
        case 'calculator': {
            const calcData = toolResult.data as CalculatorData | undefined
            return `🔢 ${toolCall.arguments.expression} = ${calcData?.result}`
        }
        
        case 'get_datetime': {
            const dateData = toolResult.data as DateTimeData | undefined
            return `🕐 Current time: ${dateData?.formatted || dateData?.datetime}`
        }
        
        case 'read_clipboard': {
            const clipData = toolResult.data as ClipboardData | undefined
            const clipLength = clipData?.content?.length || 0
            return `📋 Read ${clipLength} characters from clipboard`
        }
        
        case 'write_clipboard':
            return `📋 Copied to clipboard`
        
        default:
            return `✅ ${toolCall.name} completed`
    }
}

