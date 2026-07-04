import type { ToolResult } from '../types'
import {
  isRecord,
  isWindows,
  normalizeJsonArray,
  numberArg,
  parseJsonOutput,
  requireApproval,
  runPowerShell,
  stringArg,
  unsupportedWindowsOnly,
} from '../native-common'

function psString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function targetScript(args: unknown): string {
  const hwnd = numberArg(args, 'hwnd')
  const title = stringArg(args, 'title')
  if (hwnd !== undefined) return `[IntPtr]${Math.trunc(hwnd)}`
  if (title) {
    return `(Get-Process | Where-Object { $_.MainWindowTitle -like ${psString(`*${title}*`)} } | Select-Object -First 1).MainWindowHandle`
  }
  return '[IntPtr]::Zero'
}

export async function executeWindowList(): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('window_list')
  const currentPid = process.pid
  const script = `
$items = Get-Process | Where-Object {
  $_.MainWindowHandle -ne 0 -and
  $_.MainWindowTitle -and
  $_.Id -ne ${currentPid} -and
  -not ($_.ProcessName -match '^(ZuraAI|zuraai)$') -and
  -not ($_.ProcessName -eq 'electron' -and $_.MainWindowTitle -like '*ZuraAI*')
} | ForEach-Object {
  [pscustomobject]@{
    hwnd = [int64]$_.MainWindowHandle
    title = $_.MainWindowTitle
    processName = $_.ProcessName
    processId = $_.Id
    path = [string]$_.Path
  }
}
$items | ConvertTo-Json -Compress
`
  try {
    const { stdout } = await runPowerShell(script)
    return {
      success: true,
      data: { windows: normalizeJsonArray(parseJsonOutput<unknown | unknown[]>(stdout)) },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'window_list failed.' }
  }
}

async function runWindowAction(
  args: unknown,
  action: 'focus' | 'move' | 'close'
): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly(`window_${action}`)
  const approval = requireApproval(args, `window_${action}`)
  if (approval) return approval
  if (!isRecord(args)) return { success: false, error: 'window target is required.' }

  const target = targetScript(args)
  const x = numberArg(args, 'x')
  const y = numberArg(args, 'y')
  const width = numberArg(args, 'width')
  const height = numberArg(args, 'height')

  const moveCall =
    x !== undefined && y !== undefined && width !== undefined && height !== undefined
      ? `[NativeWin]::MoveWindow($hwnd, ${Math.round(x)}, ${Math.round(y)}, ${Math.round(width)}, ${Math.round(height)}, $true) | Out-Null`
      : 'throw "x, y, width, and height are required."'

  const actionCall =
    action === 'focus'
      ? '[NativeWin]::SetForegroundWindow($hwnd) | Out-Null'
      : action === 'move'
        ? moveCall
        : '[NativeWin]::PostMessage($hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null'

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, UInt32 Msg, IntPtr wParam, IntPtr lParam);
}
"@
$hwnd = ${target}
$owner = Get-Process | Where-Object { $_.MainWindowHandle -eq $hwnd } | Select-Object -First 1
if ($null -eq $hwnd -or $hwnd -eq [IntPtr]::Zero -or $null -eq $owner) { throw "Target window was not found." }
if ($owner.Id -eq ${process.pid} -or $owner.ProcessName -match '^(ZuraAI|zuraai)$' -or ($owner.ProcessName -eq 'electron' -and $owner.MainWindowTitle -like '*ZuraAI*')) {
  throw "Refusing to manage ZuraAI-owned windows."
}
${actionCall}
@{ action = ${psString(action)}; hwnd = [int64]$hwnd } | ConvertTo-Json -Compress
`
  try {
    const { stdout } = await runPowerShell(script)
    return { success: true, data: parseJsonOutput<unknown>(stdout) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : `window_${action} failed.`,
    }
  }
}

export function executeWindowFocus(args: unknown): Promise<ToolResult> {
  return runWindowAction(args, 'focus')
}

export function executeWindowMove(args: unknown): Promise<ToolResult> {
  return runWindowAction(args, 'move')
}

export function executeWindowClose(args: unknown): Promise<ToolResult> {
  return runWindowAction(args, 'close')
}
