import { app, BrowserWindow, shell, screen } from 'electron'
import path from 'path'

import { resolveDistPath } from './mainWindow'
import { resolveAppIconPath } from '../windowIcon'

const devServerUrl = process.env.VITE_DEV_SERVER_URL
const devServerOrigin = devServerUrl ? new URL(devServerUrl).origin : null

let commandCenterWindow: BrowserWindow | null = null
let commandCenterLayout: 'search' | 'chat' = 'search'
let commandCenterReadyToShow = false
let commandCenterShowPending = false
// Timestamp of the last show(). Used to ignore the spurious blur Windows can
// deliver while focus is still transferring to a freshly shown always-on-top
// overlay, which would otherwise hide it immediately ("can't open" flicker).
let commandCenterLastShownAt = 0
const COMMAND_CENTER_SHOW_BLUR_GRACE_MS = 250
/** Destroy the hidden CC renderer after idle to free a full Chromium process. */
const COMMAND_CENTER_IDLE_DESTROY_MS = 3 * 60 * 1000
let commandCenterIdleDestroyTimer: ReturnType<typeof setTimeout> | null = null

function clearCommandCenterIdleDestroyTimer(): void {
  if (commandCenterIdleDestroyTimer) {
    clearTimeout(commandCenterIdleDestroyTimer)
    commandCenterIdleDestroyTimer = null
  }
}

function scheduleCommandCenterIdleDestroy(): void {
  clearCommandCenterIdleDestroyTimer()
  commandCenterIdleDestroyTimer = setTimeout(() => {
    commandCenterIdleDestroyTimer = null
    const win = commandCenterWindow
    if (!win || win.isDestroyed()) return
    if (win.isVisible()) return
    destroyCommandCenterWindow()
  }, COMMAND_CENTER_IDLE_DESTROY_MS)
}

function commandCenterRouteUrl(baseUrl: string): string {
  const url = new URL(baseUrl)
  url.searchParams.set('commandCenter', '1')
  url.hash = '/command-center'
  return url.toString()
}

function isExternalHttpUrl(url: string): boolean {
  if (!url.startsWith('http:') && !url.startsWith('https:')) return false
  if (devServerOrigin && url.startsWith(devServerOrigin)) return false
  return true
}

function centerBounds(layout: 'search' | 'chat' = commandCenterLayout): {
  x: number
  y: number
  width: number
  height: number
} {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const targetWidth = layout === 'chat' ? 820 : 760
  const targetHeight = layout === 'chat' ? 640 : 480
  const width = Math.min(targetWidth, Math.max(640, Math.floor(display.workArea.width * 0.54)))
  const height = Math.min(targetHeight, Math.max(420, Math.floor(display.workArea.height * 0.72)))
  return {
    x: display.workArea.x + Math.round((display.workArea.width - width) / 2),
    y: display.workArea.y + Math.round(display.workArea.height * 0.18),
    width,
    height,
  }
}

