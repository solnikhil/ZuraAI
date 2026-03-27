import { app, ipcMain, BrowserWindow, shell } from 'electron'
import os from 'os'
import { setNativeBlur, showAboutWindow } from '../windows'

/**
 * Tracks which windows already have window-state listeners attached.
 *
 * The main window can ask for its maximize/fullscreen state multiple times over
 * the lifetime of the app. This guard prevents us from attaching duplicate
 * listeners to the same `BrowserWindow`, which would otherwise cause repeated
 * `window-controls:state` events and unnecessary memory usage.
 */
const windowStateListenersAttached = new WeakSet<BrowserWindow>()

/**
 * Sends the current window state to the renderer that owns the window.
 *
 * This is used by the custom title bar so the renderer can stay in sync with
 * native maximize/fullscreen transitions that happen in the main process.
 */
function emitWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.webContents.send('window-controls:state', {
    isMaximized: win.isMaximized(),
  })
}

/**
 * Ensures native window state changes are mirrored back to the renderer.
 *
 * Electron does not automatically keep a custom renderer title bar in sync with
 * native maximize and fullscreen changes, so we subscribe once per window and
 * emit the latest state whenever those events fire.
 */
function ensureWindowStateListeners(win: BrowserWindow): void {
  if (windowStateListenersAttached.has(win)) {
    return
  }

  const sendCurrentState = () => emitWindowState(win)
  win.on('maximize', sendCurrentState)
  win.on('unmaximize', sendCurrentState)
  win.on('enter-full-screen', sendCurrentState)
  win.on('leave-full-screen', sendCurrentState)
  win.on('closed', () => {
    windowStateListenersAttached.delete(win)
  })

  windowStateListenersAttached.add(win)
}

function getPlatformLabel(platform: NodeJS.Platform, version?: string): string {
  if (platform === 'win32') {
    const match = version?.match(/(\d+)\.(\d+)\.(\d+)/)
    if (match) {
      const build = parseInt(match[3], 10)
      if (build >= 22000) return 'Windows 11'
    }
    return 'Windows 10'
  }
  switch (platform) {
    case 'darwin':
      return 'macOS'
    case 'linux':
      return 'Linux'
    default:
      return platform
  }
}

/**
 * Registers IPC channels that expose OS- and window-level capabilities to the
 * renderer through the preload allowlist.
 *
 * These handlers sit on the trusted side of the Electron boundary. The renderer
 * is treated as untrusted, so anything registered here should stay narrow,
 * explicit, and safe to call from UI code.
 */
export function registerSystemHandlers(): void {
  /**
   * Applies native blur styling to the main window.
   *
   * Channel: `set-native-blur`
   * Type: fire-and-forget event
   *
   * This is intentionally a simple boolean toggle because the renderer should
   * not be allowed to pass arbitrary window styling options into the main
   * process.
   */
  ipcMain.on('set-native-blur', (_event, enabled: boolean) => {
    setNativeBlur(!!enabled)
  })

  /**
   * Native window controls exposed to the custom renderer title bar.
   *
   * These handlers intentionally resolve the target window from the sender's
   * `webContents` instead of accepting a window identifier from the renderer.
   * That keeps the IPC surface scoped to the caller's own window.
   */
  ipcMain.handle('window-controls:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    ensureWindowStateListeners(win)
    win.minimize()
  })

  /**
   * Toggles maximize state for the sender's window and immediately publishes the
   * updated state back to the renderer.
   *
   * Channel: `window-controls:toggle-maximize`
   * Type: request/response
   */
  ipcMain.handle('window-controls:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    ensureWindowStateListeners(win)
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
    emitWindowState(win)
  })

  /**
   * Closes the sender's window.
   *
   * Channel: `window-controls:close`
   * Type: request/response
   */
  ipcMain.handle('window-controls:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  /**
   * Returns whether the sender's window is currently maximized.
   *
   * Channel: `window-controls:is-maximized`
   * Type: request/response
   */
  ipcMain.handle('window-controls:is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    ensureWindowStateListeners(win)
    return win.isMaximized()
  })

  /**
   * Returns app/runtime metadata for the titlebar about dialog.
   *
   * Channel: `app-info:get`
   * Type: request/response
   */
  ipcMain.handle('app-info:get', () => {
    const systemVersion = typeof process.getSystemVersion === 'function'
      ? process.getSystemVersion()
      : os.release()

    // Get git info from build-time env variables
    const commitHash = process.env.VITE_GIT_COMMIT_HASH || 'unknown'
    const commitDate = process.env.VITE_GIT_COMMIT_DATE || 'unknown'

    return {
      appName: app.getName(),
      appVersion: app.getVersion(),
      channel: app.isPackaged ? 'Installed build' : 'Development build',
      isPackaged: app.isPackaged,
      electronVersion: process.versions.electron ?? 'Unknown',
      chromiumVersion: process.versions.chrome ?? 'Unknown',
      nodeVersion: process.versions.node ?? 'Unknown',
      v8Version: process.versions.v8 ?? 'Unknown',
      osVersion: `${getPlatformLabel(process.platform, systemVersion)} ${systemVersion} (${os.arch()})`,
      commitHash,
      commitDate,
    }
  })

  /**
   * Opens the dedicated About window.
   *
   * Channel: `app-info:open-about-window`
   * Type: request/response
   */
