import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { screen, clipboard } from 'electron'
import { ACTION_DELAY_MS, DEFAULT_SCROLL_AMOUNT } from './constants'
import type { ClickArgs, TypeArgs, KeyArgs, ScrollArgs, CursorPositionArgs } from './types'

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

async function runUser32Script(script: string): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('Computer Use actions are currently supported only on Windows')
  }

  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, timeout: 10_000, maxBuffer: 64 * 1024 }
  )
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

export async function performClick(args: ClickArgs): Promise<void> {
  const { x, y, button = 'left' } = args
  validateCoords(x, y)
  const flags = mouseFlags(button)
  await runUser32Script(`${user32Prelude()}
[ZuraUser32]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null
Start-Sleep -Milliseconds ${ACTION_DELAY_MS}
[ZuraUser32]::mouse_event(${flags.down}, 0, 0, 0, [UIntPtr]::Zero)
[ZuraUser32]::mouse_event(${flags.up}, 0, 0, 0, [UIntPtr]::Zero)
`)
  await delay(ACTION_DELAY_MS)
}

export async function performType(args: TypeArgs): Promise<void> {
  const { text } = args
  if (!text) throw new Error('Text is required')

  const previousClipboard = clipboard.readText()
  try {
    clipboard.writeText(text)
    await pressVirtualKeys([0x11, 0x56])
    await delay(ACTION_DELAY_MS)
  } finally {
    clipboard.writeText(previousClipboard)
  }
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
