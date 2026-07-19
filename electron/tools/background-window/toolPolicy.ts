import type { ToolResult } from '../types'
import type { ScreenshotArgs } from '../computerUse'
import type { BackgroundWindowTarget } from './types'

export function scopeScreenshotToBackgroundTarget(
  target: BackgroundWindowTarget
): ScreenshotArgs {
  return { window_id: `window:${target.hwnd}:0` }
}

export function backgroundWindowFocusBlocked(target: BackgroundWindowTarget): ToolResult {
  const message =
    'window_focus cannot run while this window is reserved for background use. Release the background window first and request foreground control explicitly.'
  return {
    success: false,
    error: message,
    data: {
      status: 'foreground_required',
      action: 'window_focus',
      hwnd: target.hwnd,
      reason: message,
    },
  }
}

export function normalizeBackgroundScreenshotResult(
  result: ToolResult,
  target: BackgroundWindowTarget
): ToolResult {
  if (result.success || result.error !== 'No matching window source available for capture') {
    return result
  }
  const message =
    'The reserved background window is not available from Windows screen capture. It may be minimized, cloaked, or not exposing a capturable surface; keep using UI Automation or release it for explicit foreground control.'
  return {
    success: false,
    error: message,
    data: {
      status: 'blocked',
      reason: 'screenshot_unavailable',
      hwnd: target.hwnd,
      message,
    },
  }
}
