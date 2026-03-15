// Tool Handlers - Main Process Tool Execution
//
// SECURITY: Only explicitly registered tools are enabled.

import { ipcMain } from 'electron'
import { executeWebSearch } from './webSearch'
import type { WebSearchArgs } from './webSearch'

import type { ToolResult, ToolHandler } from './types'
export type { ToolResult, ToolHandler } from './types'

/**
 * Registry of all tool handlers (restricted)
 */
const toolHandlers: Record<string, ToolHandler> = {
  web_search: (args) => executeWebSearch(args as WebSearchArgs),
}

/**
 * Register tool IPC handlers
 * Call this from main.ts during app initialization
 */
export function registerToolHandlers(): void {
  ipcMain.handle('execute-tool', async (_event, toolName: string, args: unknown): Promise<ToolResult> => {
    const handler = toolHandlers[toolName]

    if (!handler) {
      return {
        success: false,
        error: `Tool "${String(toolName)}" is disabled.`
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
