import type { ToolResult } from '../types'
import { createHash, randomUUID } from 'crypto'
import type {
  ScreenshotArgs,
  ClickArgs,
  TypeArgs,
  KeyArgs,
  ScrollArgs,
  CursorPositionArgs,
  ComputerActionType,
} from './types'
import type { ComputerUseApprovalManager } from './approvalManager'
import { captureScreenshot, listWindows } from './screenshot'
import { extractOcrElements } from './ocr'
import { tryBackgroundActivateAtPoint } from '../ui-automation/service'
import {
  performClick,
  performType,
  performKeyPress,
  performScroll,
  performCursorMove,
} from './actions'
import { MAX_ACTIONS_PER_SESSION, ACTION_DELAY_MS } from './constants'
import { registerKillSwitch, unregisterKillSwitch } from './killSwitch'
import {
  mapScreenshotPointToDesktop,
  serializeCoordinateContext,
  type DesktopPoint,
  type ScreenshotCoordinateContext,
} from './coordinates'

let approvalManager: ComputerUseApprovalManager | null = null
let actionCount = 0
let aborted = false
const maxActions = MAX_ACTIONS_PER_SESSION
interface ScreenshotSessionState {
  coordinateContext: ScreenshotCoordinateContext
  screenshotArgs: ScreenshotArgs
  screenshotHash: string
  screenshotId: string
  targetHwnd?: number
}

const MAX_SCREENSHOT_SESSIONS = 32
const screenshotSessions = new Map<string, ScreenshotSessionState>()

class ComputerActionPolicyError extends Error {
  constructor(
    message: string,
    readonly data: Record<string, unknown>
  ) {
    super(message)
  }
}

function screenshotHash(image: string): string {
  return createHash('sha256').update(image).digest('base64url')
}

function rememberScreenshot(sessionKey: string, state: ScreenshotSessionState): void {
  screenshotSessions.delete(sessionKey)
  screenshotSessions.set(sessionKey, state)
  while (screenshotSessions.size > MAX_SCREENSHOT_SESSIONS) {
    const oldest = screenshotSessions.keys().next().value
    if (typeof oldest !== 'string') break
    screenshotSessions.delete(oldest)
  }
}

function requireScreenshotSession(
  sessionKey: string,
  screenshotId: string
): ScreenshotSessionState {
  const state = screenshotSessions.get(sessionKey)
  if (!state) {
    throw new Error('No screen context is available for this run. Use computer_screenshot first.')
  }
  if (state.screenshotId !== screenshotId) {
    throw new Error(
      'The screenshot_id is stale or belongs to another action sequence. Capture a fresh screenshot and retry.'
    )
  }
  return state
}

export function setApprovalManager(manager: ComputerUseApprovalManager): void {
  approvalManager = manager
}

export function abortSession(): void {
  aborted = true
  actionCount = 0
  approvalManager?.dispose()
  unregisterKillSwitch()
  screenshotSessions.clear()
}

