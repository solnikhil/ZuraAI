import { shell } from 'electron'
import { execFile } from 'node:child_process'
import os from 'node:os'

import type { ToolResult } from '../types'
import {
  isRecord,
  isWindows,
  numberArg,
  parseJsonOutput,
  requireApproval,
  runPowerShell,
  stringArg,
  unsupportedWindowsOnly,
} from '../native-common'
import {
  SETTINGS_PAGE_URIS,
  WINDOWS_COPILOT_URI,
  isSettingsPage,
  settingsPageListForError,
  type SettingsPage,
} from '../../../src/tools/windowsSettings'

export {
  WINDOWS_SETTINGS_CATALOG,
  WINDOWS_COPILOT_URI,
  isSettingsPage,
  type SettingsPage,
} from '../../../src/tools/windowsSettings'

type SnapPreset = 'left' | 'right' | 'top' | 'bottom' | 'maximize' | 'center'

function psString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function runAppleScript(script: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'osascript',
      ['-e', script, ...args],
      { timeout: 8_000, maxBuffer: 64 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(String(stderr || error.message).trim()))
        else resolve(String(stdout ?? '').trim())
      }
    )
  })
}

async function macActiveWindow(): Promise<ToolResult> {
  try {
    const output = await runAppleScript(`
tell application "System Events"
  set frontProcess to first application process whose frontmost is true
  set appName to name of frontProcess
  set processId to unix id of frontProcess
  set windowTitle to ""
  try
    set windowTitle to name of front window of frontProcess
  end try
  return appName & linefeed & processId & linefeed & windowTitle
end tell`)
    const [processName = '', processId = '', ...title] = output.split(/\r?\n/)
    return {
      success: true,
      data: { processName, processId: Number(processId) || 0, title: title.join('\n') },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'system_active_window failed.',
    }
  }
}

async function macWindowSnap(args: unknown): Promise<ToolResult> {
  const preset = stringArg(args, 'preset') || 'left'
  if (!['left', 'right', 'maximize'].includes(preset)) {
    return { success: false, error: 'macOS window snapping supports left, right, and maximize.' }
  }
  try {
    await runAppleScript(
      `
on run argv
  set preset to item 1 of argv
  tell application "Finder" to set desktopBounds to bounds of window of desktop
  set screenWidth to item 3 of desktopBounds
  set screenHeight to item 4 of desktopBounds
  tell application "System Events"
    set frontProcess to first application process whose frontmost is true
    if name of frontProcess is "ZuraAI" then error "Refusing to manage ZuraAI-owned windows."
    tell front window of frontProcess
      if preset is "left" then
        set position to {0, 25}
        set size to {screenWidth / 2, screenHeight - 25}
      else if preset is "right" then
        set position to {screenWidth / 2, 25}
        set size to {screenWidth / 2, screenHeight - 25}
      else
        set position to {0, 25}
        set size to {screenWidth, screenHeight - 25}
      end if
    end tell
  end tell
end run`,
      [preset]
    )
    return { success: true, data: { action: 'snap', preset } }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'window_snap failed. Grant ZuraAI Accessibility access in System Settings.',
    }
  }
}

function activeWindowScript(): string {
  return `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class ActiveWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$hwnd = [ActiveWin]::GetForegroundWindow()
$builder = New-Object System.Text.StringBuilder 512
[ActiveWin]::GetWindowText($hwnd, $builder, $builder.Capacity) | Out-Null
$pidValue = 0
[ActiveWin]::GetWindowThreadProcessId($hwnd, [ref]$pidValue) | Out-Null
$process = if ($pidValue -gt 0) { Get-Process -Id $pidValue -ErrorAction SilentlyContinue } else { $null }
@{
  hwnd = [int64]$hwnd
  title = [string]$builder.ToString()
  processId = [int]$pidValue
  processName = if ($null -ne $process) { [string]$process.ProcessName } else { "" }
  path = if ($null -ne $process) { [string]$process.Path } else { "" }
} | ConvertTo-Json -Compress
`
}

