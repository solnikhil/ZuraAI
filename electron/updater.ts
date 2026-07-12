import { app, BrowserWindow } from 'electron'
import { trustedIpcMain as ipcMain } from './ipc/trustedIpc'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { trackAppError } from './analytics'
import { log } from './startup/logger'

const updaterLog = log.withTag('updater')

const isProduction = app.isPackaged

const UPDATE_INTERVAL_MS = 12 * 60 * 60 * 1000

// Delay before first check (10s after window visible)
const INITIAL_DELAY_MS = 10_000

let updateInterval: NodeJS.Timeout | null = null
let initialTimeout: NodeJS.Timeout | null = null

/**
 * True from the moment the user accepts an update install until the app process
 * exits. The `before-quit` handler in `electron/main.ts` consults this so it
 * doesn't run a second async MCP shutdown that races with `quitAndInstall`.
 */
let installingUpdate = false

/**
 * Registered by `electron/main.ts` so the install path can cleanly shut MCP
 * servers down before handing control to the platform installer. Kept as a
 * hook (rather than a direct import) to avoid a cycle between updater and main.
 */
type ShutdownHook = () => Promise<void>
let shutdownHook: ShutdownHook | null = null

export function setShutdownHook(hook: ShutdownHook | null): void {
  shutdownHook = hook
}

export function isInstallingUpdate(): boolean {
  return installingUpdate
}

/**
 * Send an IPC payload to the main app window if it is still alive.
 * The updater never broadcasts to all windows because update UI lives in the
 * main shell, and other surfaces (overlay, prompt popup) shouldn't react.
 */
function sendToMainWindow(
  getMainWindow: () => BrowserWindow | null,
  channel: string,
  ...args: unknown[]
): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args)
  }
}

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
    info: (msg: unknown) => updaterLog.debug(String(msg)),
    warn: (msg: unknown) => updaterLog.warn(String(msg)),
    error: (msg: unknown) => updaterLog.error(String(msg)),
    debug: (msg: unknown) => updaterLog.debug(String(msg)),
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
    updaterLog.error(`check failed: ${err instanceof Error ? err.message : String(err)}`)
    trackAppError({
      category: 'updater',
      code: err instanceof Error ? err.name : 'check_failed',
      processType: 'main',
      fatal: false,
    })
    return null
  }
}

/**
 * Initialize the auto-updater event pipeline and schedule checks.
 */
export function initializeAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  if (!isProduction) {
    updaterLog.debug('skipping initialization in development mode')
    return
  }

  configureAutoUpdater()

  autoUpdater.on('checking-for-update', () => {
    updaterLog.info('checking for update...')
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    updaterLog.success(`update available: v${info.version}`)
    sendToMainWindow(getMainWindow, 'update-available', info.version)
    // Start the download now that we know an update exists
    autoUpdater.downloadUpdate().catch((err: Error) => {
      updaterLog.error(`download failed: ${err instanceof Error ? err.message : String(err)}`)
      trackAppError({
        category: 'updater',
        code: err.name || 'download_failed',
        processType: 'main',
        fatal: false,
      })
      sendToMainWindow(getMainWindow, 'update-error', err.message || 'Download failed')
    })
  })

  autoUpdater.on('update-not-available', () => {
    updaterLog.info('already up to date')
  })

  autoUpdater.on('download-progress', (progress) => {
    const percent = typeof progress.percent === 'number' ? progress.percent : 0
    const transferred = typeof progress.transferred === 'number' ? progress.transferred : 0
    const total = typeof progress.total === 'number' ? progress.total : 0
    updaterLog.debug(
      `download progress: ${percent.toFixed(1)}% (${(transferred / 1_048_576).toFixed(1)}/${(total / 1_048_576).toFixed(1)} MB)`
    )
    sendToMainWindow(getMainWindow, 'update-download-progress', {
      percent,
      transferred,
      total,
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    updaterLog.success(`update downloaded: v${info.version}`)
    sendToMainWindow(getMainWindow, 'update-downloaded', info.version)
  })

  autoUpdater.on('error', (err: Error) => {
    updaterLog.error(`error: ${err.message}`)
    trackAppError({
      category: 'updater',
      code: err.name || 'updater_error',
      processType: 'main',
      fatal: false,
    })
    sendToMainWindow(getMainWindow, 'update-error', err.message || 'Updater error')
  })

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
export function registerUpdaterHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('updater:check-for-updates', async () => {
    if (!isProduction) return null
    return checkOnce()
  })

  ipcMain.handle('updater:quit-and-install', async () => {
    if (!isProduction) {
      // In dev we still resolve truthy so the renderer flow advances, but we
      // skip the actual install which would error against an unpacked build.
      return true
    }

    installingUpdate = true

    // Run the registered shutdown hook (typically MCP manager teardown) so the
    // platform installer doesn't race with an async pre-quit task.
    if (shutdownHook) {
      try {
        await shutdownHook()
      } catch (err) {
        updaterLog.error(
          `shutdown hook failed before install: ${err instanceof Error ? err.message : String(err)}`
        )
        // Continue with install anyway — a failed shutdown is recoverable on
        // restart, but a failed install would leave the user stuck on an old
        // version.
      }
    }

    try {
      // isSilent=false so the user sees the installer, isForceRunAfter=true to relaunch
      autoUpdater.quitAndInstall(false, true)
      return true
    } catch (err) {
      installingUpdate = false
      const message = err instanceof Error ? err.message : 'Install failed'
      updaterLog.error(`quitAndInstall failed: ${message}`)
      trackAppError({
        category: 'updater',
        code: err instanceof Error ? err.name : 'install_failed',
        processType: 'main',
        fatal: false,
      })
      sendToMainWindow(getMainWindow, 'update-error', message)
      return false
    }
  })

  ipcMain.handle('updater:get-version', () => {
    return app.getVersion()
  })
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
