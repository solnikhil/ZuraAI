// Tool Handlers - Main Process Tool Execution
//
// SECURITY: Only explicitly registered tools are enabled.

import { ipcMain } from 'electron'
import { executeWebSearch } from './webSearch'
import type { WebSearchArgs } from './webSearch'
import { executeCode } from './codeExecution'
import type { CodeExecutionArgs } from './codeExecution'
import {
  executeScreenshot, executeClick, executeType, executeKey, executeScroll, executeCursorPosition, executeListWindows, executeLaunchApp, executeCloseApp, executeFindApp,
} from './computerUse'
import type { ScreenshotArgs, TypeArgs, KeyArgs } from './computerUse'
import { showSpotlight } from '../windows/spotlightOverlay'
import { initializeAgentDesktopService } from '../agentDesktop'
import { getAgentDesktopService } from '../agentDesktop/service'
import { isBuiltinMainToolName, type BuiltinMainToolName } from '../../src/tools/builtinTools'
import { normalizeClickArgs, normalizeCursorArgs, normalizeScrollArgs } from './computer-use/normalize'

import type { ToolResult, ToolHandler } from './types'
export type { ToolResult, ToolHandler } from './types'

function isComputerUseToolName(toolName: string): boolean {
  return toolName.startsWith('computer_')
}

const COMPUTER_ACTION_BY_TOOL: Partial<Record<BuiltinMainToolName, string>> = {
  computer_screenshot: 'screenshot',
  computer_click: 'click',
  computer_type: 'type',
  computer_key: 'key',
  computer_scroll: 'scroll',
  computer_cursor_position: 'cursor_position',
  computer_list_windows: 'list_windows',
  computer_launch_app: 'launch_app',
  computer_find_app: 'find_app',
  computer_close_app: 'close_app',
}

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

function normalizeCodeExecutionArgsInput(args: unknown): CodeExecutionArgs {
  if (typeof args !== 'object' || args === null) {
    return { code: '', language: 'javascript' }
  }

  const record = args as Record<string, unknown>
  const language = record.language === 'python' ? 'python' : 'javascript'

  return {
    code: typeof record.code === 'string' ? record.code : '',
    language,
    autoApprove: record.autoApprove === true,
  }
}

/**
 * Registry of all tool handlers (restricted)
 */

function normalizeScreenshotArgs(args: unknown): ScreenshotArgs {
  const r = (typeof args === 'object' && args !== null) ? args as Record<string, unknown> : {}
  return { display_id: typeof r.display_id === 'string' ? r.display_id : undefined }
}

function normalizeTypeArgs(args: unknown): { args: TypeArgs; autoApprove: boolean } {
  const r = (typeof args === 'object' && args !== null) ? args as Record<string, unknown> : {}
  return { args: { text: typeof r.text === 'string' ? r.text : '' }, autoApprove: r.autoApprove === true }
}

function normalizeKeyArgs(args: unknown): { args: KeyArgs; autoApprove: boolean } {
  const r = (typeof args === 'object' && args !== null) ? args as Record<string, unknown> : {}
  return { args: { key: typeof r.key === 'string' ? r.key : '' }, autoApprove: r.autoApprove === true }
}

const spotlightFn = (opts: { x: number; y: number; label?: string }) => showSpotlight(opts)

const toolHandlers: Record<BuiltinMainToolName, ToolHandler> = {
  web_search: (args) => executeWebSearch(normalizeWebSearchArgsInput(args)),
  code_execution: (args) => executeCode(normalizeCodeExecutionArgsInput(args)),
  computer_screenshot: (args) => executeScreenshot(normalizeScreenshotArgs(args)),
  computer_click: (args) => { const n = normalizeClickArgs(args); return executeClick(n.args, n.autoApprove, spotlightFn) },
  computer_type: (args) => { const n = normalizeTypeArgs(args); return executeType(n.args, n.autoApprove) },
  computer_key: (args) => { const n = normalizeKeyArgs(args); return executeKey(n.args, n.autoApprove) },
  computer_scroll: (args) => { const n = normalizeScrollArgs(args); return executeScroll(n.args, n.autoApprove, spotlightFn) },
  computer_cursor_position: (args) => { const n = normalizeCursorArgs(args); return executeCursorPosition(n.args, n.autoApprove, spotlightFn) },
  computer_list_windows: () => executeListWindows(),
  computer_launch_app: (args) => { const r = (typeof args === 'object' && args !== null) ? args as Record<string, unknown> : {}; return executeLaunchApp({ name: typeof r.name === 'string' ? r.name : '' }) },
  computer_find_app: (args) => { const r = (typeof args === 'object' && args !== null) ? args as Record<string, unknown> : {}; return executeFindApp({ query: typeof r.query === 'string' ? r.query : '' }) },
  computer_close_app: (args) => { const r = (typeof args === 'object' && args !== null) ? args as Record<string, unknown> : {}; return executeCloseApp({ title: typeof r.title === 'string' ? r.title : '' }) },
}

