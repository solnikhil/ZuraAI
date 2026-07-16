import { app, BrowserWindow, shell, type IpcMainInvokeEvent } from 'electron'
import type { AppMenuCommand } from '../../src/electron/types'
import { showAboutWindow } from '../windows'
import { registerAppInfoHandlers, unregisterAppInfoHandlers } from './appInfoHandlers'
import {
  registerExternalOpenHandlers,
  unregisterExternalOpenHandlers,
} from './externalOpenHandlers'
import {
  registerNativeInteractionHandlers,
  unregisterNativeInteractionHandlers,
} from './nativeInteractionHandlers'
import { trustedIpcMain as ipcMain } from './trustedIpc'
import {
  emitWindowState,
  ensureWindowStateListeners,
  registerWindowControlHandlers,
  unregisterWindowControlHandlers,
} from './windowControlHandlers'

const HELP_URL = 'https://github.com/solnikhil/ZuraAI'
const APP_MENU_COMMANDS = new Set<AppMenuCommand>([
  'new-chat',
  'open-settings',
  'open-about',
  'reload',
  'toggle-devtools',
  'reset-zoom',
  'zoom-in',
  'zoom-out',
  'toggle-fullscreen',
  'minimize',
  'toggle-maximize',
  'close-window',
  'open-help',
])

function isAppMenuCommand(value: unknown): value is AppMenuCommand {
  return typeof value === 'string' && APP_MENU_COMMANDS.has(value as AppMenuCommand)
}

async function executeAppMenuCommand(
  event: IpcMainInvokeEvent,
  command: AppMenuCommand
): Promise<boolean> {
  const win = BrowserWindow.fromWebContents(event.sender)
  switch (command) {
    case 'new-chat':
      event.sender.send('app:new-chat')
      return true
    case 'open-settings':
      event.sender.send('settings:navigate', 'providers')
      return true
    case 'open-about':
      showAboutWindow()
      return true
    case 'reload':
      event.sender.reload()
      return true
    case 'toggle-devtools':
      if (app.isPackaged) return false
      event.sender.toggleDevTools()
      return true
    case 'reset-zoom':
      event.sender.setZoomLevel(0)
      return true
    case 'zoom-in':
      event.sender.setZoomLevel(event.sender.getZoomLevel() + 0.5)
      return true
    case 'zoom-out':
      event.sender.setZoomLevel(event.sender.getZoomLevel() - 0.5)
      return true
    case 'toggle-fullscreen':
      if (!win) return false
      win.setFullScreen(!win.isFullScreen())
      emitWindowState(win)
      return true
    case 'minimize':
      if (!win) return false
      ensureWindowStateListeners(win)
      win.minimize()
      return true
    case 'toggle-maximize':
      if (!win) return false
      ensureWindowStateListeners(win)
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
      emitWindowState(win)
      return true
    case 'close-window':
      win?.close()
      return Boolean(win)
    case 'open-help':
      await shell.openExternal(HELP_URL)
      return true
  }
}

export function registerSystemHandlers(): void {
  registerWindowControlHandlers()
  registerExternalOpenHandlers()
  registerAppInfoHandlers()
  registerNativeInteractionHandlers()
  ipcMain.handle('app-menu:command', async (event, command: unknown) =>
    isAppMenuCommand(command) ? executeAppMenuCommand(event, command) : false
  )
}

export function unregisterSystemHandlers(): void {
  ipcMain.removeHandler('app-menu:command')
  unregisterNativeInteractionHandlers()
  unregisterAppInfoHandlers()
  unregisterExternalOpenHandlers()
  unregisterWindowControlHandlers()
}