function resetAbortOnNewTask(): void {
  aborted = false
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function gateApproval(
  action: ComputerActionType,
  args: object,
  autoApprove: boolean
): Promise<{ approved: boolean; reason?: string }> {
  if (autoApprove || !approvalManager) return { approved: true }

  const screenshot = action !== 'screenshot' ? (await captureScreenshot()).image : undefined
  const decision = await approvalManager.requestApproval({
    action,
    args: { ...args } as Record<string, unknown>,
    screenshot,
  })
  if (!decision.approved) {
    const reason =
      decision.outcome === 'timed_out' ? 'Approval timed out.' : 'Action rejected by user.'
    return { approved: false, reason }
  }
  return { approved: true }
}

export async function executeScreenshot(
  args: ScreenshotArgs,
  options: { registerEmergencyStop?: boolean; sessionKey?: string } = {}
): Promise<ToolResult> {
  resetAbortOnNewTask()
  if (options.registerEmergencyStop !== false) registerKillSwitch(() => abortSession())
  try {
    const result = await captureScreenshot({
      displayId: args.display_id,
      windowId: args.window_id,
      windowTitle: args.window_title,
      appName: args.app_name,
    })
    const sessionKey = options.sessionKey ?? 'unscoped'
    const screenshotId = randomUUID()
    const ocr = await extractOcrElements(result.image, result.width, result.height)
    rememberScreenshot(sessionKey, {
      coordinateContext: result.coordinateContext,
      screenshotArgs: { ...args },
      screenshotHash: screenshotHash(result.image),
      screenshotId,
      ...(result.target?.type === 'window' && result.target.hwnd
        ? { targetHwnd: result.target.hwnd }
        : {}),
    })
    return {
      success: true,
      data: {
        action: 'screenshot',
        screenshotId,
        image: result.image,
        screenWidth: result.width,
        screenHeight: result.height,
        coordinateContext: serializeCoordinateContext(result.coordinateContext),
        ocr,
        ...(result.target ? { target: result.target } : {}),
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Screen capture failed' }
  }
}

async function executeAction(
  action: ComputerActionType,
  args: { screenshot_id: string },
  executor: () => Promise<object | void>,
  autoApprove: boolean,
  showSpotlightFn?: (opts: { x: number; y: number; label?: string }) => Promise<void>,
  spotlightPoint?: DesktopPoint,
  sessionKey = 'unscoped'
): Promise<ToolResult> {
  if (aborted)
    return {
      success: false,
      error:
        'Computer use session was aborted. Check the screen again to start a new action sequence.',
    }

  let before: ScreenshotSessionState
  try {
    before = requireScreenshotSession(sessionKey, args.screenshot_id)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid screenshot context.',
    }
  }

  actionCount++
  if (actionCount > maxActions) {
    return { success: false, error: `Action limit reached (${maxActions}). Start a new task.` }
  }

  const gate = await gateApproval(action, args, autoApprove)
  if (!gate.approved) return { success: false, error: gate.reason || 'Action not approved' }

  if (aborted) return { success: false, error: 'Session aborted during approval.' }

  try {
    // Show spotlight before action
    const x = spotlightPoint?.x
    const y = spotlightPoint?.y
    if (showSpotlightFn && x !== undefined && y !== undefined) {
      const label =
        action === 'click'
          ? 'Click'
          : action === 'scroll'
            ? 'Scroll'
            : action === 'cursor_position'
              ? 'Move'
              : undefined
      await showSpotlightFn({ x, y, label })
    }

    const actionEvidence = await executor()
    await delay(ACTION_DELAY_MS)

    // Post-action screen capture
    const screenshot = await captureScreenshot({
      displayId: before.screenshotArgs.display_id ?? before.coordinateContext.displayId,
      windowId: before.screenshotArgs.window_id,
      windowTitle: before.screenshotArgs.window_title,
      appName: before.screenshotArgs.app_name,
    })
    const afterHash = screenshotHash(screenshot.image)
    const screenshotId = randomUUID()
    const ocr = await extractOcrElements(screenshot.image, screenshot.width, screenshot.height)
    rememberScreenshot(sessionKey, {
      coordinateContext: screenshot.coordinateContext,
      screenshotArgs: before.screenshotArgs,
      screenshotHash: afterHash,
      screenshotId,
      ...(screenshot.target?.type === 'window' && screenshot.target.hwnd
        ? { targetHwnd: screenshot.target.hwnd }
        : {}),
    })
    return {
      success: true,
      data: {
        action,
        screenshotId,
        visualChange: afterHash === before.screenshotHash ? 'unchanged' : 'changed',
        screenshot: screenshot.image,
        screenWidth: screenshot.width,
        screenHeight: screenshot.height,
        coordinateContext: serializeCoordinateContext(screenshot.coordinateContext),
        ocr,
        ...(actionEvidence ? { delivery: actionEvidence } : {}),
        ...(screenshot.target ? { target: screenshot.target } : {}),
      },
    }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : `${action} failed`,
      ...(e instanceof ComputerActionPolicyError ? { data: e.data } : {}),
    }
  }
}

function mapActionPoint(
  args: { screenshot_id: string; x: number; y: number },
  sessionKey: string
): DesktopPoint {
  const state = requireScreenshotSession(sessionKey, args.screenshot_id)
  return mapScreenshotPointToDesktop({ x: args.x, y: args.y }, state.coordinateContext)
}

function keyboardTargetForAction(
  args: { screenshot_id: string },
  sessionKey: string
): { hwnd: number } {
  const state = requireScreenshotSession(sessionKey, args.screenshot_id)
  if (!state.targetHwnd) {
    throw new Error(
      'Keyboard input requires a window-targeted screenshot so it cannot affect another app. Capture the app with computer_screenshot using window_id or app_name, then retry.'
    )
  }
  return { hwnd: state.targetHwnd }
}

export async function executeClick(
  args: ClickArgs,
  autoApprove: boolean,
  showSpotlight?: (opts: { x: number; y: number; label?: string }) => Promise<void>,
  sessionKey = 'unscoped',
  prepareForeground?: () => Promise<void>,
  allowForegroundFallback = true
): Promise<ToolResult> {
  let desktopPoint: DesktopPoint
  let screenshotState: ScreenshotSessionState
  try {
    screenshotState = requireScreenshotSession(sessionKey, args.screenshot_id)
    desktopPoint = mapScreenshotPointToDesktop(
      { x: args.x, y: args.y },
      screenshotState.coordinateContext
    )
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid screenshot context.',
    }
  }
  const desktopArgs = { ...args, ...desktopPoint }
  return executeAction(
    'click',
    args,
    async () => {
      if (screenshotState.targetHwnd && (args.button ?? 'left') === 'left') {
        const background = await tryBackgroundActivateAtPoint({
          hwnd: screenshotState.targetHwnd,
          x: desktopPoint.x,
          y: desktopPoint.y,
          sessionKey,
        })
        if (background.status === 'dispatched') {
          return {
            mode: 'background_automation',
            targeted: true,
            backgroundSafe: true,
            ...background,
          }
        }
        if (background.status === 'blocked') {
          throw new ComputerActionPolicyError(background.reason, {
            status: 'blocked',
            reason: 'repeated_action',
            hwnd: screenshotState.targetHwnd,
            element_id: background.element_id,
            message: background.reason,
          })
        }
      }
      if (!allowForegroundFallback) {
        const message =
          'No meaningful background-safe UI element owns this point. The reserved app was not focused and no physical click was sent.'
        throw new ComputerActionPolicyError(message, {
          status: 'foreground_required',
          action: 'computer_click',
          hwnd: screenshotState.targetHwnd,
          reason: message,
        })
      }
      await prepareForeground?.()
      await showSpotlight?.({ x: desktopPoint.x, y: desktopPoint.y, label: 'Click' })
      const physical = await performClick(
        desktopArgs,
        screenshotState.targetHwnd
          ? {
              hwnd: screenshotState.targetHwnd,
              capturedBounds: screenshotState.coordinateContext.displayBounds,
            }
          : undefined
      )
      return { mode: 'physical', backgroundSafe: false, ...physical }
    },
    autoApprove,
    undefined,
    undefined,
    sessionKey
  )
}