async function executeAgentDesktopComputerTool(
  toolName: BuiltinMainToolName,
  args: unknown
): Promise<ToolResult | null> {
  const action = COMPUTER_ACTION_BY_TOOL[toolName]
  if (!action || process.platform === 'darwin') {
    return null
  }

  const service = getAgentDesktopService()
  await initializeAgentDesktopService()

  const state = service.getState()
  if (!state.enabled) {
    return null
  }

  const readiness = await service.ensureReadyForTool(`agent-desktop-tool-${Date.now()}`)
  if (!readiness.ready) {
    return {
      success: false,
      error: readiness.error,
    }
  }

  let returnToUserDesktopAfterLaunch = false
  if (toolName === 'computer_launch_app' && !readiness.state.agentDesktopDisplayed) {
    const displayed = await service.activateTakeOver()
    if (!displayed.ok) {
      return {
        success: false,
        error:
          displayed.error ||
          'Agent Desktop could not be displayed, so the app launch was blocked to avoid launching on the current desktop.',
      }
    }
    returnToUserDesktopAfterLaunch = true
  }

  const gate = await service.gateComputerAction({
    action,
    args: (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>,
  })

  if (!gate.allow) {
    if (returnToUserDesktopAfterLaunch) {
      await service.endTakeOver()
    }
    return { success: false, error: gate.reason }
  }

  switch (toolName) {
    case 'computer_screenshot':
      return executeScreenshot(normalizeScreenshotArgs(args), gate.desktopOverride)
    case 'computer_click': {
      const n = normalizeClickArgs(args)
      return executeClick(n.args, gate.autoApprove, spotlightFn)
    }
    case 'computer_type': {
      const n = normalizeTypeArgs(args)
      return executeType(n.args, gate.autoApprove)
    }
    case 'computer_key': {
      const n = normalizeKeyArgs(args)
      return executeKey(n.args, gate.autoApprove)
    }
    case 'computer_scroll': {
      const n = normalizeScrollArgs(args)
      return executeScroll(n.args, gate.autoApprove, spotlightFn)
    }
    case 'computer_cursor_position': {
      const n = normalizeCursorArgs(args)
      return executeCursorPosition(n.args, gate.autoApprove, spotlightFn)
    }
    case 'computer_list_windows':
      return executeListWindows()
    case 'computer_launch_app': {
      const r = (typeof args === 'object' && args !== null) ? args as Record<string, unknown> : {}
      try {
        return await executeLaunchApp({ name: typeof r.name === 'string' ? r.name : '' })
      } finally {
        if (returnToUserDesktopAfterLaunch) {
          await service.endTakeOver()
        }
      }
    }
    case 'computer_find_app': {
      const r = (typeof args === 'object' && args !== null) ? args as Record<string, unknown> : {}
      return executeFindApp({ query: typeof r.query === 'string' ? r.query : '' })
    }
    case 'computer_close_app': {
      const r = (typeof args === 'object' && args !== null) ? args as Record<string, unknown> : {}
      return executeCloseApp({ title: typeof r.title === 'string' ? r.title : '' })
    }
    default:
      return null
  }
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

    if (process.platform === 'darwin' && isComputerUseToolName(toolName)) {
      return {
        success: false,
        error: 'Computer Use is disabled on macOS for now.',
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
      if (isComputerUseToolName(toolName)) {
        const agentDesktopResult = await executeAgentDesktopComputerTool(toolName, args)
        if (agentDesktopResult) {
          return agentDesktopResult
        }
      }

      return await handler(args)
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error && error.message ? error.message : 'Unknown error during tool execution',
      }
    }
  })
}
