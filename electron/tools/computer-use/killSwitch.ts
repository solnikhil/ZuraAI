import { globalShortcut } from 'electron'
import { KILL_SWITCH_WINDOW_MS } from './constants'
import { abortSession } from './service'
import { broadcastKilled, getApprovalManager } from './index'
import { hideSpotlight } from '../../windows/spotlightOverlay'

let registered = false
let lastEscapeTime = 0

function onEscape(): void {
  const now = Date.now()
  if (now - lastEscapeTime < KILL_SWITCH_WINDOW_MS) {
    // Double-tap detected — kill everything
    lastEscapeTime = 0
    abortSession()
    getApprovalManager()?.dispose()
    hideSpotlight()
    broadcastKilled()
    unregisterKillSwitch()
  } else {
    lastEscapeTime = now
  }
}

export function registerKillSwitch(): void {
  if (registered) return
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
