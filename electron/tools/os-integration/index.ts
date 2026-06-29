import { shell } from 'electron'

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

type SnapPreset = 'left' | 'right' | 'top' | 'bottom' | 'maximize' | 'center'
type SettingsPage = 'display' | 'sound' | 'bluetooth' | 'network' | 'notifications' | 'apps' | 'privacy'

const SETTINGS_PAGE_URIS: Record<SettingsPage, string> = {
  display: 'ms-settings:display',
  sound: 'ms-settings:sound',
  bluetooth: 'ms-settings:bluetooth',
  network: 'ms-settings:network',
  notifications: 'ms-settings:notifications',
  apps: 'ms-settings:appsfeatures',
  privacy: 'ms-settings:privacy',
}

function psString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
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

function volumeScript(mode: 'get' | 'set' | 'mute', level?: number, muted?: boolean): string {
  const setLevel = typeof level === 'number' ? Math.max(0, Math.min(100, Math.round(level))) : 0
  const setMuted = muted === true ? '$true' : '$false'
  return `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int NotImpl1();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, out IAudioEndpointVolume ppInterface);
}

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr pNotify);
  int UnregisterControlChangeNotify(IntPtr pNotify);
  int GetChannelCount(out uint pnChannelCount);
  int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int GetMasterVolumeLevel(out float pfLevelDB);
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
  int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
  int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
  int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
  int SetMute(bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject {}
"@
$enumerator = [IMMDeviceEnumerator](New-Object MMDeviceEnumeratorComObject)
$device = $null
$enumerator.GetDefaultAudioEndpoint(0, 1, [ref]$device) | Out-Null
$iid = [Guid]"5CDF2C82-841E-4546-9722-0CF74078229A"
$endpoint = $null
$device.Activate([ref]$iid, 23, [IntPtr]::Zero, [ref]$endpoint) | Out-Null
${mode === 'set' ? `$endpoint.SetMasterVolumeLevelScalar(${setLevel / 100}, [Guid]::Empty) | Out-Null` : ''}
${mode === 'mute' ? `$endpoint.SetMute(${setMuted}, [Guid]::Empty) | Out-Null` : ''}
$level = 0.0
$mute = $false
$endpoint.GetMasterVolumeLevelScalar([ref]$level) | Out-Null
$endpoint.GetMute([ref]$mute) | Out-Null
@{ level = [int][Math]::Round($level * 100); muted = [bool]$mute } | ConvertTo-Json -Compress
`
}

function windowSnapScript(args: unknown): string {
  const hwnd = numberArg(args, 'hwnd')
  const title = stringArg(args, 'title')
  const rawPreset = stringArg(args, 'preset') as SnapPreset
  const preset: SnapPreset = ['left', 'right', 'top', 'bottom', 'maximize', 'center'].includes(rawPreset)
    ? rawPreset
    : 'left'

  const target = hwnd !== undefined
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

function themeScript(mode: 'get' | 'set', theme?: 'dark' | 'light'): string {
  const value = theme === 'dark' ? 0 : 1
  return `
$path = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
${mode === 'set' ? `Set-ItemProperty -Path $path -Name AppsUseLightTheme -Type DWord -Value ${value}` : ''}
${mode === 'set' ? `Set-ItemProperty -Path $path -Name SystemUsesLightTheme -Type DWord -Value ${value}` : ''}
$appsRaw = (Get-ItemProperty -Path $path -Name AppsUseLightTheme -ErrorAction SilentlyContinue).AppsUseLightTheme
$systemRaw = (Get-ItemProperty -Path $path -Name SystemUsesLightTheme -ErrorAction SilentlyContinue).SystemUsesLightTheme
@{
  appTheme = if ([int]$appsRaw -eq 0) { "dark" } else { "light" }
  systemTheme = if ([int]$systemRaw -eq 0) { "dark" } else { "light" }
} | ConvertTo-Json -Compress
`
}

export async function executeSystemActiveWindow(): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('system_active_window')
  try {
    const { stdout } = await runPowerShell(activeWindowScript())
    return { success: true, data: parseJsonOutput<unknown>(stdout) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'system_active_window failed.' }
  }
}

