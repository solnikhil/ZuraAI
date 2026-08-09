// Tool Handlers - Main Process Tool Execution
//
// SECURITY: Only explicitly registered tools are enabled.

import { trustedIpcMain as ipcMain } from '../ipc/trustedIpc'
import { executeWebSearch } from './webSearch'
import type { WebSearchArgs } from './webSearch'
import { executeCode } from './codeExecution'
import type { CodeExecutionArgs } from './codeExecution'
import {
  executeScreenshot,
  executeClick,
  executeType,
  executeKey,
  executeScroll,
  executeCursorPosition,
  executeListWindows,
  releaseActionBudget,
} from './computerUse'
import {
  executeWindowsUiaSnapshot,
  executeWindowsUiaInvoke,
  executeWindowsUiaSetValue,
  executeWindowsUiaSelect,
} from './windows-uia'
import {
  executeUiGetAppState,
  executeUiFind,
  executeUiWaitFor,
  executeUiClick,
  executeUiTypeText,
  executeUiSetValue,
  executeUiSelect,
  executeUiScroll,
  executeUiFocus,
  executeUiKey,
  getUiAutomationElementTarget,
} from './ui-automation'
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
  executeSystemActiveWindow,
  executeSystemStatus,
  executeSystemSettingsOpen,
  executeSystemOpenPath,
  executeWindowSnap,
} from './os-integration'
import { createMcpAddRequest } from '../mcp/mcpAddRequests'
import {
  createScheduledTask,
  deleteScheduledTask,
  listRuns as listScheduledTaskRuns,
  listScheduledTasks,
  sanitizeScheduledTaskInput,
  updateScheduledTask,
  getMonitorRuntime,
  isMonitorRuntimeExtensionEnabled,
} from '../monitors'
import type { ScheduledTaskInput, ScheduledTaskUpdateInput } from '../monitors'
import type { ScreenshotArgs, TypeArgs, KeyArgs } from './computerUse'
import { showSpotlight } from '../windows/spotlightOverlay'
import {
  isBuiltinMainToolName,
  type BuiltinMainToolName,
} from '../../src/tools/builtinMainToolContract'
import {
  normalizeClickArgs,
  normalizeCursorArgs,
  normalizeScrollArgs,
} from './computer-use/normalize'
import { activateAgentSkill } from '../agentSkills/service'
import { validateBuiltinToolInvocation } from './validateBuiltinToolInvocation'
import { consumeToolApprovalAuthorization } from './toolApprovalAuthorizations'
import type { BuiltinToolExecutionContext } from '../../src/electron/types'
import { backgroundWindowCoordinator } from './background-window'
import {
  backgroundWindowFocusBlocked,
  backgroundWindowPhysicalInputBlocked,
  normalizeBackgroundScreenshotResult,
  scopeScreenshotToBackgroundTarget,
} from './background-window/toolPolicy'
import { registerKillSwitch, unregisterKillSwitch } from './computer-use/killSwitch'
import { requireApproval } from './native-common'

import type { ToolResult, ToolHandler, ToolHandlerContext } from './types'
export type { ToolResult, ToolHandler } from './types'

const SCHEDULED_TASK_TOOL_NAMES = new Set<string>([
  'scheduled_task_create',
  'scheduled_task_update',
  'scheduled_task_delete',
  'scheduled_task_list',
  'scheduled_task_get_logs',
])

const observedToolSenders = new Set<number>()
const FOREGROUND_FALLBACK_PERMIT_TTL_MS = 30_000
const foregroundFallbackPermits = new Map<string, number>()
/** Computer Use session keys seen from each renderer, for teardown cleanup. */
const trackedComputerSessionKeys = new Set<string>()

function grantForegroundFallbackPermit(context?: ToolHandlerContext): void {
  foregroundFallbackPermits.set(
    computerSessionKey(context),
    Date.now() + FOREGROUND_FALLBACK_PERMIT_TTL_MS
  )
}

function clearForegroundFallbackPermit(context?: ToolHandlerContext): void {
  foregroundFallbackPermits.delete(computerSessionKey(context))
}

