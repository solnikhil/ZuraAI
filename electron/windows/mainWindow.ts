import { BrowserWindow, shell } from 'electron'
import path from 'path'
import { deferredInitializer } from '../startup/deferredInit'

export function resolveDistPath(dirname: string, envDist = process.env.DIST): string {
  return envDist || path.join(dirname, '../dist')
}

const devServerUrl = process.env.VITE_DEV_SERVER_URL
const devServerOrigin = devServerUrl ? new URL(devServerUrl).origin : null

function isExternalHttpUrl(url: string): boolean {
  if (!url.startsWith('http:') && !url.startsWith('https:')) return false
  if (devServerOrigin && url.startsWith(devServerOrigin)) return false
  return true
}

// Global reference to main window
let mainWindow: BrowserWindow | null = null

export interface MainWindowOptions {
  width?: number
  height?: number
  devTools?: boolean
}

/**
 * Create and manage the main application window
 */
export function createMainWindow(options?: MainWindowOptions): BrowserWindow {
  if (mainWindow) {
    mainWindow.focus()
    return mainWindow
  }

  const distPath = resolveDistPath(__dirname)

  const isWindows = process.platform === 'win32'
  const isMacOS = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: options?.width ?? 1200,
    height: options?.height ?? 800,
    minWidth: 900,
    minHeight: 600,
    title: 'ZuraAI - Dashboard',
    icon: path.join(process.env.PUBLIC || '', 'icon.png'),
    ...(isWindows
      ? {
          frame: false,
          backgroundMaterial: 'none' as const,
        }
      : {}),
    ...(isMacOS
      ? {
          titleBarStyle: 'hidden',
          trafficLightPosition: { x: 12, y: 12 },
          vibrancy: 'sidebar' as const,
          visualEffectState: 'active' as const,
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: options?.devTools ?? true,
      spellcheck: false,
      additionalArguments: ['--process-name=ZuraAI-Dashboard'],
    },
    autoHideMenuBar: true,
    // Solid background eliminates the visible DWM frame border on Windows.
    // Frosted mode switches this to transparent at runtime via setNativeBlur().
    backgroundColor: '#14120B',
    show: false,
  })

  // Handle external links - open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Handle in-page navigation (e.g. clicking links)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isExternalHttpUrl(url)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  // Show when ready to prevent white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    // Mark window as visible and trigger deferred task execution
    deferredInitializer.markWindowVisible()
    deferredInitializer.executeAfterWindowVisible()
  })

  // Track window creation
  deferredInitializer.markWindowCreated()

  const loadPromise = process.env.VITE_DEV_SERVER_URL
    ? mainWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/dashboard`)
    : mainWindow.loadFile(path.join(distPath, 'index.html'), { hash: 'dashboard' })

  void loadPromise.catch((error) => {
    console.error('[MAIN] Failed to load main window:', error)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

/**
 * Get the current main window instance
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/**
 * Focus or create the main window
 */
export function showMainWindow(): void {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  } else {
    createMainWindow()
  }
}

/**
 * Toggle native background blur (acrylic on Windows, vibrancy on macOS).
 * Also toggles the window backgroundColor between transparent (for acrylic
 * compositing) and solid (to hide the DWM frame border in normal mode).
 */
export function setNativeBlur(enabled: boolean): void {
  if (!mainWindow) return

  try {
    if (process.platform === 'win32') {
      // Transparent background is required for acrylic; solid hides the DWM border
      mainWindow.setBackgroundColor(enabled ? '#00000000' : '#14120B')
      mainWindow.setBackgroundMaterial(enabled ? 'acrylic' : 'none')
    } else if (process.platform === 'darwin') {
      mainWindow.setVibrancy(enabled ? 'sidebar' : (null as any))
    }
  } catch {
    // Ignore if unsupported (e.g. Windows 10)
  }
}
