// Tool Executor - Executes tools via IPC to main process

export interface ToolResult {
    success: boolean
    data?: any
    error?: string
    executionTime?: number
}

export interface ToolCall {
    id: string
    name: string
    arguments: Record<string, any>
}

export interface ToolCallResult {
    toolCall: ToolCall
    result: ToolResult
}

/**
 * Execute a single tool call via IPC
 */
export async function executeTool(toolName: string, args: Record<string, any>): Promise<ToolResult> {
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
    } catch (error: any) {
        const executionTime = Math.round(performance.now() - startTime)
        let errorMessage = error.message || 'Unknown error executing tool'
        
        // Provide more user-friendly error messages
        if (errorMessage.includes('timeout')) {
            errorMessage = `Tool "${toolName}" took too long to execute. Please try again.`
        } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
            errorMessage = `Network error while executing "${toolName}". Please check your internet connection.`
        } else if (errorMessage.includes('API key') || errorMessage.includes('authentication')) {
            errorMessage = `Authentication error for "${toolName}". Please check your API key in Settings.`
        }
        
        return {
            success: false,
            error: errorMessage,
            executionTime
        }
    }
}

/**
 * Execute a tool call object
 */
export async function executeToolCall(toolCall: ToolCall): Promise<ToolCallResult> {
    // #region agent log
    {(() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/tools/executor.ts:executeToolCall',message:'Executing tool call',data:{toolName:toolCall.name,args:toolCall.arguments},timestamp:Date.now(),sessionId:'debug-session',runId:'black-screen-fix',hypothesisId:'A'})}).catch(()=>{}); } catch {} return null })()}
    // #endregion
    
    try {
        const result = await executeTool(toolCall.name, toolCall.arguments)
        
        // #region agent log
        {(() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/tools/executor.ts:executeToolCall:success',message:'Tool call executed successfully',data:{toolName:toolCall.name,success:result.success,hasError:!!result.error},timestamp:Date.now(),sessionId:'debug-session',runId:'black-screen-fix',hypothesisId:'A'})}).catch(()=>{}); } catch {} return null })()}
        // #endregion
        
        return {
            toolCall,
            result
        }
    } catch (error: any) {
        // #region agent log
        {(() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/tools/executor.ts:executeToolCall:error',message:'Tool call execution error',data:{toolName:toolCall.name,errorMessage:error?.message,errorType:error?.constructor?.name,stack:error?.stack?.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'black-screen-fix',hypothesisId:'A'})}).catch(()=>{}); } catch {} return null })()}
        // #endregion
        
        console.error(`Error executing tool ${toolCall.name}:`, error)
        return {
            toolCall,
            result: {
                success: false,
                error: error.message || `Failed to execute ${toolCall.name}`
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
        case 'web_search':
            const searchData = toolResult.data
            if (searchData?.results?.length > 0) {
                return `🔍 Found ${searchData.results.length} results for "${toolCall.arguments.query}"`
            }
            return '🔍 No results found'
        
        case 'fetch_url':
            const urlData = toolResult.data
            const charCount = urlData?.content?.length || 0
            return `🌐 Fetched ${charCount.toLocaleString()} characters from URL`
        
        case 'calculator':
            return `🔢 ${toolCall.arguments.expression} = ${toolResult.data?.result}`
        
        case 'get_datetime':
            return `🕐 Current time: ${toolResult.data?.formatted || toolResult.data?.datetime}`
        
        case 'read_clipboard':
            const clipLength = toolResult.data?.content?.length || 0
            return `📋 Read ${clipLength} characters from clipboard`
        
        case 'write_clipboard':
            return `📋 Copied to clipboard`
        
        default:
            return `✅ ${toolCall.name} completed`
    }
}

/**
 * Format tool result for sending back to AI
 */
export function formatToolResultForAI(result: ToolCallResult): string {
    const { toolCall, result: toolResult } = result
    
    if (!toolResult.success) {
        return `Tool "${toolCall.name}" failed with error: ${toolResult.error}`
    }
    
    // Return structured data for AI to process
    return JSON.stringify({
        tool: toolCall.name,
        arguments: toolCall.arguments,
        result: toolResult.data
    }, null, 2)
}

