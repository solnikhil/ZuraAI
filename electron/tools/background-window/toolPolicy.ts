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

export function backgroundWindowPhysicalInputBlocked(
  target: BackgroundWindowTarget,
  action: 'computer_cursor_position' | 'computer_key' | 'computer_scroll' | 'computer_type'
): ToolResult {
  const message =
    `${action} cannot release a reserved background window or emit shared physical input. ` +
    'Resolve the intended outcome with the target-scoped accessibility tree and ui_click, ui_type_text, ui_set_value, ui_select, or ui_scroll. For a shortcut, search accelerator_key/access_key and invoke the matching element. If no semantic action exists, report foreground_required instead of focusing the app or moving the user\'s input devices.'
  return {
    success: false,
    error: message,
    data: {
      status: 'foreground_required',
      action,
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
