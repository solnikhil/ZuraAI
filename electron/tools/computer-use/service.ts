import type { ToolResult } from '../types'
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
let latestCoordinateContext: ScreenshotCoordinateContext | null = null
let latestScreenshotArgs: ScreenshotArgs = {}

export function setApprovalManager(manager: ComputerUseApprovalManager): void {
  approvalManager = manager
}

export function abortSession(): void {
  aborted = true
  actionCount = 0
  approvalManager?.dispose()
  unregisterKillSwitch()
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

export async function executeScreenshot(args: ScreenshotArgs): Promise<ToolResult> {
  resetAbortOnNewTask()
  registerKillSwitch(() => abortSession())
  try {
    const result = await captureScreenshot({
      displayId: args.display_id,
      windowId: args.window_id,
      windowTitle: args.window_title,
      appName: args.app_name,
    })
    latestCoordinateContext = result.coordinateContext
    latestScreenshotArgs = { ...args }
    return {
      success: true,
      data: {
        action: 'screenshot',
        image: result.image,
        screenWidth: result.width,
        screenHeight: result.height,
        coordinateContext: serializeCoordinateContext(result.coordinateContext),
        ...(result.target ? { target: result.target } : {}),
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Screen capture failed' }
  }
}

async function executeAction(
  action: ComputerActionType,
  args: object,
  executor: () => Promise<void>,
  autoApprove: boolean,
  showSpotlightFn?: (opts: { x: number; y: number; label?: string }) => Promise<void>,
  spotlightPoint?: DesktopPoint
): Promise<ToolResult> {
  if (aborted)
    return {
      success: false,
      error:
        'Computer use session was aborted. Check the screen again to start a new action sequence.',
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

    await executor()
    await delay(ACTION_DELAY_MS)

    // Post-action screen capture
    const screenshot = await captureScreenshot({
      displayId: latestScreenshotArgs.display_id ?? latestCoordinateContext?.displayId,
      windowId: latestScreenshotArgs.window_id,
      windowTitle: latestScreenshotArgs.window_title,
      appName: latestScreenshotArgs.app_name,
    })
    latestCoordinateContext = screenshot.coordinateContext
    return {
      success: true,
      data: {
        action,
        screenshot: screenshot.image,
        screenWidth: screenshot.width,
        screenHeight: screenshot.height,
        coordinateContext: serializeCoordinateContext(screenshot.coordinateContext),
        ...(screenshot.target ? { target: screenshot.target } : {}),
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : `${action} failed` }
  }
}

function mapActionPoint(args: { x: number; y: number }): DesktopPoint {
  if (!latestCoordinateContext) {
    throw new Error(
      'No screen context is available. Use computer_screenshot before clicking, scrolling, or moving the cursor.'
    )
  }

  return mapScreenshotPointToDesktop({ x: args.x, y: args.y }, latestCoordinateContext)
}

export async function executeClick(
  args: ClickArgs,
  autoApprove: boolean,
  showSpotlight?: (opts: { x: number; y: number; label?: string }) => Promise<void>
): Promise<ToolResult> {
  const desktopPoint = mapActionPoint(args)
  const desktopArgs = { ...args, ...desktopPoint }
  return executeAction(
    'click',
    args,
    () => performClick(desktopArgs),
    autoApprove,
    showSpotlight,
    desktopPoint
  )
}

export async function executeType(args: TypeArgs, autoApprove: boolean): Promise<ToolResult> {
  return executeAction('type', args, () => performType(args), autoApprove)
}

export async function executeKey(args: KeyArgs, autoApprove: boolean): Promise<ToolResult> {
  return executeAction('key', args, () => performKeyPress(args), autoApprove)
}

export async function executeScroll(
  args: ScrollArgs,
  autoApprove: boolean,
  showSpotlight?: (opts: { x: number; y: number; label?: string }) => Promise<void>
): Promise<ToolResult> {
  const desktopPoint = mapActionPoint(args)
  const desktopArgs = { ...args, ...desktopPoint }
  return executeAction(
    'scroll',
    args,
    () => performScroll(desktopArgs),
    autoApprove,
    showSpotlight,
    desktopPoint
  )
}

export async function executeCursorPosition(
  args: CursorPositionArgs,
  autoApprove: boolean,
  showSpotlight?: (opts: { x: number; y: number; label?: string }) => Promise<void>
): Promise<ToolResult> {
  const desktopPoint = mapActionPoint(args)
  const desktopArgs = { ...args, ...desktopPoint }
  return executeAction(
    'cursor_position',
    args,
    () => performCursorMove(desktopArgs),
    autoApprove,
    showSpotlight,
    desktopPoint
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
