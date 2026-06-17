// Tool Handlers - Main Process Tool Execution
//
// SECURITY: Only explicitly registered tools are enabled.

import { ipcMain } from 'electron'
import { executeWebSearch } from './webSearch'
import type { WebSearchArgs } from './webSearch'
import { executeCode } from './codeExecution'
import type { CodeExecutionArgs } from './codeExecution'
import {
  executeScreenshot, executeClick, executeType, executeKey, executeScroll, executeCursorPosition, executeListWindows,
} from './computerUse'
import {
  executeWindowsUiaSnapshot,
  executeWindowsUiaInvoke,
  executeWindowsUiaSetValue,
  executeWindowsUiaSelect,
} from './windows-uia'
import { executeSystemShell } from './system-shell'
import { executeFileRead, executeFileWrite, executeFileSearch, executeFileMove } from './files'
import {
  executeAppFind,
  executeAppLaunch,
  executeAppList,
  executeAppInstall,
  executeAppUninstall,
} from './app-management'
import {
  executeWindowList,
  executeWindowFocus,
  executeWindowMove,
  executeWindowClose,
} from './window-management'
import {
  createScheduledTask,
  deleteScheduledTask,
  listRuns as listScheduledTaskRuns,
  listScheduledTasks,
  sanitizeScheduledTaskInput,
  updateScheduledTask,
  getMonitorRuntime,
} from '../monitors'
import type { ScheduledTaskInput, ScheduledTaskUpdateInput } from '../monitors'
import type { ScreenshotArgs, TypeArgs, KeyArgs } from './computerUse'
import { showSpotlight } from '../windows/spotlightOverlay'
import { isBuiltinMainToolName, type BuiltinMainToolName } from '../../src/tools/builtinTools'
import { normalizeClickArgs, normalizeCursorArgs, normalizeScrollArgs } from './computer-use/normalize'

import type { ToolResult, ToolHandler } from './types'
export type { ToolResult, ToolHandler } from './types'

function isComputerUseToolName(toolName: string): boolean {
  return toolName.startsWith('computer_')
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
  return {
    display_id: typeof r.display_id === 'string' ? r.display_id : undefined,
    window_id: typeof r.window_id === 'string' ? r.window_id : undefined,
    window_title: typeof r.window_title === 'string' ? r.window_title : undefined,
    app_name: typeof r.app_name === 'string' ? r.app_name : undefined,
  }
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
  windows_uia_snapshot: executeWindowsUiaSnapshot,
  windows_uia_invoke: executeWindowsUiaInvoke,
  windows_uia_set_value: executeWindowsUiaSetValue,
  windows_uia_select: executeWindowsUiaSelect,
  system_shell: executeSystemShell,
  file_read: executeFileRead,
  file_write: executeFileWrite,
  file_search: executeFileSearch,
  file_move: executeFileMove,
  app_find: executeAppFind,
  app_launch: executeAppLaunch,
  app_list: executeAppList,
  app_install: executeAppInstall,
  app_uninstall: executeAppUninstall,
  scheduled_task_create: async (args) => {
    const task = await createScheduledTask(sanitizeScheduledTaskInput(args) as ScheduledTaskInput)
    await getMonitorRuntime()?.reschedule()
    return { success: true, data: task }
  },
  scheduled_task_update: async (args) => {
    const r = (typeof args === 'object' && args !== null) ? args as Record<string, unknown> : {}
    const id = typeof r.id === 'string' ? r.id.trim() : ''
    if (!id) return { success: false, error: 'Scheduled task id is required.' }
    const patch = { ...r }
    delete patch.id
    const task = await updateScheduledTask(id, sanitizeScheduledTaskInput(patch, true) as ScheduledTaskUpdateInput)
    await getMonitorRuntime()?.reschedule()
    return task ? { success: true, data: task } : { success: false, error: 'Scheduled task not found.' }
  },
  scheduled_task_delete: async (args) => {
    const r = (typeof args === 'object' && args !== null) ? args as Record<string, unknown> : {}
    const id = typeof r.id === 'string' ? r.id.trim() : ''
    if (!id) return { success: false, error: 'Scheduled task id is required.' }
    const deleted = await deleteScheduledTask(id)
    await getMonitorRuntime()?.reschedule()
    return deleted ? { success: true, data: { deleted: true, id } } : { success: false, error: 'Scheduled task not found.' }
  },
  scheduled_task_list: async (args) => {
    const r = (typeof args === 'object' && args !== null) ? args as Record<string, unknown> : {}
    const type = r.type === 'reminder' || r.type === 'web_lookout' ? r.type : undefined
    const tasks = await listScheduledTasks()
    return { success: true, data: type ? tasks.filter((task) => task.type === type) : tasks }
  },
  scheduled_task_get_logs: async (args) => {
    const r = (typeof args === 'object' && args !== null) ? args as Record<string, unknown> : {}
    const id = typeof r.id === 'string' ? r.id.trim() : ''
    if (!id) return { success: false, error: 'Scheduled task id is required.' }
    const limit = typeof r.limit === 'number' && Number.isFinite(r.limit) ? Math.min(Math.max(1, Math.floor(r.limit)), 50) : 20
    const runs = (await listScheduledTaskRuns(id)).slice(0, limit)
    return { success: true, data: runs }
  },
  window_list: executeWindowList,
  window_focus: executeWindowFocus,
  window_move: executeWindowMove,
  window_close: executeWindowClose,
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
      return await handler(args)
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error && error.message ? error.message : 'Unknown error during tool execution',
      }
    }
  })
}
