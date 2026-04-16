// Tool Handlers - Main Process Tool Execution
//
// SECURITY: Only explicitly registered tools are enabled.

import { ipcMain } from 'electron'
import { executeWebSearch } from './webSearch'
import type { WebSearchArgs } from './webSearch'
import { isBuiltinMainToolName, type BuiltinMainToolName } from '../../src/tools/builtinTools'

import type { ToolResult, ToolHandler } from './types'
export type { ToolResult, ToolHandler } from './types'

function normalizeWebSearchArgsInput(args: unknown): WebSearchArgs {
  if (typeof args !== 'object' || args === null) {
    return { query: '' }
  }

  const record = args as Record<string, unknown>

  const parseNumResults = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }

    return undefined
  }

  const parseSearchDepth = (
    value: unknown
  ): WebSearchArgs['search_depth'] | undefined => {
    if (value === 'ultra-fast' || value === 'fast' || value === 'basic' || value === 'advanced') {
      return value
    }

    return undefined
  }

  const parseTimeRange = (value: unknown): WebSearchArgs['time_range'] | undefined => {
    if (value === 'day' || value === 'week' || value === 'month' || value === 'year') {
      return value
    }

    return undefined
  }

  const parseTopic = (value: unknown): WebSearchArgs['topic'] | undefined => {
    if (value === 'general' || value === 'news' || value === 'finance') {
      return value
    }

    return undefined
  }

  const urls = Array.isArray(record.urls)
    ? record.urls.filter((value): value is string => typeof value === 'string')
    : undefined

  return {
    query: typeof record.query === 'string' ? record.query : '',
    num_results: parseNumResults(record.num_results),
    search_depth: parseSearchDepth(record.search_depth),
    time_range: parseTimeRange(record.time_range),
    topic: parseTopic(record.topic),
    include_images: typeof record.include_images === 'boolean' ? record.include_images : undefined,
    urls,
  }
}

/**
 * Registry of all tool handlers (restricted)
 */
const toolHandlers: Record<BuiltinMainToolName, ToolHandler> = {
  web_search: (args) => executeWebSearch(normalizeWebSearchArgsInput(args)),
}

/**
 * Register tool IPC handlers
 * Call this from main.ts during app initialization
 */
export function registerToolHandlers(): void {
  ipcMain.handle('execute-tool', async (_event, toolName: string, args: unknown): Promise<ToolResult> => {
    if (!isBuiltinMainToolName(toolName)) {
      return {
        success: false,
        error: `Tool "${String(toolName)}" is disabled.`
      }
    }

    const handler = toolHandlers[toolName]

    if (!handler) {
      return {
        success: false,
        error: `Tool "${String(toolName)}" is disabled.`
      }
    }

    try {
      return await handler(args)
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error && error.message ? error.message : 'Unknown error during tool execution',
      }
    }
  })
}
