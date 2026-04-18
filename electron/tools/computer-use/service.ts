import type { ToolResult } from '../types'
import type { ScreenshotArgs, ClickArgs, TypeArgs, KeyArgs, ScrollArgs, CursorPositionArgs, ComputerActionType } from './types'
import type { ComputerUseApprovalManager } from './approvalManager'
import { captureScreenshot } from './screenshot'
import { performClick, performType, performKeyPress, performScroll, performCursorMove } from './actions'
import { MAX_ACTIONS_PER_SESSION, ACTION_DELAY_MS } from './constants'
import { registerKillSwitch, unregisterKillSwitch } from './killSwitch'

let approvalManager: ComputerUseApprovalManager | null = null
let actionCount = 0
let aborted = false
let maxActions = MAX_ACTIONS_PER_SESSION

export function setApprovalManager(manager: ComputerUseApprovalManager): void {
  approvalManager = manager
}

export function setMaxActions(max: number): void {
  maxActions = Math.max(1, Math.round(max))
}

export function abortSession(): void {
  aborted = true
  actionCount = 0
  approvalManager?.dispose()
  unregisterKillSwitch()
}

export function isAborted(): boolean {
  return aborted
}

function resetAbortOnNewTask(): void {
  aborted = false
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function gateApproval(action: ComputerActionType, args: Record<string, unknown>, autoApprove: boolean): Promise<{ approved: boolean; reason?: string }> {
  if (autoApprove || !approvalManager) return { approved: true }

  const screenshot = action !== 'screenshot' ? (await captureScreenshot()).image : undefined
  const decision = await approvalManager.requestApproval({ action, args, screenshot })
  if (!decision.approved) {
    const reason = decision.outcome === 'timed_out' ? 'Approval timed out.' : 'Action rejected by user.'
    return { approved: false, reason }
  }
  return { approved: true }
}

export async function executeScreenshot(args: ScreenshotArgs): Promise<ToolResult> {
  resetAbortOnNewTask()
  registerKillSwitch()
  try {
    const result = await captureScreenshot(args.display_id)
    return {
      success: true,
      data: {
        action: 'screenshot',
        image: result.image,
        screenWidth: result.width,
        screenHeight: result.height,
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Screenshot failed' }
  }
}

async function executeAction(
  action: ComputerActionType,
  args: Record<string, unknown>,
  executor: () => Promise<void>,
  autoApprove: boolean,
  showSpotlightFn?: (opts: { x: number; y: number; label?: string }) => Promise<void>,
): Promise<ToolResult> {
  if (aborted) return { success: false, error: 'Computer use session was aborted. Take a new screenshot to start again.' }

  actionCount++
  if (actionCount > maxActions) {
    return { success: false, error: `Action limit reached (${maxActions}). Start a new task.` }
  }

  const gate = await gateApproval(action, args, autoApprove)
  if (!gate.approved) return { success: false, error: gate.reason || 'Action not approved' }

  if (aborted) return { success: false, error: 'Session aborted during approval.' }

  try {
    // Show spotlight before action
    const x = typeof args.x === 'number' ? args.x : undefined
    const y = typeof args.y === 'number' ? args.y : undefined
    if (showSpotlightFn && x !== undefined && y !== undefined) {
      const label = action === 'click' ? 'Click' : action === 'scroll' ? 'Scroll' : action === 'cursor_position' ? 'Move' : undefined
      await showSpotlightFn({ x, y, label })
    }

    await executor()
    await delay(ACTION_DELAY_MS)

    // Post-action screenshot
    const screenshot = await captureScreenshot()
    return {
      success: true,
      data: {
        action,
        screenshot: screenshot.image,
        screenWidth: screenshot.width,
        screenHeight: screenshot.height,
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : `${action} failed` }
  }
}

export async function executeClick(args: ClickArgs, autoApprove: boolean, showSpotlight?: (opts: { x: number; y: number; label?: string }) => Promise<void>): Promise<ToolResult> {
  return executeAction('click', args as unknown as Record<string, unknown>, () => performClick(args), autoApprove, showSpotlight)
}

export async function executeType(args: TypeArgs, autoApprove: boolean): Promise<ToolResult> {
  return executeAction('type', args as unknown as Record<string, unknown>, () => performType(args), autoApprove)
}

export async function executeKey(args: KeyArgs, autoApprove: boolean): Promise<ToolResult> {
  return executeAction('key', args as unknown as Record<string, unknown>, () => performKeyPress(args), autoApprove)
}

export async function executeScroll(args: ScrollArgs, autoApprove: boolean, showSpotlight?: (opts: { x: number; y: number; label?: string }) => Promise<void>): Promise<ToolResult> {
  return executeAction('scroll', args as unknown as Record<string, unknown>, () => performScroll(args), autoApprove, showSpotlight)
}

export async function executeCursorPosition(args: CursorPositionArgs, autoApprove: boolean, showSpotlight?: (opts: { x: number; y: number; label?: string }) => Promise<void>): Promise<ToolResult> {
  return executeAction('cursor_position', args as unknown as Record<string, unknown>, () => performCursorMove(args), autoApprove, showSpotlight)
}
