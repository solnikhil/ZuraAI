import { app, BrowserWindow } from 'electron'
import path from 'path'
import { deferredInitializer } from '../startup/deferredInit'
import { log } from '../startup/logger'
import { resolveAppIconPath } from '../windowIcon'
import { trackAppCrash, trackAppError } from '../analytics'
import { installExternalNavigationGuards } from './externalNavigation'

const windowLog = log.withTag('window')

export function resolveDistPath(dirname: string, envDist = process.env.DIST): string {
  return envDist || path.join(dirname, '../dist')
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
      win.loadURL(html).catch(() => {
        windowLog.warn('failed to load fallback inline error page')
      })
    })

  if (!win.isVisible()) win.show()
}

// Global reference to main window
let mainWindow: BrowserWindow | null = null

/**
 * When true, the next main-window close is allowed to fully close (Quit from tray
 * / app.quit). Otherwise X/close hides to tray so the app can keep running with
 * a throttled renderer for background automations.
 */
let allowMainWindowClose = false

/** When true, macOS close should destroy the window (app is quitting). */
let isAppQuitting = false

export function setAppQuitting(quitting: boolean): void {
  isAppQuitting = quitting
}

export function getAppQuitting(): boolean {
  return isAppQuitting
}

export interface MainWindowOptions {
  width?: number
  height?: number
  devTools?: boolean
}

function applyBackgroundThrottling(win: BrowserWindow, enabled: boolean): void {
  try {
    win.webContents.setBackgroundThrottling(enabled)
  } catch {
    // Older Electron builds may not expose the setter; webPreferences default still applies.
  }
}

function syncMainWindowThrottling(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  // Park the renderer when the window is not actively foregrounded.
  const shouldThrottle =
    !mainWindow.isVisible() || mainWindow.isMinimized() || !mainWindow.isFocused()
  applyBackgroundThrottling(mainWindow, shouldThrottle)
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
    title: 'ZuraAI',
    icon: resolveAppIconPath(),
    ...(isWindows
      ? {
          frame: false,
          // Keep the native window opaque at the compositor level so Windows 11
          // can apply its rounded DWM frame. The renderer/background remain
          // alpha-transparent below, allowing the acrylic material to show.
          transparent: false,
          roundedCorners: true,
          backgroundMaterial: 'acrylic' as const,
        }
      : {}),
    ...(isMacOS
      ? {
          titleBarStyle: 'hidden' as const,
          // Centered in the 38px Mac chrome strip used by the renderer drag region.
          trafficLightPosition: { x: 16, y: 13 },
          vibrancy: 'sidebar' as const,
          visualEffectState: 'active' as const,
          // Prefer hiding on red traffic light; Cmd+Q / dock Quit sets isAppQuitting.
          closable: true,
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: options?.devTools ?? !app.isPackaged,
      // Default throttled; we un-throttle only while the window is focused.
      backgroundThrottling: true,
      spellcheck: isMacOS,
      additionalArguments: ['--process-name=ZuraAI'],
    },
    autoHideMenuBar: isWindows,
    // Native acrylic/vibrancy owns the window chrome background. The renderer
    // keeps the dashboard canvas solid so chat readability is unaffected.
    backgroundColor: '#00000000',
    show: false,
  })

  installExternalNavigationGuards(mainWindow)

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
    windowLog.error('failed to load main window')
    trackAppError({
      category: 'window_load',
      code: error instanceof Error ? error.name : 'load_failed',
      processType: 'main',
      fatal: false,
    })
    showFallbackError(mainWindow!, String(error?.message || error))
  })

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      windowLog.error(
        `did-fail-load: code=${errorCode} desc="${errorDescription}" url="${validatedURL}"`
      )
      // -3 is ERR_ABORTED which fires on normal navigation, ignore it
      if (errorCode === -3) return
      trackAppError({
        category: 'window_load',
        code: String(errorCode),
        processType: 'renderer',
        fatal: false,
      })
      showFallbackError(
        mainWindow!,
        `Failed to load: ${errorDescription} (code ${errorCode})\nURL: ${validatedURL}`
      )
    }
  )

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    windowLog.error(`renderer process gone: ${details.reason} (exitCode=${details.exitCode})`)
    trackAppCrash({
      category: details.reason,
      code: details.exitCode != null ? String(details.exitCode) : details.reason,
      processType: 'renderer',
      fatal: true,
    })
    showFallbackError(
      mainWindow!,
      `Renderer process ${details.reason}${details.exitCode != null ? ` (exit code ${details.exitCode})` : ''}`
    )
  })

  // Focused → full timer rate for smooth streaming UI; background → throttle.
  mainWindow.on('focus', () => {
    applyBackgroundThrottling(mainWindow!, false)
  })
  mainWindow.on('blur', () => {
    syncMainWindowThrottling()
  })
  mainWindow.on('minimize', () => {
    applyBackgroundThrottling(mainWindow!, true)
  })
  mainWindow.on('restore', () => {
    syncMainWindowThrottling()
  })
  mainWindow.on('hide', () => {
    applyBackgroundThrottling(mainWindow!, true)
  })
  mainWindow.on('show', () => {
    syncMainWindowThrottling()
  })

  // Close-to-tray on Windows/Linux: keep the app (and renderer) alive for
  // global shortcut / scheduled automations without a visible window.
  // macOS already keeps apps running after last window via window-all-closed.
  if (!isMacOS) {
    mainWindow.on('close', (event) => {
      if (allowMainWindowClose) return
      event.preventDefault()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide()
        applyBackgroundThrottling(mainWindow, true)
      }
    })
  }

  // macOS: red traffic light / File → Close hide to Dock instead of quitting.
  // Quit paths (Cmd+Q, menu Quit, tray Quit) set isAppQuitting so close proceeds.
  if (isMacOS) {
    mainWindow.on('close', (event) => {
      if (isAppQuitting || !mainWindow || mainWindow.isDestroyed()) {
        return
      }
      event.preventDefault()
      mainWindow.hide()
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

/**
 * Allow the main window to fully close on the next close event (used before quit).
 */
export function allowMainWindowToClose(): void {
  allowMainWindowClose = true
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
    applyBackgroundThrottling(mainWindow, false)
  } else {
    createMainWindow()
  }
}
