// Tool Executor - Executes tools via IPC to main process

import { ToolResult, ToolCall, ToolCallResult } from './types'

// Re-export types for backward compatibility
export type { ToolResult, ToolCall, ToolCallResult }

/**
 * Execute a single tool call via IPC
 */
export async function executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const startTime = performance.now()
    const TIMEOUT_MS = toolName === 'run_website_smoke_test' ? 95_000 : 30_000
    
    try {
        if (!window.ipcRenderer) {
            return {
                success: false,
                error: 'IPC not available - tools only work in Electron'
            }
        }
        
        // Add timeout handling (and ensure the timer is cleared)
        let timeoutId: ReturnType<typeof setTimeout> | undefined
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
                () => reject(new Error(`Tool execution timed out after ${TIMEOUT_MS / 1000} seconds`)),
                TIMEOUT_MS
            )
        })

        let result: { success: boolean; data?: unknown; error?: string }
        try {
            result = await Promise.race([
                window.ipcRenderer.invoke('execute-tool', toolName, args),
                timeoutPromise
            ]) as { success: boolean; data?: unknown; error?: string }
        } finally {
            if (timeoutId) clearTimeout(timeoutId)
        }
        
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
async function executeToolCall(toolCall: ToolCall): Promise<ToolCallResult> {
    const result = await executeTool(toolCall.name, toolCall.arguments)
    return {
        toolCall,
        result
    }
}

/**
 * Execute multiple tool calls in parallel
 */
export async function executeToolCalls(toolCalls: ToolCall[]): Promise<ToolCallResult[]> {
    return Promise.all(toolCalls.map(executeToolCall))
}
