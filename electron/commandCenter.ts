import { globalShortcut, ipcMain } from 'electron'
import os from 'os'
import path from 'path'

import {
  createMainWindow,
  getMainWindow,
  hideCommandCenterWindow,
  showCommandCenterWindow,
  toggleCommandCenterWindow,
} from './windows'
import {
  executeSystemActiveWindow,
  executeSystemOpenPath,
  executeSystemVolumeSet,
  executeWindowSnap,
} from './tools/os-integration'

const COMMAND_CENTER_SHORTCUT = 'CommandOrControl+Shift+Space'
const COMMAND_CENTER_ACTIONS = [
  { id: 'snap-left', label: 'Snap left', kind: 'window' },
  { id: 'snap-right', label: 'Snap right', kind: 'window' },
  { id: 'maximize-window', label: 'Maximize', kind: 'window' },
  { id: 'volume-30', label: 'Volume 30%', kind: 'audio' },
  { id: 'volume-60', label: 'Volume 60%', kind: 'audio' },
  { id: 'open-downloads', label: 'Open Downloads', kind: 'filesystem' },
] as const

let extensionEnabled = false
let shortcutRegistered = false

type CommandCenterActionId = (typeof COMMAND_CENTER_ACTIONS)[number]['id']

async function getActiveWindowContext(): Promise<unknown | undefined> {
  const result = await executeSystemActiveWindow()
  return result.success ? result.data : undefined
}

async function sendCommandToMainWindow(text: string): Promise<void> {
  const win = getMainWindow() ?? createMainWindow()
  const payload = {
    text,
    receivedAt: Date.now(),
    activeWindow: await getActiveWindowContext(),
  }

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) {
        win.webContents.send('command-center:command', payload)
      }
    })
  } else {
    win.webContents.send('command-center:command', payload)
  }

  if (win.isMinimized()) {
    win.restore()
  }
  win.show()
  win.focus()
}

function registerShortcut(): boolean {
  if (shortcutRegistered) return true
  shortcutRegistered = globalShortcut.register(COMMAND_CENTER_SHORTCUT, () => {
    if (!extensionEnabled) return
    toggleCommandCenterWindow()
  })
  return shortcutRegistered
}

function isCommandCenterActionId(value: unknown): value is CommandCenterActionId {
  return typeof value === 'string' && COMMAND_CENTER_ACTIONS.some((action) => action.id === value)
}

async function executeCommandCenterAction(actionId: CommandCenterActionId) {
  switch (actionId) {
    case 'snap-left':
      return executeWindowSnap({ preset: 'left', autoApprove: true })
    case 'snap-right':
      return executeWindowSnap({ preset: 'right', autoApprove: true })
    case 'maximize-window':
      return executeWindowSnap({ preset: 'maximize', autoApprove: true })
    case 'volume-30':
      return executeSystemVolumeSet({ level: 30, autoApprove: true })
    case 'volume-60':
      return executeSystemVolumeSet({ level: 60, autoApprove: true })
    case 'open-downloads':
      return executeSystemOpenPath({
        path: path.join(os.homedir(), 'Downloads'),
        autoApprove: true,
      })
  }
}

function unregisterShortcut(): void {
  if (!shortcutRegistered) return
  globalShortcut.unregister(COMMAND_CENTER_SHORTCUT)
  shortcutRegistered = false
}

export function setCommandCenterExtensionEnabled(enabled: boolean): {
  enabled: boolean
  shortcut: string
  shortcutRegistered: boolean
} {
  extensionEnabled = enabled
  if (enabled) {
    registerShortcut()
  } else {
    unregisterShortcut()
    hideCommandCenterWindow()
  }

  return {
    enabled: extensionEnabled,
    shortcut: COMMAND_CENTER_SHORTCUT,
    shortcutRegistered,
  }
}

export function disposeCommandCenter(): void {
  unregisterShortcut()
  extensionEnabled = false
}

export function registerCommandCenterHandlers(): void {
  ipcMain.handle('command-center:set-extension-enabled', (_event, enabled: unknown) => {
    return setCommandCenterExtensionEnabled(enabled === true)
  })

  ipcMain.handle('command-center:show', () => {
    if (!extensionEnabled) return false
    showCommandCenterWindow()
    return true
  })

  ipcMain.handle('command-center:hide', () => {
    hideCommandCenterWindow()
    return true
  })

  ipcMain.handle('command-center:get-context', async () => {
    return executeSystemActiveWindow()
  })

  ipcMain.handle('command-center:list-actions', () => {
    return [...COMMAND_CENTER_ACTIONS]
  })

  ipcMain.handle('command-center:execute-action', async (_event, actionId: unknown) => {
    if (!extensionEnabled) {
      return { success: false, error: 'Command Center is disabled.' }
    }
    if (!isCommandCenterActionId(actionId)) {
      return { success: false, error: 'Command Center action is not allowed.' }
    }
    return executeCommandCenterAction(actionId)
  })

  ipcMain.handle('command-center:submit-command', async (_event, text: unknown) => {
    if (!extensionEnabled || typeof text !== 'string') {
      return { accepted: false, reason: 'Command Center is disabled.' }
    }

    const trimmed = text.trim()
    if (!trimmed) {
      return { accepted: false, reason: 'Command text is required.' }
    }

    await sendCommandToMainWindow(trimmed)
    hideCommandCenterWindow()
    return { accepted: true }
  })
}

export function unregisterCommandCenterHandlers(): void {
  ipcMain.removeHandler('command-center:set-extension-enabled')
  ipcMain.removeHandler('command-center:show')
  ipcMain.removeHandler('command-center:hide')
  ipcMain.removeHandler('command-center:get-context')
  ipcMain.removeHandler('command-center:list-actions')
  ipcMain.removeHandler('command-center:execute-action')
  ipcMain.removeHandler('command-center:submit-command')
}