function consumeForegroundFallbackPermit(context?: ToolHandlerContext): boolean {
  const key = computerSessionKey(context)
  const expiresAt = foregroundFallbackPermits.get(key)
  foregroundFallbackPermits.delete(key)
  return typeof expiresAt === 'number' && expiresAt >= Date.now()
}

function observeToolSender(sender: {
  id: number
  once?: (event: 'destroyed', listener: () => void) => unknown
}): void {
  if (observedToolSenders.has(sender.id) || typeof sender.once !== 'function') return
  observedToolSenders.add(sender.id)
  sender.once('destroyed', () => {
    observedToolSenders.delete(sender.id)
    releaseSenderComputerBudgets(sender.id)
    void backgroundWindowCoordinator.releaseSender(sender.id)
  })
}

function requireBackgroundOwner(context?: ToolHandlerContext): {
  runId: string
  senderWebContentsId: number
} {
  if (!context?.runId || context.senderWebContentsId <= 0) {
    throw new Error('Background window tools require an active Agent run.')
  }
  return { runId: context.runId, senderWebContentsId: context.senderWebContentsId }
}

function scopeToReservedWindow(
  args: unknown,
  context?: ToolHandlerContext
): Record<string, unknown> {
  const record = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
  if (!context?.runId) return record
  const target = backgroundWindowCoordinator.status(requireBackgroundOwner(context))
  return target ? { ...record, hwnd: target.hwnd } : record
}

function assertElementOwnedByReservedWindow(
  args: unknown,
  context?: ToolHandlerContext
): ToolResult | null {
  if (!context?.runId) return null
  const target = backgroundWindowCoordinator.status(requireBackgroundOwner(context))
  if (!target) return null
  const elementTarget = getUiAutomationElementTarget(args)
  if (!elementTarget) return null
  if (elementTarget.hwnd === target.hwnd && elementTarget.processId === target.processId)
    return null
  return {
    success: false,
    data: {
      status: 'blocked',
      reason: 'target_mismatch',
      message: "The UI element does not belong to this run's reserved background window.",
    },
    error: 'The UI element does not belong to the reserved background window.',
  }
}

async function executeReservedUiAction(
  handler: (args: unknown) => Promise<ToolResult>,
  args: unknown,
  context?: ToolHandlerContext
): Promise<ToolResult> {
  const ownershipError = assertElementOwnedByReservedWindow(args, context)
  if (ownershipError) return ownershipError
  return handler(args)
}

async function attachBackgroundWindowForRun(hwnd: number, context?: ToolHandlerContext) {
  clearForegroundFallbackPermit(context)
  const owner = requireBackgroundOwner(context)
  const notifyRunStopped = (payload: {
    runId: string
    reason: 'stop-and-release' | 'stop-task' | 'target-lost' | 'overlay-failed'
  }) => context?.sendToRenderer?.('background-window:run-stopped', payload)
  const target = await backgroundWindowCoordinator.attach(
    owner,
    hwnd,
    notifyRunStopped,
    unregisterKillSwitch
  )
  registerKillSwitch(() => {
    notifyRunStopped({ runId: owner.runId, reason: 'stop-task' })
    void backgroundWindowCoordinator.release(owner, 'run-cancelled')
  })
  return target
}

async function releaseGuardForForegroundAction(context?: ToolHandlerContext): Promise<void> {
  if (!context?.runId) return
  await backgroundWindowCoordinator.release(requireBackgroundOwner(context), 'user-release')
}

const MAX_TRACKED_COMPUTER_SESSIONS = 256

function computerSessionKey(context?: ToolHandlerContext): string {
  if (!context?.runId) return 'unscoped'
  const key = `${context.senderWebContentsId}:${context.runId}`
  // Remembered so a destroyed renderer's budgets can be released by prefix.
  trackedComputerSessionKeys.add(key)
  while (trackedComputerSessionKeys.size > MAX_TRACKED_COMPUTER_SESSIONS) {
    const oldest = trackedComputerSessionKeys.values().next().value
    if (typeof oldest !== 'string') break
    trackedComputerSessionKeys.delete(oldest)
    releaseActionBudget(oldest)
  }
  return key
}