export async function executeSystemThemeGet(): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('system_theme_get')
  try {
    const { stdout } = await runPowerShell(themeScript('get'))
    return { success: true, data: parseJsonOutput<unknown>(stdout) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'system_theme_get failed.' }
  }
}

export async function executeSystemThemeSet(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('system_theme_set')
  const approval = requireApproval(args, 'system_theme_set')
  if (approval) return approval
  const theme = stringArg(args, 'theme')
  if (theme !== 'dark' && theme !== 'light') {
    return { success: false, error: 'theme must be "dark" or "light".' }
  }
  try {
    const { stdout } = await runPowerShell(themeScript('set', theme))
    return { success: true, data: parseJsonOutput<unknown>(stdout) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'system_theme_set failed.' }
  }
}

function parseSettingsPage(value: string): SettingsPage | null {
  return Object.prototype.hasOwnProperty.call(SETTINGS_PAGE_URIS, value)
    ? value as SettingsPage
    : null
}

export async function executeSystemSettingsOpen(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('system_settings_open')
  const approval = requireApproval(args, 'system_settings_open')
  if (approval) return approval
  const page = parseSettingsPage(stringArg(args, 'page'))
  if (!page) {
    return { success: false, error: 'page must be one of: display, sound, bluetooth, network, notifications, apps, privacy.' }
  }
  await shell.openExternal(SETTINGS_PAGE_URIS[page])
  return { success: true, data: { page } }
}

export async function executeSystemStatus(): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('system_status')
  try {
    const { stdout } = await runPowerShell(systemStatusScript())
    return { success: true, data: parseJsonOutput<unknown>(stdout) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'system_status failed.' }
  }
}

export async function executeSystemVolumeGet(): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('system_volume_get')
  try {
    const { stdout } = await runPowerShell(volumeScript('get'))
    return { success: true, data: parseJsonOutput<unknown>(stdout) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'system_volume_get failed.' }
  }
}

export async function executeSystemVolumeSet(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('system_volume_set')
  const approval = requireApproval(args, 'system_volume_set')
  if (approval) return approval
  const level = numberArg(args, 'level')
  if (level === undefined) return { success: false, error: 'level is required.' }
  try {
    const { stdout } = await runPowerShell(volumeScript('set', level))
    return { success: true, data: parseJsonOutput<unknown>(stdout) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'system_volume_set failed.' }
  }
}

export async function executeSystemMuteSet(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('system_mute_set')
  const approval = requireApproval(args, 'system_mute_set')
  if (approval) return approval
  if (!isRecord(args) || typeof args.muted !== 'boolean') {
    return { success: false, error: 'muted is required.' }
  }
  try {
    const { stdout } = await runPowerShell(volumeScript('mute', undefined, args.muted))
    return { success: true, data: parseJsonOutput<unknown>(stdout) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'system_mute_set failed.' }
  }
}

export async function executeSystemOpenPath(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('system_open_path')
  const approval = requireApproval(args, 'system_open_path')
  if (approval) return approval
  const targetPath = stringArg(args, 'path')
  if (!targetPath) return { success: false, error: 'path is required.' }
  const error = await shell.openPath(targetPath)
  if (error) return { success: false, error }
  return { success: true, data: { opened: targetPath } }
}

export async function executeWindowSnap(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('window_snap')
  const approval = requireApproval(args, 'window_snap')
  if (approval) return approval
  if (!isRecord(args)) return { success: false, error: 'window snap arguments are required.' }
  try {
    const { stdout } = await runPowerShell(windowSnapScript(args))
    return { success: true, data: parseJsonOutput<unknown>(stdout) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'window_snap failed.' }
  }
}