function windowSnapScript(args: unknown): string {
  const hwnd = numberArg(args, 'hwnd')
  const title = stringArg(args, 'title')
  const rawPreset = stringArg(args, 'preset') as SnapPreset
  const preset: SnapPreset = ['left', 'right', 'top', 'bottom', 'maximize', 'center'].includes(
    rawPreset
  )
    ? rawPreset
    : 'left'

  const target =
    hwnd !== undefined
      ? `[IntPtr]${Math.trunc(hwnd)}`
      : title
        ? `(Get-Process | Where-Object { $_.MainWindowTitle -like ${psString(`*${title}*`)} } | Select-Object -First 1).MainWindowHandle`
        : '[NativeWin]::GetForegroundWindow()'

  return `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$hwnd = ${target}
$owner = Get-Process | Where-Object { $_.MainWindowHandle -eq $hwnd } | Select-Object -First 1
if ($null -eq $hwnd -or $hwnd -eq [IntPtr]::Zero -or $null -eq $owner) { throw "Target window was not found." }
if ($owner.Id -eq ${process.pid} -or $owner.ProcessName -match '^(ZuraAI|zuraai)$' -or ($owner.ProcessName -eq 'electron' -and $owner.MainWindowTitle -like '*ZuraAI*')) {
  throw "Refusing to manage ZuraAI-owned windows."
}
$screen = [System.Windows.Forms.Screen]::FromHandle($hwnd)
$area = $screen.WorkingArea
$preset = ${psString(preset)}
$x = $area.X; $y = $area.Y; $w = $area.Width; $h = $area.Height
if ($preset -eq 'left') { $w = [int]($area.Width / 2) }
elseif ($preset -eq 'right') { $x = $area.X + [int]($area.Width / 2); $w = [int]($area.Width / 2) }
elseif ($preset -eq 'top') { $h = [int]($area.Height / 2) }
elseif ($preset -eq 'bottom') { $y = $area.Y + [int]($area.Height / 2); $h = [int]($area.Height / 2) }
elseif ($preset -eq 'center') { $w = [int]($area.Width * 0.7); $h = [int]($area.Height * 0.8); $x = $area.X + [int](($area.Width - $w) / 2); $y = $area.Y + [int](($area.Height - $h) / 2) }
if ($preset -eq 'maximize') {
  [NativeWin]::ShowWindow($hwnd, 3) | Out-Null
} else {
  [NativeWin]::ShowWindow($hwnd, 9) | Out-Null
  [NativeWin]::MoveWindow($hwnd, $x, $y, $w, $h, $true) | Out-Null
}
@{ action = "snap"; preset = $preset; hwnd = [int64]$hwnd; x = $x; y = $y; width = $w; height = $h } | ConvertTo-Json -Compress
`
}

function systemStatusScript(): string {
  return `
$battery = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
$disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue | ForEach-Object {
  [pscustomobject]@{
    name = [string]$_.DeviceID
    label = [string]$_.VolumeName
    sizeBytes = [int64]$_.Size
    freeBytes = [int64]$_.FreeSpace
  }
}
$networks = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
  $_.Status -eq 'Up'
} | Select-Object -First 10 | ForEach-Object {
  [pscustomobject]@{
    name = [string]$_.Name
    interfaceDescription = [string]$_.InterfaceDescription
    status = [string]$_.Status
    linkSpeed = [string]$_.LinkSpeed
  }
}
@{
  capturedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  battery = if ($null -ne $battery) {
    [pscustomobject]@{
      estimatedChargeRemaining = [int]$battery.EstimatedChargeRemaining
      batteryStatus = [int]$battery.BatteryStatus
      estimatedRunTimeMinutes = [int]$battery.EstimatedRunTime
    }
  } else { $null }
  disks = @($disks)
  networks = @($networks)
} | ConvertTo-Json -Depth 5 -Compress
`
}