/**
 * Terminal cleanup: a destroyed renderer can never continue its Computer Use
 * runs, so their action budgets must not linger.
 */
function releaseSenderComputerBudgets(senderWebContentsId: number): void {
  for (const key of trackedComputerSessionKeys) {
    if (key.startsWith(`${senderWebContentsId}:`)) {
      releaseActionBudget(key)
      trackedComputerSessionKeys.delete(key)
    }
  }
}

async function executeReservedScreenshot(
  args: unknown,
  context?: ToolHandlerContext
): Promise<ToolResult> {
  const normalizedArgs = normalizeScreenshotArgs(args)
  if (!context?.runId) {
    return executeScreenshot(normalizedArgs, {
      sessionKey: computerSessionKey(context),
    })
  }
  const target = backgroundWindowCoordinator.status(requireBackgroundOwner(context))
  if (normalizedArgs.reserve_background === false && target) {
    return {
      success: false,
      error:
        'Foreground fallback capture requires releasing the active background reservation first.',
      data: {
        status: 'blocked',
        reason: 'background_release_required',
        hwnd: target.hwnd,
      },
    }
  }
  if (!target) {
    if (normalizedArgs.reserve_background === false && !consumeForegroundFallbackPermit(context)) {
      return {
        success: false,
        error:
          'reserve_background=false requires a fresh successful background_window_release in this Agent run.',
        data: {
          status: 'blocked',
          reason: 'foreground_fallback_not_authorized',
        },
      }
    }
    const result = await executeScreenshot(normalizedArgs, {
      sessionKey: computerSessionKey(context),
    })
    const capturedTarget = (
      result.data as { target?: { type?: unknown; hwnd?: unknown } } | undefined
    )?.target
    if (
      normalizedArgs.reserve_background !== false &&
      result.success &&
      capturedTarget?.type === 'window' &&
      typeof capturedTarget.hwnd === 'number' &&
      capturedTarget.hwnd > 0
    ) {
      const reserved = await attachBackgroundWindowForRun(Math.trunc(capturedTarget.hwnd), context)
      return {
        ...result,
        data: {
          ...(result.data as Record<string, unknown>),
          backgroundReservation: {
            status: 'attached',
            automatic: true,
            target: reserved,
          },
        },
      }
    }
    return result
  }
  // The attach lifecycle already owns Esc+Esc. Do not replace its callback with the
  // ordinary foreground Computer Use abort handler just to take a read-only capture.
  const result = await executeScreenshot(scopeScreenshotToBackgroundTarget(target), {
    registerEmergencyStop: false,
    sessionKey: computerSessionKey(context),
  })
  return normalizeBackgroundScreenshotResult(result, target)
}

async function executeWindowFocusWithBackgroundGuard(
  args: unknown,
  context?: ToolHandlerContext
): Promise<ToolResult> {
  if (context?.runId) {
    const target = backgroundWindowCoordinator.status(requireBackgroundOwner(context))
    if (target) return backgroundWindowFocusBlocked(target)
    const approval = requireApproval(args, 'window_focus')
    if (approval) return approval
    const record =
      typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
    const hwnd = typeof record.hwnd === 'number' ? Math.trunc(record.hwnd) : 0
    if (hwnd <= 0) {
      return {
        success: false,
        error:
          'Agent Mode will not focus a title-matched window. Inspect the app to obtain its exact HWND and reserve it for background work.',
        data: {
          status: 'foreground_required',
          action: 'window_focus',
          reason: 'An exact HWND is required for background ownership.',
        },
      }
    }
    const reserved = await attachBackgroundWindowForRun(hwnd, context)
    const observation = await executeUiGetAppState({ hwnd: reserved.hwnd })
    return {
      success: true,
      data: {
        status: 'background_attached',
        requestedAction: 'window_focus',
        focusChanged: false,
        target: reserved,
        observation: observation.data,
      },
    }
  }
  return executeWindowFocus(args)
}