export async function executeType(
  args: TypeArgs,
  autoApprove: boolean,
  sessionKey = 'unscoped'
): Promise<ToolResult> {
  let target: { hwnd: number }
  try {
    target = keyboardTargetForAction(args, sessionKey)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid keyboard target.',
    }
  }
  return executeAction(
    'type',
    args,
    () => performType(args, target),
    autoApprove,
    undefined,
    undefined,
    sessionKey
  )
}

export async function executeKey(
  args: KeyArgs,
  autoApprove: boolean,
  sessionKey = 'unscoped'
): Promise<ToolResult> {
  let target: { hwnd: number }
  try {
    target = keyboardTargetForAction(args, sessionKey)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid keyboard target.',
    }
  }
  return executeAction(
    'key',
    args,
    () => performKeyPress(args, target),
    autoApprove,
    undefined,
    undefined,
    sessionKey
  )
}

export async function executeScroll(
  args: ScrollArgs,
  autoApprove: boolean,
  showSpotlight?: (opts: { x: number; y: number; label?: string }) => Promise<void>,
  sessionKey = 'unscoped'
): Promise<ToolResult> {
  let desktopPoint: DesktopPoint
  try {
    desktopPoint = mapActionPoint(args, sessionKey)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid screenshot context.',
    }
  }
  const desktopArgs = { ...args, ...desktopPoint }
  return executeAction(
    'scroll',
    args,
    () => performScroll(desktopArgs),
    autoApprove,
    showSpotlight,
    desktopPoint,
    sessionKey
  )
}

export async function executeCursorPosition(
  args: CursorPositionArgs,
  autoApprove: boolean,
  showSpotlight?: (opts: { x: number; y: number; label?: string }) => Promise<void>,
  sessionKey = 'unscoped'
): Promise<ToolResult> {
  let desktopPoint: DesktopPoint
  try {
    desktopPoint = mapActionPoint(args, sessionKey)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid screenshot context.',
    }
  }
  const desktopArgs = { ...args, ...desktopPoint }
  return executeAction(
    'cursor_position',
    args,
    () => performCursorMove(desktopArgs),
    autoApprove,
    showSpotlight,
    desktopPoint,
    sessionKey
  )
}

export async function executeListWindows(): Promise<ToolResult> {
  try {
    const result = await listWindows()
    return { success: true, data: result }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to list windows' }
  }
}
