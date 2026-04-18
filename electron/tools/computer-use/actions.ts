// Computer use action execution via @nut-tree-fork/nut-js
// NOTE: requires `bun add @nut-tree-fork/nut-js` before use

import { screen } from 'electron'
import { ACTION_DELAY_MS, DEFAULT_SCROLL_AMOUNT } from './constants'
import type { ClickArgs, TypeArgs, KeyArgs, ScrollArgs, CursorPositionArgs } from './types'

let nut: typeof import('@nut-tree-fork/nut-js') | null = null

async function getNut() {
  if (!nut) {
    try {
      // Use require() for Electron main process compatibility
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      nut = require('@nut-tree-fork/nut-js')
    } catch {
      throw new Error('nut.js is not installed. Run: bun add @nut-tree-fork/nut-js')
    }
  }
  return nut!
}

function validateCoords(x: number, y: number): void {
  const displays = screen.getAllDisplays()
  const inBounds = displays.some((d) => {
    const { x: dx, y: dy, width, height } = d.bounds
    return x >= dx && x < dx + width && y >= dy && y < dy + height
  })
  if (!inBounds) throw new Error(`Coordinates (${x}, ${y}) are outside screen bounds`)
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function performClick(args: ClickArgs): Promise<void> {
  const { x, y, button = 'left' } = args
  validateCoords(x, y)
  const { mouse, Button, Point } = await getNut()
  await mouse.setPosition(new Point(x, y))
  await delay(ACTION_DELAY_MS)
  const btn = button === 'right' ? Button.RIGHT : button === 'middle' ? Button.MIDDLE : Button.LEFT
  await mouse.click(btn)
}

export async function performType(args: TypeArgs): Promise<void> {
  const { text } = args
  if (!text) throw new Error('Text is required')
  const { keyboard } = await getNut()
  await keyboard.type(text)
}

export async function performKeyPress(args: KeyArgs): Promise<void> {
  const { key } = args
  if (!key) throw new Error('Key is required')
  const { keyboard, Key } = await getNut()

  const parts = key.toLowerCase().split('+').map((k) => k.trim())

  // Map common key names to Key enum values
  const keyMap: Record<string, number> = {
    ctrl: Key.LeftControl, control: Key.LeftControl,
    alt: Key.LeftAlt, option: Key.LeftAlt,
    shift: Key.LeftShift,
    meta: Key.LeftSuper, cmd: Key.LeftSuper, command: Key.LeftSuper, win: Key.LeftSuper,
    enter: Key.Enter, return: Key.Return,
    tab: Key.Tab, escape: Key.Escape, esc: Key.Escape,
    space: Key.Space, backspace: Key.Backspace, delete: Key.Delete,
    up: Key.Up, down: Key.Down, left: Key.Left, right: Key.Right,
    home: Key.Home, end: Key.End, pageup: Key.PageUp, pagedown: Key.PageDown,
    insert: Key.Insert, capslock: Key.CapsLock, numlock: Key.NumLock,
    pause: Key.Pause, print: Key.Print, scrolllock: Key.ScrollLock, menu: Key.Menu,
    f1: Key.F1, f2: Key.F2, f3: Key.F3, f4: Key.F4, f5: Key.F5, f6: Key.F6,
    f7: Key.F7, f8: Key.F8, f9: Key.F9, f10: Key.F10, f11: Key.F11, f12: Key.F12,
    f13: Key.F13, f14: Key.F14, f15: Key.F15, f16: Key.F16, f17: Key.F17, f18: Key.F18,
    f19: Key.F19, f20: Key.F20, f21: Key.F21, f22: Key.F22, f23: Key.F23, f24: Key.F24,
  }

  // Map single digit characters to Key.Num* enum values
  const digitMap: Record<string, number> = {
    '0': Key.Num0, '1': Key.Num1, '2': Key.Num2, '3': Key.Num3, '4': Key.Num4,
    '5': Key.Num5, '6': Key.Num6, '7': Key.Num7, '8': Key.Num8, '9': Key.Num9,
  }

  // Resolve each part to a Key enum value or flag it as a raw character for keyboard.type()
  const resolved: (number | string)[] = []
  for (const part of parts) {
    if (keyMap[part] !== undefined) {
      resolved.push(keyMap[part])
    } else if (part.length === 1 && digitMap[part] !== undefined) {
      resolved.push(digitMap[part])
    } else if (part.length === 1 && /^[a-z]$/.test(part)) {
      // Single letter — look up Key.A through Key.Z
      const keyVal = (Key as unknown as Record<string, number>)[part.toUpperCase()]
      if (keyVal !== undefined) {
        resolved.push(keyVal)
      } else {
        throw new Error(`Unknown key: "${part}"`)
      }
    } else if (part.length === 1) {
      // Single non-letter, non-digit character (punctuation etc.) — use as raw string
      resolved.push(part)
    } else {
      throw new Error(`Unknown key: "${part}"`)
    }
  }

  if (resolved.length === 0) throw new Error('No valid keys parsed')

  // keyboard.type() handles both single keys and combos (multiple Key args = simultaneous press)
  // It also accepts raw strings for characters not in the Key enum
  await keyboard.type(...(resolved as Parameters<typeof keyboard.type>))
}

export async function performScroll(args: ScrollArgs): Promise<void> {
  const { x, y, direction, amount = DEFAULT_SCROLL_AMOUNT } = args
  validateCoords(x, y)
  const { mouse, Point } = await getNut()
  await mouse.setPosition(new Point(x, y))
  await delay(ACTION_DELAY_MS)

  const scrollAmount = Math.max(1, Math.round(amount))
  if (direction === 'up') await mouse.scrollUp(scrollAmount)
  else if (direction === 'down') await mouse.scrollDown(scrollAmount)
  else if (direction === 'left') await mouse.scrollLeft(scrollAmount)
  else if (direction === 'right') await mouse.scrollRight(scrollAmount)
}

export async function performCursorMove(args: CursorPositionArgs): Promise<void> {
  const { x, y } = args
  validateCoords(x, y)
  const { mouse, Point } = await getNut()
  await mouse.setPosition(new Point(x, y))
}
