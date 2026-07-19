import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { screen, clipboard } from 'electron'
import { ACTION_DELAY_MS, DEFAULT_SCROLL_AMOUNT } from './constants'
import type { ClickArgs, TypeArgs, KeyArgs, ScrollArgs, CursorPositionArgs } from './types'
import type { DisplayBounds } from './coordinates'

const execFileAsync = promisify(execFile)

type MouseButton = 'left' | 'right' | 'middle'

function validateCoords(x: number, y: number): void {
  const displays = screen.getAllDisplays()
  const inBounds = displays.some((d) => {
    const { x: dx, y: dy, width, height } = d.bounds
    return x >= dx && x < dx + width && y >= dy && y < dy + height
  })
  if (!inBounds) throw new Error(`Coordinates (${x}, ${y}) are outside screen bounds`)
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function runUser32Script(script: string): Promise<string> {
  if (process.platform !== 'win32') {
    throw new Error('Computer Use actions are currently supported only on Windows')
  }

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, timeout: 10_000, maxBuffer: 64 * 1024, encoding: 'utf8' }
  )
  return stdout
}

function user32Prelude(): string {
  return `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class ZuraUser32 {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extraInfo);
}
"@
`
}

function mouseFlags(button: MouseButton): { down: number; up: number } {
  if (button === 'right') return { down: 0x0008, up: 0x0010 }
  if (button === 'middle') return { down: 0x0020, up: 0x0040 }
  return { down: 0x0002, up: 0x0004 }
}

function virtualKeyForName(part: string): number | null {
  const map: Record<string, number> = {
    ctrl: 0x11,
    control: 0x11,
    alt: 0x12,
    option: 0x12,
    shift: 0x10,
    meta: 0x5b,
    cmd: 0x5b,
    command: 0x5b,
    win: 0x5b,
    enter: 0x0d,
    return: 0x0d,
    tab: 0x09,
    escape: 0x1b,
    esc: 0x1b,
    space: 0x20,
    backspace: 0x08,
    delete: 0x2e,
    up: 0x26,
    down: 0x28,
    left: 0x25,
    right: 0x27,
    home: 0x24,
    end: 0x23,
    pageup: 0x21,
    pagedown: 0x22,
    insert: 0x2d,
    capslock: 0x14,
    numlock: 0x90,
    pause: 0x13,
    print: 0x2c,
    scrolllock: 0x91,
    menu: 0x5d,
  }

  if (map[part] !== undefined) return map[part]
  const functionKey = /^f([1-9]|1\d|2[0-4])$/.exec(part)
  if (functionKey) return 0x70 + Number(functionKey[1]) - 1
  if (/^[a-z]$/.test(part)) return part.toUpperCase().charCodeAt(0)
  if (/^[0-9]$/.test(part)) return part.charCodeAt(0)
  return null
}

async function pressVirtualKeys(keys: number[]): Promise<void> {
  if (keys.length === 0) throw new Error('No valid keys parsed')

  const keyDown = keys
    .map((vk) => `[ZuraUser32]::keybd_event([byte]${vk}, 0, 0, [UIntPtr]::Zero)`)
    .join('\n')
  const keyUp = [...keys]
    .reverse()
    .map((vk) => `[ZuraUser32]::keybd_event([byte]${vk}, 0, 2, [UIntPtr]::Zero)`)
    .join('\n')

  await runUser32Script(`${user32Prelude()}
${keyDown}
Start-Sleep -Milliseconds ${ACTION_DELAY_MS}
${keyUp}
`)
}

export interface ClickTarget {
  hwnd: number
  capturedBounds: DisplayBounds
}

export interface ClickDeliveryEvidence {
  targeted: boolean
  foregroundVerified: boolean
  hitTestVerified: boolean
  targetHwnd?: number
}

