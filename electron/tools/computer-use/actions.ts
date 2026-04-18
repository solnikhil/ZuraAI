// Computer use action execution via @nut-tree-fork/nut-js
// NOTE: requires `bun add @nut-tree-fork/nut-js` before use

import { screen } from 'electron'
import { ACTION_DELAY_MS, DEFAULT_SCROLL_AMOUNT } from './constants'
import type { ClickArgs, TypeArgs, KeyArgs, ScrollArgs, CursorPositionArgs } from './types'

let nut: typeof import('@nut-tree-fork/nut-js') | null = null

async function getNut() {
  if (!nut) {
    try {
      nut = await import('@nut-tree-fork/nut-js')
    } catch {
      throw new Error('nut.js is not installed. Run: bun add @nut-tree-fork/nut-js')
    }
  }
  return nut
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
  const keyMap: Record<string, number> = {
    ctrl: Key.LeftControl, control: Key.LeftControl,
    alt: Key.LeftAlt, option: Key.LeftAlt,
    shift: Key.LeftShift,
    meta: Key.LeftSuper, cmd: Key.LeftSuper, command: Key.LeftSuper, win: Key.LeftSuper,
    enter: Key.Return, return: Key.Return,
    tab: Key.Tab, escape: Key.Escape, esc: Key.Escape,
    space: Key.Space, backspace: Key.Backspace, delete: Key.Delete,
    up: Key.Up, down: Key.Down, left: Key.Left, right: Key.Right,
    home: Key.Home, end: Key.End, pageup: Key.PageUp, pagedown: Key.PageDown,
    f1: Key.F1, f2: Key.F2, f3: Key.F3, f4: Key.F4, f5: Key.F5, f6: Key.F6,
    f7: Key.F7, f8: Key.F8, f9: Key.F9, f10: Key.F10, f11: Key.F11, f12: Key.F12,
  }

  const keys: number[] = []
  for (const part of parts) {
    if (keyMap[part] !== undefined) {
      keys.push(keyMap[part])
    } else if (part.length === 1) {
      // Single character — use Key enum for letters/digits
      const upper = part.toUpperCase()
      const keyVal = (Key as unknown as Record<string, number>)[upper]
      if (keyVal !== undefined) {
        keys.push(keyVal)
      } else {
        throw new Error(`Unknown key: "${part}"`)
      }
    } else {
      throw new Error(`Unknown key: "${part}"`)
    }
  }

  if (keys.length === 0) throw new Error('No valid keys parsed')

  if (keys.length === 1) {
    await keyboard.pressKey(keys[0])
    await keyboard.releaseKey(keys[0])
  } else {
    // Hold modifiers, press last key, release all
    const modifiers = keys.slice(0, -1)
    const mainKey = keys[keys.length - 1]
    for (const mod of modifiers) await keyboard.pressKey(mod)
    await keyboard.pressKey(mainKey)
    await keyboard.releaseKey(mainKey)
    for (const mod of modifiers.reverse()) await keyboard.releaseKey(mod)
  }
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
