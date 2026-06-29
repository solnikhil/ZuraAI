import { clipboard, globalShortcut, ipcMain } from 'electron'
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
  executeSystemMuteSet,
  executeSystemOpenPath,
  executeSystemSettingsOpen,
  executeSystemStatus,
  executeSystemThemeGet,
  executeSystemThemeSet,
  executeSystemVolumeGet,
  executeSystemVolumeSet,
  executeWindowSnap,
} from './tools/os-integration'

const COMMAND_CENTER_SHORTCUT = 'CommandOrControl+Shift+Space'
const MAX_CLIPBOARD_CONTEXT_LENGTH = 4_000
const COMMAND_CENTER_ACTIONS = [
  { id: 'snap-left', label: 'Snap left', kind: 'window', aliases: ['tile left'] },
  { id: 'snap-right', label: 'Snap right', kind: 'window', aliases: ['tile right'] },
  { id: 'maximize-window', label: 'Maximize', kind: 'window', aliases: ['fullscreen', 'full screen'] },
  { id: 'volume-30', label: 'Volume 30%', kind: 'audio', aliases: ['quiet', 'lower volume'] },
  { id: 'volume-60', label: 'Volume 60%', kind: 'audio', aliases: ['medium volume'] },
  { id: 'toggle-mute', label: 'Toggle mute', kind: 'audio', aliases: ['mute', 'unmute', 'silence'] },
  { id: 'system-status', label: 'System status', kind: 'system', aliases: ['battery', 'disk', 'network status'] },
  { id: 'toggle-theme', label: 'Toggle theme', kind: 'system', aliases: ['dark mode', 'light mode'] },
  { id: 'clipboard-to-chat', label: 'Ask about clipboard', kind: 'clipboard', aliases: ['paste', 'copied text'] },
  { id: 'focus-zuraai', label: 'Focus ZuraAI', kind: 'app', aliases: ['show zura', 'open zura'] },
  { id: 'settings-display', label: 'Display settings', kind: 'settings', aliases: ['screen', 'monitor'] },
  { id: 'settings-sound', label: 'Sound settings', kind: 'settings', aliases: ['audio settings', 'speaker'] },
  { id: 'settings-network', label: 'Network settings', kind: 'settings', aliases: ['wifi', 'wi-fi', 'internet'] },
  { id: 'settings-bluetooth', label: 'Bluetooth settings', kind: 'settings', aliases: ['devices'] },
  { id: 'open-downloads', label: 'Open Downloads', kind: 'filesystem', aliases: ['downloads folder'] },
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
    case 'toggle-mute': {
      const current = await executeSystemVolumeGet()
      const muted = current.success &&
        current.data &&
        typeof current.data === 'object' &&
        (current.data as Record<string, unknown>).muted === true
      return executeSystemMuteSet({ muted: !muted, autoApprove: true })
    }
    case 'system-status':
      return executeSystemStatus()
    case 'toggle-theme': {
      const current = await executeSystemThemeGet()
      const appTheme = current.success &&
        current.data &&
        typeof current.data === 'object' &&
        (current.data as Record<string, unknown>).appTheme === 'dark'
        ? 'dark'
        : 'light'
      return executeSystemThemeSet({ theme: appTheme === 'dark' ? 'light' : 'dark', autoApprove: true })
    }
    case 'clipboard-to-chat': {
      const text = clipboard.readText().trim()
      if (!text) {
        return { success: false, error: 'Clipboard does not contain text.' }
      }
      const clipped = text.length > MAX_CLIPBOARD_CONTEXT_LENGTH
        ? `${text.slice(0, MAX_CLIPBOARD_CONTEXT_LENGTH)}\n...[clipboard truncated]`
        : text
      await sendCommandToMainWindow(`Help me with this clipboard text:\n\n${clipped}`)
      hideCommandCenterWindow()
      return { success: true, data: { queued: true, characterCount: text.length } }
    }
    case 'focus-zuraai': {
      const win = getMainWindow() ?? createMainWindow()
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      hideCommandCenterWindow()
      return { success: true, data: { focused: true } }
    }
    case 'settings-display':
      return executeSystemSettingsOpen({ page: 'display', autoApprove: true })
    case 'settings-sound':
      return executeSystemSettingsOpen({ page: 'sound', autoApprove: true })
    case 'settings-network':
      return executeSystemSettingsOpen({ page: 'network', autoApprove: true })
    case 'settings-bluetooth':
      return executeSystemSettingsOpen({ page: 'bluetooth', autoApprove: true })
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
