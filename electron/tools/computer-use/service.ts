import type { ToolResult } from '../types'
import type { ScreenshotArgs, ClickArgs, TypeArgs, KeyArgs, ScrollArgs, CursorPositionArgs, ComputerActionType } from './types'
import type { ComputerUseApprovalManager } from './approvalManager'
import { captureScreenshot, listWindows } from './screenshot'
import { performClick, performType, performKeyPress, performScroll, performCursorMove } from './actions'
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
let maxActions = MAX_ACTIONS_PER_SESSION
let latestCoordinateContext: ScreenshotCoordinateContext | null = null

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
    latestCoordinateContext = result.coordinateContext
    return {
      success: true,
      data: {
        action: 'screenshot',
        image: result.image,
        screenWidth: result.width,
        screenHeight: result.height,
        coordinateContext: serializeCoordinateContext(result.coordinateContext),
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
  spotlightPoint?: DesktopPoint,
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
    const x = spotlightPoint?.x
    const y = spotlightPoint?.y
    if (showSpotlightFn && x !== undefined && y !== undefined) {
      const label = action === 'click' ? 'Click' : action === 'scroll' ? 'Scroll' : action === 'cursor_position' ? 'Move' : undefined
      await showSpotlightFn({ x, y, label })
    }

    await executor()
    await delay(ACTION_DELAY_MS)

    // Post-action screenshot
    const screenshot = await captureScreenshot(latestCoordinateContext?.displayId)
    latestCoordinateContext = screenshot.coordinateContext
    return {
      success: true,
      data: {
        action,
        screenshot: screenshot.image,
        screenWidth: screenshot.width,
        screenHeight: screenshot.height,
        coordinateContext: serializeCoordinateContext(screenshot.coordinateContext),
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : `${action} failed` }
  }
}

function mapActionPoint(args: { x: number; y: number }): DesktopPoint {
  if (!latestCoordinateContext) {
    throw new Error('No screenshot context is available. Take a computer_screenshot before clicking, scrolling, or moving the cursor.')
  }

  return mapScreenshotPointToDesktop({ x: args.x, y: args.y }, latestCoordinateContext)
}

export async function executeClick(args: ClickArgs, autoApprove: boolean, showSpotlight?: (opts: { x: number; y: number; label?: string }) => Promise<void>): Promise<ToolResult> {
  const desktopPoint = mapActionPoint(args)
  const desktopArgs = { ...args, ...desktopPoint }
  return executeAction('click', args as unknown as Record<string, unknown>, () => performClick(desktopArgs), autoApprove, showSpotlight, desktopPoint)
}

export async function executeType(args: TypeArgs, autoApprove: boolean): Promise<ToolResult> {
  return executeAction('type', args as unknown as Record<string, unknown>, () => performType(args), autoApprove)
}

export async function executeKey(args: KeyArgs, autoApprove: boolean): Promise<ToolResult> {
  return executeAction('key', args as unknown as Record<string, unknown>, () => performKeyPress(args), autoApprove)
}

export async function executeScroll(args: ScrollArgs, autoApprove: boolean, showSpotlight?: (opts: { x: number; y: number; label?: string }) => Promise<void>): Promise<ToolResult> {
  const desktopPoint = mapActionPoint(args)
  const desktopArgs = { ...args, ...desktopPoint }
  return executeAction('scroll', args as unknown as Record<string, unknown>, () => performScroll(desktopArgs), autoApprove, showSpotlight, desktopPoint)
}

export async function executeCursorPosition(args: CursorPositionArgs, autoApprove: boolean, showSpotlight?: (opts: { x: number; y: number; label?: string }) => Promise<void>): Promise<ToolResult> {
  const desktopPoint = mapActionPoint(args)
  const desktopArgs = { ...args, ...desktopPoint }
  return executeAction('cursor_position', args as unknown as Record<string, unknown>, () => performCursorMove(desktopArgs), autoApprove, showSpotlight, desktopPoint)
}


export async function executeListWindows(): Promise<ToolResult> {
  try {
    const result = await listWindows()
    return { success: true, data: result }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to list windows' }
  }
}

export async function executeLaunchApp(args: { name: string }): Promise<ToolResult> {
  const { name } = args
  if (!name?.trim()) return { success: false, error: 'App name is required' }

  try {
    const { shell } = await import('electron')
    const appName = name.trim()

    // If it looks like a path, open it directly
    if (appName.includes('/') || appName.includes('\\') || appName.endsWith('.exe') || appName.endsWith('.app')) {
      await shell.openPath(appName)
    } else if (process.platform === 'win32') {
      // On Windows, use start command
      const { exec } = await import('child_process')
      await new Promise<void>((resolve, reject) => {
        exec(`start "" "${appName}"`, (err) => err ? reject(err) : resolve())
      })
    } else {
      // macOS: use open -a
      const { exec } = await import('child_process')
      await new Promise<void>((resolve, reject) => {
        exec(`open -a "${appName}"`, (err) => err ? reject(err) : resolve())
      })
    }

    await delay(500) // Wait for app to start
    return { success: true, data: { launched: appName } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to launch app' }
  }
}

export async function executeCloseApp(args: { title: string }): Promise<ToolResult> {
  const { title } = args
  if (!title?.trim()) return { success: false, error: 'Window title is required' }

  try {
    const target = title.trim().toLowerCase()

    if (process.platform === 'win32') {
      const { exec } = await import('child_process')
      await new Promise<void>((resolve, reject) => {
        exec(`taskkill /FI "WINDOWTITLE eq ${title.trim()}" /F`, (err) => {
          // taskkill returns error if no matching window, but that's ok
          if (err && !err.message.includes('not found')) reject(err)
          else resolve()
        })
      })
    } else {
      // macOS: use osascript
      const { exec } = await import('child_process')
      await new Promise<void>((resolve, reject) => {
        exec(`osascript -e 'tell application "${title.trim()}" to quit'`, (err) => err ? reject(err) : resolve())
      })
    }

    return { success: true, data: { closed: target } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to close app' }
  }
}


export async function executeFindApp(args: { query: string }): Promise<ToolResult> {
  const { query } = args
  if (!query?.trim()) return { success: false, error: 'Search query is required' }

  try {
    const fs = await import('fs')
    const pathMod = await import('path')
    const os = await import('os')
    const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean)

    interface AppEntry { name: string; path: string; score: number }
    const results: AppEntry[] = []

    function fuzzyScore(name: string): number {
      const lower = name.toLowerCase()
      let score = 0
      for (const term of searchTerms) {
        if (lower.includes(term)) score += term.length
      }
      return score
    }

    function scanDir(dir: string, depth = 0) {
      if (depth > 3) return
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const full = pathMod.join(dir, entry.name)
          if (entry.isDirectory()) {
            scanDir(full, depth + 1)
          } else {
            const ext = pathMod.extname(entry.name).toLowerCase()
            if (process.platform === 'win32' && ext === '.lnk') {
              const baseName = pathMod.basename(entry.name, ext)
              const score = fuzzyScore(baseName)
              if (score > 0) results.push({ name: baseName, path: full, score })
            } else if (process.platform === 'darwin' && ext === '.app') {
              const baseName = pathMod.basename(entry.name, ext)
              const score = fuzzyScore(baseName)
              if (score > 0) results.push({ name: baseName, path: full, score })
            }
          }
        }
      } catch { /* permission denied etc */ }
    }

    if (process.platform === 'win32') {
      const startMenuPaths = [
        pathMod.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
        'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs',
      ]
      for (const p of startMenuPaths) scanDir(p)
    } else if (process.platform === 'darwin') {
      scanDir('/Applications')
      scanDir(pathMod.join(os.homedir(), 'Applications'))
    }

    // Sort by score descending, take top 10
    results.sort((a, b) => b.score - a.score)
    const top = results.slice(0, 10).map((r) => ({ name: r.name, path: r.path }))

    return {
      success: true,
      data: {
        query: query.trim(),
        matches: top,
        count: top.length,
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to search apps' }
  }
}
