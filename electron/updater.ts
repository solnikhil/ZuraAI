import { app, ipcMain, BrowserWindow } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'

const isProduction = app.isPackaged

// Check every 12 hours after the initial check
const UPDATE_INTERVAL_MS = 12 * 60 * 60 * 1000

// Delay before first check (10s after window visible)
const INITIAL_DELAY_MS = 10_000

let updateInterval: NodeJS.Timeout | null = null
let initialTimeout: NodeJS.Timeout | null = null

/**
 * Configure autoUpdater defaults. Called once before any checks.
 */
function configureAutoUpdater(): void {
  // Let the app notify the user — don't silently download in the background
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Allow downgrade in case a rollback release is published
  autoUpdater.allowDowngrade = false

  // Use the standard electron-updater logger routed through console
  autoUpdater.logger = {
    info: (msg: unknown) => console.log('[UPDATER]', msg),
    warn: (msg: unknown) => console.warn('[UPDATER]', msg),
    error: (msg: unknown) => console.error('[UPDATER]', msg),
    debug: (msg: unknown) => console.log('[UPDATER:DEBUG]', msg),
  }
}

/**
 * Perform a single update check. Resolves with the update info or null.
 */
async function checkOnce(): Promise<UpdateInfo | null> {
  try {
    const result = await autoUpdater.checkForUpdates()
    return result?.updateInfo ?? null
  } catch (err) {
    console.error('[UPDATER] Check failed:', err)
    return null
  }
}

/**
 * Initialize the auto-updater event pipeline and schedule checks.
 */
export function initializeAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  if (!isProduction) {
    console.log('[UPDATER] Skipping initialization in development mode')
    return
  }

  configureAutoUpdater()

  // ---- Event handlers ----

  autoUpdater.on('checking-for-update', () => {
    console.log('[UPDATER] Checking for update...')
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log(`[UPDATER] Update available: v${info.version}`)
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-available', info.version)
    }
    // Start the download now that we know an update exists
    autoUpdater.downloadUpdate().catch((err) => {
      console.error('[UPDATER] Download failed:', err)
    })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[UPDATER] Already up to date')
  })

  autoUpdater.on('download-progress', (progress) => {
    console.log(
      `[UPDATER] Download progress: ${progress.percent.toFixed(1)}% (${(progress.transferred / 1_048_576).toFixed(1)}/${(progress.total / 1_048_576).toFixed(1)} MB)`
    )
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.log(`[UPDATER] Update downloaded: v${info.version}`)
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-downloaded', info.version)
    }
  })

  autoUpdater.on('error', (err: Error) => {
    console.error('[UPDATER] Error:', err.message)
  })

  // ---- Scheduling ----

  initialTimeout = setTimeout(() => {
    initialTimeout = null
    void checkOnce()
  }, INITIAL_DELAY_MS)

  updateInterval = setInterval(() => {
    void checkOnce()
  }, UPDATE_INTERVAL_MS)
}

/**
 * Register IPC handlers the renderer can call.
 */
export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:check-for-updates', async () => {
    if (!isProduction) return null
    return checkOnce()
  })

  ipcMain.handle('updater:quit-and-install', () => {
    if (isProduction) {
      // isSilent=false so the user sees the installer, isForceRunAfter=true to relaunch
      autoUpdater.quitAndInstall(false, true)
    }
    return true
  })

  ipcMain.handle('updater:get-version', () => {
    return app.getVersion()
  })
}

/**
 * Unregister IPC handlers (called on will-quit).
 */
export function unregisterUpdaterHandlers(): void {
  ipcMain.removeHandler('updater:check-for-updates')
  ipcMain.removeHandler('updater:quit-and-install')
  ipcMain.removeHandler('updater:get-version')
}

/**
 * Cancel pending timers.
 */
export function cleanupAutoUpdater(): void {
  if (initialTimeout) {
    clearTimeout(initialTimeout)
    initialTimeout = null
  }
  if (updateInterval) {
    clearInterval(updateInterval)
    updateInterval = null
  }
}
