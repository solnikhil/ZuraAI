// Tool Handlers - Main Process Tool Execution
//
// SECURITY: Only "web_search" is enabled.

import { ipcMain } from 'electron'
import { executeWebSearch } from './webSearch'

import type { ToolResult, ToolHandler } from './types'
export type { ToolResult, ToolHandler } from './types'

/**
 * Registry of all tool handlers (restricted)
 */
const toolHandlers: Record<string, ToolHandler> = {
  web_search: executeWebSearch,
}

/**
 * Register tool IPC handlers
 * Call this from main.ts during app initialization
 */
export function registerToolHandlers(): void {
  ipcMain.handle('execute-tool', async (_event, toolName: string, args: any): Promise<ToolResult> => {
    if (toolName !== 'web_search') {
      return {
        success: false,
        error: `Tool "${String(toolName)}" is disabled. Only "web_search" is available.`
      }
    }

    const handler = toolHandlers[toolName]
    if (!handler) {
      return {
        success: false,
        error: 'Tool handler not found'
      }
    }

    try {
      return await handler(args)
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Unknown error during tool execution'
      }
    }
  })
}
