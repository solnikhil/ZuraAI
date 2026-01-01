// Tool Handlers - Main Process Tool Execution

import { ipcMain } from 'electron'
import { executeWebSearch } from './webSearch'
import { executeFetchUrl } from './urlFetcher'
import { executeCalculator } from './calculator'
import { executeDatetime } from './datetime'
import { executeReadClipboard, executeWriteClipboard } from './clipboard'

import type { ToolResult, ToolHandler } from './types'
export type { ToolResult, ToolHandler } from './types'

/**
 * Registry of all tool handlers - MINIMAL VERSION FOR DEBUGGING
 */
const toolHandlers: Record<string, ToolHandler> = {
    // Existing tools
    web_search: executeWebSearch,
    fetch_url: executeFetchUrl,
    get_datetime: executeDatetime,
    calculator: executeCalculator,
    read_clipboard: executeReadClipboard,
    write_clipboard: executeWriteClipboard,
}

/**
 * Register all tool IPC handlers
 * Call this from main.ts during app initialization
 */
export function registerToolHandlers(): void {
    // Main tool execution handler
    ipcMain.handle('execute-tool', async (_event, toolName: string, args: any): Promise<ToolResult> => {
        console.log(`[TOOL] Executing: ${toolName}`, args)

        const handler = toolHandlers[toolName]

        if (!handler) {
            console.error(`[TOOL] Unknown tool: ${toolName}`)
            return {
                success: false,
                error: `Unknown tool: ${toolName}. Available tools: ${Object.keys(toolHandlers).join(', ')}`
            }
        }

        try {
            const startTime = Date.now()
            const result = await handler(args)
            const duration = Date.now() - startTime

            console.log(`[TOOL] ${toolName} completed in ${duration}ms`, result.success ? '✓' : '✗')

            return result
        } catch (error: any) {
            console.error(`[TOOL] ${toolName} failed:`, error)

            return {
                success: false,
                error: error.message || 'Unknown error during tool execution'
            }
        }
    })

    // Handler to list available tools
    ipcMain.handle('list-tools', () => {
        return Object.keys(toolHandlers)
    })

    console.log('[TOOLS] Registered handlers:', Object.keys(toolHandlers).join(', '))
}

/**
 * Add a new tool handler at runtime
 */
export function addToolHandler(name: string, handler: ToolHandler): void {
    toolHandlers[name] = handler
    console.log(`[TOOLS] Added handler: ${name}`)
}

/**
 * Remove a tool handler
 */
export function removeToolHandler(name: string): void {
    delete toolHandlers[name]
    console.log(`[TOOLS] Removed handler: ${name}`)
}
