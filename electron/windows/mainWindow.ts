import { app, BrowserWindow, shell } from 'electron'
import path from 'path'
import { deferredInitializer } from '../startup/deferredInit'
import { resolveAppIconPath } from '../windowIcon'

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

/**
 * Show an error message in the fallback UI embedded in index.html.
 * Replaces the "Loading" text with the error, hides the spinner, and shows the hint.
 * If the renderer is crashed, loads a minimal inline error page instead.
 */
function showFallbackError(win: BrowserWindow, message: string): void {
  const escaped = message.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')

  win.webContents
    .executeJavaScript(
      `(function() {
        var t = document.getElementById('fallback-text');
        var h = document.getElementById('fallback-slow');
        if (t) {
          t.textContent = '${escaped}';
          t.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
          t.style.fontSize = '14px';
          t.style.color = '#d6d3d1';
          t.style.opacity = '1';
          t.style.animation = 'none';
          t.style.letterSpacing = 'normal';
        }
        if (h) { h.textContent = 'Try restarting the app.'; h.style.opacity = '1'; }
        return true;
      })()`
    )
    .catch(() => {
      // webContents is dead — load an inline error page
      const safe = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const html = `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html><body style="margin:0;position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#14120B;color:#d6d3d1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;padding:2rem;">
<div style="font-size:14px;">${safe}</div>
<div style="font-size:12px;color:#57534e;margin-top:16px;">Try restarting the app.</div>
</body></html>`)}`
      win.loadURL(html).catch((error) => {
        console.warn('[MAIN] Failed to load fallback inline error page:', error)
      })
    })

  if (!win.isVisible()) win.show()
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
    minWidth: 820,
    minHeight: 600,
    title: 'ZuraAI - Dashboard',
    icon: resolveAppIconPath(),
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
      devTools: options?.devTools ?? !app.isPackaged,
      backgroundThrottling: false,
      spellcheck: isMacOS,
      additionalArguments: ['--process-name=ZuraAI-Dashboard'],
    },
    autoHideMenuBar: isWindows,
    // Keep the main window on a solid background to avoid transparent border artifacts
    // and compositor instability on Windows.
    backgroundColor: '#14120B',
    show: false,
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isExternalHttpUrl(url)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  let hasShownMainWindow = false
  const showMainWindowWhenReady = () => {
    if (hasShownMainWindow || !mainWindow || mainWindow.isDestroyed()) return

    hasShownMainWindow = true
    mainWindow.show()

    // Mark window as visible and trigger deferred task execution.
    deferredInitializer.markWindowVisible()
    deferredInitializer.executeAfterWindowVisible()
  }

  // In development, wait for did-finish-load so the app route is mounted before
  // showing the window. This avoids exposing the launch fallback screen.
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.webContents.once('did-finish-load', showMainWindowWhenReady)
  } else {
    // In production, keep ready-to-show to minimize startup latency.
    mainWindow.once('ready-to-show', showMainWindowWhenReady)
  }

  // Track window creation
  deferredInitializer.markWindowCreated()

  const loadPromise = process.env.VITE_DEV_SERVER_URL
    ? mainWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/dashboard`)
    : mainWindow.loadFile(path.join(distPath, 'index.html'), { hash: 'dashboard' })

  void loadPromise.catch((error) => {
    console.error('[MAIN] Failed to load main window:', error)
    showFallbackError(mainWindow!, String(error?.message || error))
  })

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[MAIN] did-fail-load: code=${errorCode} desc="${errorDescription}" url="${validatedURL}"`
      )
      // -3 is ERR_ABORTED which fires on normal navigation, ignore it
      if (errorCode === -3) return
      showFallbackError(
        mainWindow!,
        `Failed to load: ${errorDescription} (code ${errorCode})\nURL: ${validatedURL}`
      )
    }
  )

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[MAIN] Renderer process gone:', details.reason, details.exitCode)
    showFallbackError(
      mainWindow!,
      `Renderer process ${details.reason}${details.exitCode != null ? ` (exit code ${details.exitCode})` : ''}`
    )
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
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  } else {
    createMainWindow()
  }
}
