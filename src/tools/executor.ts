// Tool Executor - Executes tools via IPC to main process

import { ToolResult, ToolCall, ToolCallResult, isMcpNamespacedToolName } from './types'
import { resolveWebSearchArgsForExecution } from './webSearchPreferences'
import { executeMemoryTool, isMemoryToolName } from './memoryTools'

// Re-export types for backward compatibility
export type { ToolResult, ToolCall, ToolCallResult }

export interface ExecuteToolOptions {
    userContextText?: string
    bypassNativeApproval?: boolean
    /** Active chat session id (used when memory tools are invoked by the model). */
    sessionId?: string
}

const DEFAULT_TIMEOUT_MS = 30_000
const CODE_EXECUTION_TIMEOUT_MS = 100_000 // 60s approval + 30s OnlineCompiler + buffer

function getTimeoutForTool(toolName: string): number {
    return toolName === 'code_execution' ? CODE_EXECUTION_TIMEOUT_MS : DEFAULT_TIMEOUT_MS
}

function isNativeWindowsToolName(toolName: string): boolean {
    return (
        toolName === 'system_shell' ||
        toolName.startsWith('windows_uia_') ||
        toolName.startsWith('file_') ||
        toolName.startsWith('app_') ||
        toolName.startsWith('window_')
    )
}

/**
 * Execute a single tool call via IPC
 */
export async function executeTool(
    toolName: string,
    args: Record<string, unknown>,
    options: ExecuteToolOptions = {}
): Promise<ToolResult> {
    const startTime = performance.now()
    const TIMEOUT_MS = getTimeoutForTool(toolName)
    
    try {
        if (isMemoryToolName(toolName)) {
            return await executeMemoryTool(toolName, args, { sessionId: options.sessionId })
        }

        if (isMcpNamespacedToolName(toolName)) {
            if (!window.mcp) {
                return {
                    success: false,
                    error: 'MCP bridge is unavailable - MCP tools only work in Electron',
                    executionTime: Math.round(performance.now() - startTime)
                }
            }

            let timeoutId: ReturnType<typeof setTimeout> | undefined
            const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(
                    () => reject(new Error(`Tool execution timed out after ${TIMEOUT_MS / 1000} seconds`)),
                    TIMEOUT_MS
                )
            })

            try {
                const result = await Promise.race([
                    window.mcp.executeTool(toolName, args),
                    timeoutPromise
                ])

                return {
                    ...result,
                    executionTime: Math.round(performance.now() - startTime)
                }
            } finally {
                if (timeoutId) clearTimeout(timeoutId)
            }
        }

        if (!window.ipcRenderer) {
            return {
                success: false,
                error: 'IPC not available - tools only work in Electron'
            }
        }

        const resolvedArgs = resolveWebSearchArgsForExecution(toolName, args, options.userContextText)

        // Inject auto-approve preference for code execution
        if (toolName === 'code_execution') {
            try {
                const raw = localStorage.getItem('zura-settings')
                if (raw) {
                    const parsed = JSON.parse(raw)
                    if (options.bypassNativeApproval || parsed?.codeExecutionAutoApprove === true) {
                        resolvedArgs.autoApprove = true
                    }
                }
            } catch { /* ignore */ }
        }

        if (toolName.startsWith('computer_') && options.bypassNativeApproval) {
            resolvedArgs.autoApprove = true
        }

        if (isNativeWindowsToolName(toolName) && options.bypassNativeApproval) {
            resolvedArgs.autoApprove = true
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
                window.ipcRenderer.invoke('execute-tool', toolName, resolvedArgs),
                timeoutPromise
            ]) as { success: boolean; data?: unknown; error?: string }
        } finally {
            if (timeoutId) clearTimeout(timeoutId)
        }
        
        const executionTime = Math.round(performance.now() - startTime)
        
        return {
            ...result,
            executionTime,
            metadata: {
                origin: 'builtin-main'
            }
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
async function executeToolCall(
    toolCall: ToolCall,
    options: ExecuteToolOptions = {}
): Promise<ToolCallResult> {
    const result = await executeTool(toolCall.name, toolCall.arguments, options)
    return {
        toolCall,
        result
    }
}

/**
 * Execute multiple tool calls in parallel
 */
export async function executeToolCalls(
    toolCalls: ToolCall[],
    options: ExecuteToolOptions = {}
): Promise<ToolCallResult[]> {
    return Promise.all(toolCalls.map((toolCall) => executeToolCall(toolCall, options)))
}