ipcMain.handle('app-info:open-about-window', () => {
    showAboutWindow()
  })

  /**
   * Opens a URL in the default browser.
   *
   * Channel: `shell:open-external`
   * Type: request/response
   *
   * Only allows http/https URLs to prevent security issues.
   */
  ipcMain.handle('shell:open-external', async (_event, url: unknown) => {
    if (typeof url !== 'string') return

    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return
      }
      await shell.openExternal(url)
    } catch {
      // Invalid URL, ignore
    }
  })

  /**
   * Opens DevTools and inspects the element at the given coordinates.
   *
   * Channel: `devtools:inspect-element`
   * Type: request/response
   *
   * Only works in development mode. Coordinates are from the renderer's
   * perspective (clientX/clientY from the contextmenu event).
   */
  ipcMain.handle('devtools:inspect-element', (event, x: unknown, y: unknown) => {
    if (!app.isPackaged) {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && !win.isDestroyed()) {
        const coordX = typeof x === 'number' ? Math.round(x) : 0
        const coordY = typeof y === 'number' ? Math.round(y) : 0
        win.webContents.inspectElement(coordX, coordY)
      }
    }
  })

  /**
   * Applies explicit bounds to the sender's window.
   *
   * Channel: `window-resize`
   * Type: request/response
   *
   * This exists to support custom transparent/frosted window chrome where
   * native resize affordances may not be available. Input is treated as
   * untrusted and validated defensively before any bounds are applied.
   */
  ipcMain.handle('window-resize', (event, newBounds: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    // Validate that the renderer passed the minimum shape required for bounds.
    // We avoid trusting object structure from IPC input.
    if (
      typeof newBounds !== 'object' ||
      newBounds === null ||
      !('x' in newBounds) ||
      !('y' in newBounds) ||
      !('width' in newBounds) ||
      !('height' in newBounds)
    ) {
      return
    }

    const bounds = newBounds as { x: unknown; y: unknown; width: unknown; height: unknown }

    // Coerce incoming values and reject anything non-finite so malformed input
    // cannot produce invalid BrowserWindow bounds.
    const x = Number(bounds.x)
    const y = Number(bounds.y)
    const width = Number(bounds.width)
    const height = Number(bounds.height)

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      return
    }

    // Enforce a minimum size so the window remains usable even if the renderer
    // requests dimensions that are too small for the application's layout.
    const MIN_WIDTH = 900
    const MIN_HEIGHT = 600

    const clampedBounds = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(MIN_WIDTH, Math.round(width)),
      height: Math.max(MIN_HEIGHT, Math.round(height)),
    }

    win.setBounds(clampedBounds)
  })

}

/**
 * Removes all system IPC handlers registered by `registerSystemHandlers`.
 *
 * This is mainly useful during teardown, reload, or test flows where the main
 * process may be initialized more than once and duplicate handler registration
 * would otherwise throw.
 */
export function unregisterSystemHandlers(): void {
  ipcMain.removeAllListeners('set-native-blur')
  ipcMain.removeHandler('window-resize')
  ipcMain.removeHandler('window-controls:minimize')
  ipcMain.removeHandler('window-controls:toggle-maximize')
  ipcMain.removeHandler('window-controls:close')
  ipcMain.removeHandler('window-controls:is-maximized')
  ipcMain.removeHandler('app-info:get')
  ipcMain.removeHandler('app-info:open-about-window')
  ipcMain.removeHandler('shell:open-external')
  ipcMain.removeHandler('devtools:inspect-element')
}