function createCommandCenterWindow(): BrowserWindow {
  if (commandCenterWindow && !commandCenterWindow.isDestroyed()) {
    return commandCenterWindow
  }

  commandCenterReadyToShow = false
  commandCenterShowPending = false
  const distPath = resolveDistPath(__dirname)
  const bounds = centerBounds()

  commandCenterWindow = new BrowserWindow({
    ...bounds,
    title: 'ZuraAI Command Center',
    icon: resolveAppIconPath(),
    frame: false,
    transparent: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    autoHideMenuBar: true,
    // Platform-native translucency. Acrylic is the correct DWM material for a
    // transient/light-dismiss surface on Windows 11; macOS uses vibrancy. In
    // both cases the window background must be transparent (alpha 0) so the
    // system-drawn material is visible instead of an opaque fill obscuring it.
    // Other platforms fall back to a solid dark panel.
    ...(process.platform === 'win32'
      ? {
          backgroundMaterial: 'acrylic' as const,
          roundedCorners: true,
          backgroundColor: '#00000000',
        }
      : process.platform === 'darwin'
        ? {
            vibrancy: 'under-window' as const,
            visualEffectState: 'active' as const,
            backgroundColor: '#00000000',
          }
        : {
            backgroundColor: '#0b0b0f',
          }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
      spellcheck: false,
      backgroundThrottling: true,
      additionalArguments: ['--process-name=ZuraAI-CommandCenter'],
    },
  })

  if (
    process.platform === 'win32' &&
    typeof commandCenterWindow.setBackgroundMaterial === 'function'
  ) {
    commandCenterWindow.setBackgroundMaterial('acrylic')
  }

  commandCenterWindow.removeMenu()

  commandCenterWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  commandCenterWindow.webContents.on('will-navigate', (event, url) => {
    if (isExternalHttpUrl(url)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  commandCenterWindow.on('blur', () => {
    const win = commandCenterWindow
    if (!win || win.isDestroyed()) return
    // Ignore the blur that can fire in the brief moment after show() while the
    // OS is still moving focus onto the overlay. Hiding on it makes the overlay
    // flash open and vanish, which reads as "won't open". If focus genuinely
    // never lands on the overlay, re-check once the grace window has elapsed
    // and hide only if it is still not focused.
    if (Date.now() - commandCenterLastShownAt < COMMAND_CENTER_SHOW_BLUR_GRACE_MS) {
      setTimeout(() => {
        const current = commandCenterWindow
        if (!current || current.isDestroyed()) return
        if (current.isVisible() && !current.isFocused()) {
          current.hide()
        }
      }, COMMAND_CENTER_SHOW_BLUR_GRACE_MS)
      return
    }
    win.hide()
  })

  commandCenterWindow.on('closed', () => {
    commandCenterWindow = null
    commandCenterReadyToShow = false
    commandCenterShowPending = false
  })

  commandCenterWindow.once('ready-to-show', () => {
    commandCenterReadyToShow = true
    if (commandCenterShowPending) {
      commandCenterShowPending = false
      showCommandCenterWindow()
    }
  })

  const loadPromise = process.env.VITE_DEV_SERVER_URL
    ? commandCenterWindow.loadURL(commandCenterRouteUrl(process.env.VITE_DEV_SERVER_URL))
    : commandCenterWindow.loadFile(path.join(distPath, 'index.html'), {
        hash: '/command-center',
        query: { commandCenter: '1' },
      })

  void loadPromise.catch((error) => {
    console.error('[MAIN] Failed to load Command Center window:', error)
  })

  return commandCenterWindow
}

export function preloadCommandCenterWindow(): void {
  void createCommandCenterWindow()
}

function boundsEqual(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

// Re-arm the Windows DWM acrylic backdrop. Acrylic can drop to an opaque base
// frame across geometry changes, so we re-assert it right before showing.
function reapplyWindowMaterial(win: BrowserWindow): void {
  if (process.platform === 'win32' && typeof win.setBackgroundMaterial === 'function') {
    win.setBackgroundMaterial('acrylic')
  }
}

export function showCommandCenterWindow(): void {
  clearCommandCenterIdleDestroyTimer()
  const win = createCommandCenterWindow()
  commandCenterLayout = 'search'
  const bounds = centerBounds(commandCenterLayout)
  // Only move the window when the target geometry actually changed. Calling
  // setBounds forces the acrylic window to recomposite its DWM backdrop, which
  // presents an opaque transition frame (the "flash before acrylic") on every
  // open. Skipping the no-op move keeps the already-composited backdrop intact.
  if (!boundsEqual(win.getBounds(), bounds)) {
    win.setBounds(bounds)
  }
  if (!commandCenterReadyToShow) {
    commandCenterShowPending = true
    return
  }
  reapplyWindowMaterial(win)
  commandCenterLastShownAt = Date.now()
  win.setOpacity(1)
  win.show()
  win.focus()
  // Re-assert focus on the next tick. The initial focus() can lose the race
  // with the OS still finishing the show, especially when triggered from a
  // global shortcut while another app is foreground.
  setTimeout(() => {
    const current = commandCenterWindow
    if (current && !current.isDestroyed() && current.isVisible() && !current.isFocused()) {
      current.focus()
    }
  }, 60)
  win.webContents.send('command-center:shown')
}

export function setCommandCenterWindowLayout(layout: 'search' | 'chat'): void {
  commandCenterLayout = layout
  if (commandCenterWindow && !commandCenterWindow.isDestroyed()) {
    const bounds = centerBounds(layout)
    commandCenterWindow.setBounds(bounds, true)
  }
}

export function hideCommandCenterWindow(): void {
  if (commandCenterWindow && !commandCenterWindow.isDestroyed()) {
    commandCenterWindow.setOpacity(1)
    commandCenterWindow.hide()
    scheduleCommandCenterIdleDestroy()
  }
}

export function toggleCommandCenterWindow(): void {
  const win = createCommandCenterWindow()
  if (win.isVisible()) {
    hideCommandCenterWindow()
    return
  }
  showCommandCenterWindow()
}

export function destroyCommandCenterWindow(): void {
  clearCommandCenterIdleDestroyTimer()
  if (commandCenterWindow && !commandCenterWindow.isDestroyed()) {
    commandCenterWindow.destroy()
  }
  commandCenterWindow = null
}