function isComputerUseToolName(toolName: string): boolean {
  return (
    toolName.startsWith('computer_') ||
    toolName.startsWith('ui_') ||
    toolName.startsWith('background_window_')
  )
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

  const parseSearchDepth = (value: unknown): WebSearchArgs['search_depth'] | undefined => {
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
  const r = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
  return {
    display_id: typeof r.display_id === 'string' ? r.display_id : undefined,
    window_id: typeof r.window_id === 'string' ? r.window_id : undefined,
    window_title: typeof r.window_title === 'string' ? r.window_title : undefined,
    app_name: typeof r.app_name === 'string' ? r.app_name : undefined,
    reserve_background: r.reserve_background !== false,
  }
}

function normalizeTypeArgs(args: unknown): { args: TypeArgs; autoApprove: boolean } {
  const r = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
  return {
    args: {
      screenshot_id: typeof r.screenshot_id === 'string' ? r.screenshot_id : '',
      text: typeof r.text === 'string' ? r.text : '',
    },
    autoApprove: r.autoApprove === true,
  }
}

function normalizeKeyArgs(args: unknown): { args: KeyArgs; autoApprove: boolean } {
  const r = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
  return {
    args: {
      screenshot_id: typeof r.screenshot_id === 'string' ? r.screenshot_id : '',
      key: typeof r.key === 'string' ? r.key : '',
    },
    autoApprove: r.autoApprove === true,
  }
}

const spotlightFn = (opts: { x: number; y: number; label?: string }) => showSpotlight(opts)

const toolHandlers: Record<BuiltinMainToolName, ToolHandler> = {
  web_search: (args) => executeWebSearch(normalizeWebSearchArgsInput(args)),
  code_execution: (args) => executeCode(normalizeCodeExecutionArgsInput(args)),
  activate_skill: async (args) => {
    const r = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
    const name = typeof r.name === 'string' ? r.name : ''
    const settings =
      typeof r._agentSkills === 'object' && r._agentSkills !== null
        ? (r._agentSkills as Record<string, unknown>)
        : {}
    const result = await activateAgentSkill(name, {
      projectRoot: typeof settings.projectRoot === 'string' ? settings.projectRoot : undefined,
      disabledSkillNames: Array.isArray(settings.disabledSkillNames)
        ? settings.disabledSkillNames.filter((value): value is string => typeof value === 'string')
        : undefined,
    })
    return { success: true, data: result }
  },
  mcp_request_add: async (args) => {
    return { success: true, data: createMcpAddRequest(args) }
  },
  background_window_attach: async (args, context) => {
    const approval = requireApproval(args, 'background_window_attach')
    if (approval) return approval
    const hwnd =
      typeof args === 'object' &&
      args !== null &&
      typeof (args as Record<string, unknown>).hwnd === 'number'
        ? Math.trunc((args as Record<string, unknown>).hwnd as number)
        : 0
    const target = await attachBackgroundWindowForRun(hwnd, context)
    const state = await executeUiGetAppState({ hwnd: target.hwnd })
    return { success: true, data: { status: 'attached', target, observation: state.data } }
  },
  background_window_status: async (_args, context) => {
    const target = backgroundWindowCoordinator.status(requireBackgroundOwner(context))
    return { success: true, data: { active: Boolean(target), target } }
  },
  background_window_release: async (_args, context) => {
    const released = await backgroundWindowCoordinator.release(
      requireBackgroundOwner(context),
      'user-release'
    )
    if (released) grantForegroundFallbackPermit(context)
    return { success: true, data: { released } }
  },
  computer_screenshot: executeReservedScreenshot,
  computer_click: async (args, context) => {
    const n = normalizeClickArgs(args)
    const hasBackgroundReservation = Boolean(
      context?.runId && backgroundWindowCoordinator.status(requireBackgroundOwner(context))
    )
    return executeClick(
      n.args,
      n.autoApprove,
      spotlightFn,
      computerSessionKey(context),
      () => releaseGuardForForegroundAction(context),
      !hasBackgroundReservation
    )
  },
  computer_type: async (args, context) => {
    if (context?.runId) {
      const target = backgroundWindowCoordinator.status(requireBackgroundOwner(context))
      if (target) return backgroundWindowPhysicalInputBlocked(target, 'computer_type')
    }
    const n = normalizeTypeArgs(args)
    return executeType(n.args, n.autoApprove, computerSessionKey(context))
  },
  computer_key: async (args, context) => {
    if (context?.runId) {
      const target = backgroundWindowCoordinator.status(requireBackgroundOwner(context))
      if (target) return backgroundWindowPhysicalInputBlocked(target, 'computer_key')
    }
    const n = normalizeKeyArgs(args)
    return executeKey(n.args, n.autoApprove, computerSessionKey(context))
  },
  computer_scroll: async (args, context) => {
    if (context?.runId) {
      const target = backgroundWindowCoordinator.status(requireBackgroundOwner(context))
      if (target) return backgroundWindowPhysicalInputBlocked(target, 'computer_scroll')
    }
    const n = normalizeScrollArgs(args)
    return executeScroll(n.args, n.autoApprove, spotlightFn, computerSessionKey(context))
  },
  computer_cursor_position: async (args, context) => {
    if (context?.runId) {
      const target = backgroundWindowCoordinator.status(requireBackgroundOwner(context))
      if (target) return backgroundWindowPhysicalInputBlocked(target, 'computer_cursor_position')
    }
    const n = normalizeCursorArgs(args)
    return executeCursorPosition(n.args, n.autoApprove, spotlightFn, computerSessionKey(context))
  },
  computer_list_windows: () => executeListWindows(),
  ui_get_app_state: (args, context) => executeUiGetAppState(scopeToReservedWindow(args, context)),
  ui_find: (args, context) => executeUiFind(scopeToReservedWindow(args, context)),
  ui_wait_for: (args, context) => executeUiWaitFor(scopeToReservedWindow(args, context)),
  ui_click: (args, context) => executeReservedUiAction(executeUiClick, args, context),
  ui_type_text: (args, context) => executeReservedUiAction(executeUiTypeText, args, context),
  ui_set_value: (args, context) => executeReservedUiAction(executeUiSetValue, args, context),
  ui_select: (args, context) => executeReservedUiAction(executeUiSelect, args, context),
  ui_scroll: (args, context) => executeReservedUiAction(executeUiScroll, args, context),
  ui_focus: executeUiFocus,
  ui_key: executeUiKey,
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
    const r = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
    const id = typeof r.id === 'string' ? r.id.trim() : ''
    if (!id) return { success: false, error: 'Scheduled task id is required.' }
    const patch = { ...r }
    delete patch.id
    const task = await updateScheduledTask(
      id,
      sanitizeScheduledTaskInput(patch, true) as ScheduledTaskUpdateInput
    )
    await getMonitorRuntime()?.reschedule()
    return task
      ? { success: true, data: task }
      : { success: false, error: 'Scheduled task not found.' }
  },
  scheduled_task_delete: async (args) => {
    const r = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
    const id = typeof r.id === 'string' ? r.id.trim() : ''
    if (!id) return { success: false, error: 'Scheduled task id is required.' }
    const deleted = await deleteScheduledTask(id)
    await getMonitorRuntime()?.reschedule()
    return deleted
      ? { success: true, data: { deleted: true, id } }
      : { success: false, error: 'Scheduled task not found.' }
  },
  scheduled_task_list: async (args) => {
    const r = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
    const type =
      r.type === 'reminder' || r.type === 'web_lookout' || r.type === 'ai_automation'
        ? r.type
        : undefined
    const tasks = await listScheduledTasks()
    return { success: true, data: type ? tasks.filter((task) => task.type === type) : tasks }
  },
  scheduled_task_get_logs: async (args) => {
    const r = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
    const id = typeof r.id === 'string' ? r.id.trim() : ''
    if (!id) return { success: false, error: 'Scheduled task id is required.' }
    const limit =
      typeof r.limit === 'number' && Number.isFinite(r.limit)
        ? Math.min(Math.max(1, Math.floor(r.limit)), 50)
        : 20
    const runs = (await listScheduledTaskRuns(id)).slice(0, limit)
    return { success: true, data: runs }
  },
  window_list: executeWindowList,
  window_focus: executeWindowFocusWithBackgroundGuard,
  window_move: executeWindowMove,
  window_close: executeWindowClose,
  system_active_window: executeSystemActiveWindow,
  system_status: executeSystemStatus,
  system_settings_open: executeSystemSettingsOpen,
  system_open_path: executeSystemOpenPath,
  window_snap: executeWindowSnap,
}