export async function executeSystemActiveWindow(): Promise<ToolResult> {
  if (!isWindows() && process.platform === 'darwin') return macActiveWindow()
  if (!isWindows()) return unsupportedWindowsOnly('system_active_window')
  try {
    const { stdout } = await runPowerShell(activeWindowScript())
    return { success: true, data: parseJsonOutput<unknown>(stdout) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'system_active_window failed.',
    }
  }
}

function parseSettingsPage(value: string): SettingsPage | null {
  return isSettingsPage(value) ? value : null
}

export async function executeSystemSettingsOpen(args: unknown): Promise<ToolResult> {
  if (!isWindows() && process.platform !== 'darwin')
    return unsupportedWindowsOnly('system_settings_open')
  const approval = requireApproval(args, 'system_settings_open')
  if (approval) return approval
  const page = parseSettingsPage(stringArg(args, 'page') ?? '')
  if (!page) {
    return {
      success: false,
      error: `page must be one of: ${settingsPageListForError()}.`,
    }
  }
  if (!isWindows() && process.platform === 'darwin') {
    const macSettings: Partial<Record<SettingsPage, string>> = {
      display: 'x-apple.systempreferences:com.apple.Displays-Settings.extension',
      sound: 'x-apple.systempreferences:com.apple.Sound-Settings.extension',
      network: 'x-apple.systempreferences:com.apple.Network-Settings.extension',
      bluetooth: 'x-apple.systempreferences:com.apple.BluetoothSettings',
      privacy: 'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension',
      apps: 'x-apple.systempreferences:com.apple.preferences-apps',
    }
    await shell.openExternal(macSettings[page] ?? 'x-apple.systempreferences:')
  } else {
    await shell.openExternal(SETTINGS_PAGE_URIS[page])
  }
  return { success: true, data: { page } }
}

/** Open Windows Copilot via the fixed allowlisted protocol only. */
export async function executeWindowsCopilotOpen(args: unknown = {}): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('windows_copilot_open')
  const approval = requireApproval(args, 'windows_copilot_open')
  if (approval) return approval
  try {
    await shell.openExternal(WINDOWS_COPILOT_URI)
    return { success: true, data: { opened: 'copilot' } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to open Windows Copilot.',
    }
  }
}

export async function executeSystemStatus(): Promise<ToolResult> {
  if (!isWindows() && process.platform === 'darwin') {
    return {
      success: true,
      data: {
        capturedAt: Date.now(),
        hostname: os.hostname(),
        uptimeSeconds: os.uptime(),
        totalMemoryBytes: os.totalmem(),
        freeMemoryBytes: os.freemem(),
        cpuCount: os.cpus().length,
        platform: 'macos',
      },
    }
  }
  if (!isWindows()) return unsupportedWindowsOnly('system_status')
  try {
    const { stdout } = await runPowerShell(systemStatusScript())
    return { success: true, data: parseJsonOutput<unknown>(stdout) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'system_status failed.',
    }
  }
}

export async function executeSystemOpenPath(args: unknown): Promise<ToolResult> {
  if (!isWindows() && process.platform !== 'darwin')
    return unsupportedWindowsOnly('system_open_path')
  const approval = requireApproval(args, 'system_open_path')
  if (approval) return approval
  const targetPath = stringArg(args, 'path')
  if (!targetPath) return { success: false, error: 'path is required.' }
  const error = await shell.openPath(targetPath)
  if (error) return { success: false, error }
  return { success: true, data: { opened: targetPath } }
}

export async function executeWindowSnap(args: unknown): Promise<ToolResult> {
  const approval = requireApproval(args, 'window_snap')
  if (approval) return approval
  if (!isWindows() && process.platform === 'darwin') return macWindowSnap(args)
  if (!isWindows()) return unsupportedWindowsOnly('window_snap')
  if (!isRecord(args)) return { success: false, error: 'window snap arguments are required.' }
  try {
    const { stdout } = await runPowerShell(windowSnapScript(args))
    return { success: true, data: parseJsonOutput<unknown>(stdout) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'window_snap failed.' }
  }
}
