import { BrowserWindow, nativeTheme } from 'electron'
import type { WindowAppearance } from '../../src/electron/types'
import { trustedIpcMain as ipcMain } from './trustedIpc'
import { MAIN_WINDOW_MIN_HEIGHT, MAIN_WINDOW_MIN_WIDTH } from '../windows/windowBounds'

const windowStateListenersAttached = new WeakSet<BrowserWindow>()

export function emitWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.webContents.send('window-controls:state', { isMaximized: win.isMaximized() })
}

export function ensureWindowStateListeners(win: BrowserWindow): void {
  if (windowStateListenersAttached.has(win)) return
  const sendCurrentState = () => emitWindowState(win)
  win.on('maximize', sendCurrentState)
  win.on('unmaximize', sendCurrentState)
  win.on('enter-full-screen', sendCurrentState)
  win.on('leave-full-screen', sendCurrentState)
  win.on('closed', () => windowStateListenersAttached.delete(win))
  windowStateListenersAttached.add(win)
}

function sanitizeWindowAppearance(value: unknown): WindowAppearance | null {
  if (typeof value !== 'object' || value === null) return null
  const appearance = value as Record<string, unknown>
  if (
    (appearance.material !== 'solid' && appearance.material !== 'acrylic') ||
    (appearance.themeSource !== 'light' &&
      appearance.themeSource !== 'dark' &&
      appearance.themeSource !== 'system')
  ) {
    return null
  }
  return { material: appearance.material, themeSource: appearance.themeSource }
}

export function registerWindowControlHandlers(): void {
  ipcMain.handle('window-controls:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    ensureWindowStateListeners(win)
    win.minimize()
  })
  ipcMain.handle('window-controls:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    ensureWindowStateListeners(win)
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    emitWindowState(win)
  })
  ipcMain.handle('window-controls:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle('window-controls:is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    ensureWindowStateListeners(win)
    return win.isMaximized()
  })
  ipcMain.handle('window-controls:set-appearance', (event, value: unknown) => {
    const appearance = sanitizeWindowAppearance(value)
    if (!appearance) return false
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return false
    nativeTheme.themeSource = appearance.themeSource
    if (process.platform === 'win32' && typeof win.setBackgroundMaterial === 'function') {
      try {
        win.setBackgroundMaterial(appearance.material === 'acrylic' ? 'acrylic' : 'none')
      } catch {
        return false
      }
    }
    return true
  })
  ipcMain.handle('window-resize', (event, value: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || typeof value !== 'object' || value === null) return
    const bounds = value as Record<string, unknown>
    const x = Number(bounds.x)
    const y = Number(bounds.y)
    const width = Number(bounds.width)
    const height = Number(bounds.height)
    if (![x, y, width, height].every(Number.isFinite)) return
    win.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(MAIN_WINDOW_MIN_WIDTH, Math.round(width)),
      height: Math.max(MAIN_WINDOW_MIN_HEIGHT, Math.round(height)),
    })
  })
}

export function unregisterWindowControlHandlers(): void {
  for (const channel of [
    'window-controls:minimize',
    'window-controls:toggle-maximize',
    'window-controls:close',
    'window-controls:is-maximized',
    'window-controls:set-appearance',
    'window-resize',
  ]) {
    ipcMain.removeHandler(channel)
  }
}
