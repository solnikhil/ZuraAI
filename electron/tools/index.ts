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
 * Registry of all tool handlers
 */
const toolHandlers: Record<string, ToolHandler> = {
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
    ipcMain.handle('execute-tool', async (_event, toolName: string, args: any): Promise<ToolResult> => {
        const handler = toolHandlers[toolName]

        if (!handler) {
            return {
                success: false,
                error: `Unknown tool: ${toolName}. Available tools: ${Object.keys(toolHandlers).join(', ')}`
            }
        }

        try {
            return await handler(args)
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Unknown error during tool execution'
            }
        }
    })

    ipcMain.handle('list-tools', () => Object.keys(toolHandlers))
}

/**
 * Add a new tool handler at runtime
 */
export function addToolHandler(name: string, handler: ToolHandler): void {
    toolHandlers[name] = handler
}

/**
 * Remove a tool handler
 */
export function removeToolHandler(name: string): void {
    delete toolHandlers[name]
}