/**
 * Register tool IPC handlers
 * Call this from main.ts during app initialization
 */
export function registerToolHandlers(): void {
  ipcMain.handle(
    'background-window:release-run',
    async (event, runId: unknown, outcome: unknown): Promise<boolean> => {
      if (typeof runId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(runId)) {
        throw new Error('Invalid background window run id.')
      }
      if (outcome !== 'completed' && outcome !== 'cancelled' && outcome !== 'failed') {
        throw new Error('Invalid background window run outcome.')
      }
      observeToolSender(event.sender)
      return backgroundWindowCoordinator.release(
        { runId, senderWebContentsId: event.sender.id },
        outcome === 'completed'
          ? 'run-finished'
          : outcome === 'cancelled'
            ? 'run-cancelled'
            : 'run-failed'
      )
    }
  )

  ipcMain.handle(
    'execute-tool',
    async (
      event,
      toolName: string,
      args: unknown,
      executionContext?: BuiltinToolExecutionContext
    ): Promise<ToolResult> => {
      if (!isBuiltinMainToolName(toolName)) {
        return {
          success: false,
          error: `Tool "${String(toolName)}" is disabled.`,
        }
      }

      const validation = validateBuiltinToolInvocation(toolName, args)
      if (!validation.ok) {
        return { success: false, error: validation.error }
      }

      if (process.platform === 'darwin' && isComputerUseToolName(toolName)) {
        return {
          success: false,
          error: 'Computer Use is disabled on macOS for now.',
        }
      }

      if (SCHEDULED_TASK_TOOL_NAMES.has(toolName) && !isMonitorRuntimeExtensionEnabled()) {
        return {
          success: false,
          error: 'Reminders & Lookouts extension is disabled.',
        }
      }

      const handler = toolHandlers[toolName]

      if (!handler) {
        return {
          success: false,
          error: `Tool "${String(toolName)}" is disabled.`,
        }
      }

      try {
        const senderId = event.sender?.id ?? -1
        if (event.sender && senderId >= 0) observeToolSender(event.sender)
        if (
          executionContext?.runId !== undefined &&
          (typeof executionContext.runId !== 'string' ||
            !/^[A-Za-z0-9_-]{1,128}$/.test(executionContext.runId))
        ) {
          return { success: false, error: 'Invalid tool execution run id.' }
        }
        const approved = consumeToolApprovalAuthorization(
          executionContext?.approvalToken,
          senderId,
          toolName,
          validation.args
        )
        const handlerArgs: Record<string, unknown> = {
          ...validation.args,
          ...(approved ? { autoApprove: true } : {}),
          ...(toolName === 'activate_skill' && executionContext?.agentSkills
            ? { _agentSkills: executionContext.agentSkills }
            : {}),
        }
        const runId = executionContext?.runId
        return runId
          ? await handler(handlerArgs, {
              senderWebContentsId: senderId,
              runId,
              sendToRenderer: (channel, payload) => event.sender.send(channel, payload),
            })
          : await handler(handlerArgs)
      } catch (error: unknown) {
        return {
          success: false,
          error:
            error instanceof Error && error.message
              ? error.message
              : 'Unknown error during tool execution',
        }
      }
    }
  )
}

export function unregisterToolHandlers(): void {
  ipcMain.removeHandler('execute-tool')
  ipcMain.removeHandler('background-window:release-run')
  observedToolSenders.clear()
  for (const key of trackedComputerSessionKeys) releaseActionBudget(key)
  trackedComputerSessionKeys.clear()
  void backgroundWindowCoordinator.dispose()
}