export async function performClick(
  args: ClickArgs,
  target?: ClickTarget
): Promise<ClickDeliveryEvidence> {
  const { x, y, button = 'left' } = args
  validateCoords(x, y)
  const flags = mouseFlags(button)
  if (!target) {
    await runUser32Script(`${user32Prelude()}
[ZuraUser32]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null
Start-Sleep -Milliseconds ${ACTION_DELAY_MS}
[ZuraUser32]::mouse_event(${flags.down}, 0, 0, 0, [UIntPtr]::Zero)
[ZuraUser32]::mouse_event(${flags.up}, 0, 0, 0, [UIntPtr]::Zero)
`)
    await delay(ACTION_DELAY_MS)
    return { targeted: false, foregroundVerified: false, hitTestVerified: false }
  }

  const bounds = target.capturedBounds
  const stdout = await runUser32Script(`
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public struct ZuraPoint { public int X; public int Y; }
public struct ZuraRect { public int Left; public int Top; public int Right; public int Bottom; }
public static class ZuraVerifiedClick {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint source, uint target, bool attach);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out ZuraRect rect);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(ZuraPoint point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);
}
"@
$target = [IntPtr]${Math.trunc(target.hwnd)}
if (-not [ZuraVerifiedClick]::IsWindow($target)) { throw 'The captured target window is no longer available. Capture a fresh screenshot.' }
if ([ZuraVerifiedClick]::IsIconic($target)) { [ZuraVerifiedClick]::ShowWindowAsync($target, 9) | Out-Null }
$foregroundBefore = [ZuraVerifiedClick]::GetForegroundWindow()
$ignoredPid = [uint32]0
$foregroundThread = [ZuraVerifiedClick]::GetWindowThreadProcessId($foregroundBefore, [ref]$ignoredPid)
$currentThread = [ZuraVerifiedClick]::GetCurrentThreadId()
$attached = $false
try {
  if ($foregroundThread -ne 0 -and $foregroundThread -ne $currentThread) {
    $attached = [ZuraVerifiedClick]::AttachThreadInput($currentThread, $foregroundThread, $true)
  }
  [ZuraVerifiedClick]::BringWindowToTop($target) | Out-Null
  [ZuraVerifiedClick]::SetForegroundWindow($target) | Out-Null
} finally {
  if ($attached) { [ZuraVerifiedClick]::AttachThreadInput($currentThread, $foregroundThread, $false) | Out-Null }
}
$focused = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  $foreground = [ZuraVerifiedClick]::GetForegroundWindow()
  if ($foreground -eq $target) { $focused = $true; break }
  Start-Sleep -Milliseconds 25
}
if (-not $focused) { throw 'Windows did not place the captured app in the foreground. No click was sent.' }
$rect = New-Object ZuraRect
if (-not [ZuraVerifiedClick]::GetWindowRect($target, [ref]$rect)) { throw 'The target window bounds could not be revalidated. No click was sent.' }
$tolerance = 2
if ([Math]::Abs($rect.Left - ${Math.round(bounds.x)}) -gt $tolerance -or
    [Math]::Abs($rect.Top - ${Math.round(bounds.y)}) -gt $tolerance -or
    [Math]::Abs(($rect.Right - $rect.Left) - ${Math.round(bounds.width)}) -gt $tolerance -or
    [Math]::Abs(($rect.Bottom - $rect.Top) - ${Math.round(bounds.height)}) -gt $tolerance) {
  throw 'The target window moved or resized after the screenshot. Capture a fresh screenshot before clicking.'
}
$clickX = ${Math.round(x)}
$clickY = ${Math.round(y)}
if ($clickX -lt $rect.Left -or $clickX -ge $rect.Right -or $clickY -lt $rect.Top -or $clickY -ge $rect.Bottom) {
  throw 'The requested click is outside the captured app window. No click was sent.'
}
[ZuraVerifiedClick]::SetCursorPos($clickX, $clickY) | Out-Null
Start-Sleep -Milliseconds ${ACTION_DELAY_MS}
$point = New-Object ZuraPoint
$point.X = $clickX
$point.Y = $clickY
$hitWindow = [ZuraVerifiedClick]::WindowFromPoint($point)
$hitRoot = [ZuraVerifiedClick]::GetAncestor($hitWindow, 2)
$foreground = [ZuraVerifiedClick]::GetForegroundWindow()
if ($foreground -ne $target) { throw 'The target app lost foreground focus before the click. No click was sent.' }
if ($hitRoot -ne $target) { throw 'Another window covers the requested point. No click was sent.' }
[ZuraVerifiedClick]::mouse_event(${flags.down}, 0, 0, 0, [UIntPtr]::Zero)
[ZuraVerifiedClick]::mouse_event(${flags.up}, 0, 0, 0, [UIntPtr]::Zero)
@{ targeted = $true; foregroundVerified = $true; hitTestVerified = $true; targetHwnd = ${Math.trunc(target.hwnd)} } | ConvertTo-Json -Compress
`)
  await delay(ACTION_DELAY_MS)
  const evidence = JSON.parse(stdout.trim()) as ClickDeliveryEvidence
  return evidence
}

