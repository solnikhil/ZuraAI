import { BrowserWindow, globalShortcut } from 'electron'
import { KILL_SWITCH_WINDOW_MS } from './constants'
import { hideSpotlight } from '../../windows/spotlightOverlay'

let registered = false
let lastEscapeTime = 0
let onKillCallback: (() => void) | null = null

function broadcastKilled(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('computer-use:killed')
    }
  }
}

function onEscape(): void {
  const now = Date.now()
  if (now - lastEscapeTime < KILL_SWITCH_WINDOW_MS) {
    // Double-tap detected — kill everything
    lastEscapeTime = 0
    onKillCallback?.()
    hideSpotlight()
    broadcastKilled()
    unregisterKillSwitch()
  } else {
    lastEscapeTime = now
  }
}

export function registerKillSwitch(onKill?: () => void): void {
  if (registered) return
  if (onKill) {
    onKillCallback = onKill
  }
  try {
    globalShortcut.register('Escape', onEscape)
    registered = true
  } catch {
    // Escape may already be registered by another module
  }
}

export function unregisterKillSwitch(): void {
  if (!registered) return
  try {
    globalShortcut.unregister('Escape')
  } catch { /* ignore */ }
  registered = false
  lastEscapeTime = 0
}