/**
 * Paste text through the clipboard + Ctrl+V.
 * Used for Unicode/emoji-safe insertion (keybd_event cannot type astral-plane chars).
 * Restores the prior clipboard after a short settle so the target app can paste first.
 *
 * When `alreadyOnClipboard` is true, the caller already wrote `text` to the clipboard
 * and must pass `restoreClipboard` as the user's previous clipboard value.
 */
export async function pasteTextViaClipboard(
  text: string,
  options: {
    settleMs?: number
    alreadyOnClipboard?: boolean
    restoreClipboard?: string
  } = {}
): Promise<void> {
  if (!text) throw new Error('Text is required')
  const settleMs = options.settleMs ?? 50

  const previousClipboard =
    options.restoreClipboard !== undefined ? options.restoreClipboard : clipboard.readText()
  try {
    if (!options.alreadyOnClipboard) {
      clipboard.writeText(text)
    }
    if (process.platform === 'darwin') {
      await execFileAsync('osascript', [
        '-e',
        'tell application "System Events" to keystroke "v" using command down',
      ])
    } else {
      await pressVirtualKeys([0x11, 0x56]) // Ctrl+V
    }
    await delay(settleMs)
  } finally {
    try {
      clipboard.writeText(previousClipboard)
    } catch {
      // Best-effort restore; do not fail the paste if restore throws.
    }
  }
}

export async function performType(args: TypeArgs): Promise<void> {
  const { text } = args
  if (!text) throw new Error('Text is required')
  await pasteTextViaClipboard(text)
}

export async function performKeyPress(args: KeyArgs): Promise<void> {
  const { key } = args
  if (!key) throw new Error('Key is required')

  const parts = key
    .toLowerCase()
    .split('+')
    .map((k) => k.trim())
  const resolved: number[] = []
  for (const part of parts) {
    const vk = virtualKeyForName(part)
    if (vk == null) throw new Error(`Unknown key: "${part}"`)
    resolved.push(vk)
  }

  await pressVirtualKeys(resolved)
}

export async function performScroll(args: ScrollArgs): Promise<void> {
  const { x, y, direction, amount = DEFAULT_SCROLL_AMOUNT } = args
  validateCoords(x, y)

  const scrollAmount = Math.max(1, Math.round(amount))
  const isHorizontal = direction === 'left' || direction === 'right'
  const wheelFlag = isHorizontal ? 0x1000 : 0x0800
  const sign = direction === 'up' || direction === 'right' ? 1 : -1
  const wheelData = sign * scrollAmount * 120

  await runUser32Script(`${user32Prelude()}
[ZuraUser32]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null
Start-Sleep -Milliseconds ${ACTION_DELAY_MS}
[ZuraUser32]::mouse_event(${wheelFlag}, 0, 0, ${wheelData}, [UIntPtr]::Zero)
`)
}

export async function performCursorMove(args: CursorPositionArgs): Promise<void> {
  const { x, y } = args
  validateCoords(x, y)
  await runUser32Script(`${user32Prelude()}
[ZuraUser32]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null
`)
}
