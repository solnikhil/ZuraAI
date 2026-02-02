import { app, ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

// Production mode check
const isProduction = app.isPackaged

// Auto-update interval reference
let autoUpdateInterval: NodeJS.Timeout | null = null

// Delay before first update check (5 seconds after window visible)
const INITIAL_UPDATE_DELAY_MS = 5000

/**
 * Initialize the auto-updater with event handlers
 * This function should be called after the main window is visible.
 * The actual update check is deferred by 5 seconds (Requirement 1.5)
 * 
 * @param getMainWindow Function to get the main window for sending update notifications
 */
export function initializeAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
    if (!isProduction) {
        console.log('[UPDATER] Skipping auto-updater initialization in development mode')
        return
    }

    // Defer initial update check by 5 seconds after this function is called
    // This ensures the window is fully visible and responsive before checking
    setTimeout(() => {
        console.log('[UPDATER] Starting initial update check (5s after window visible)')
        autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
            console.error('[UPDATER] Auto-update check failed:', err)
        })
    }, INITIAL_UPDATE_DELAY_MS)

    // Check for updates every 4 hours
    autoUpdateInterval = setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
            console.error('[UPDATER] Auto-update check failed:', err)
        })
    }, 4 * 60 * 60 * 1000)

    // Handle update events
    autoUpdater.on('update-available', () => {
        const mainWindow = getMainWindow()
        if (mainWindow) {
            mainWindow.webContents.send('update-available')
        }
    })

    autoUpdater.on('update-downloaded', () => {
        const mainWindow = getMainWindow()
        if (mainWindow) {
            mainWindow.webContents.send('update-downloaded')
        }
    })

    autoUpdater.on('error', (error: Error) => {
        console.error('[UPDATER] Auto-updater error:', error)
    })
}

/**
 * Register auto-updater IPC handlers
 */
export function registerUpdaterHandlers(): void {
    ipcMain.handle('updater:check-for-updates', () => {
        if (isProduction) {
            return autoUpdater.checkForUpdatesAndNotify()
        }
        return Promise.resolve(null)
    })

    ipcMain.handle('updater:quit-and-install', () => {
        if (isProduction) {
            autoUpdater.quitAndInstall(false, true)
        }
        return true
    })

    ipcMain.handle('updater:get-version', () => {
        return app.getVersion()
    })
}

/**
 * Unregister auto-updater IPC handlers
 */
export function unregisterUpdaterHandlers(): void {
    ipcMain.removeHandler('updater:check-for-updates')
    ipcMain.removeHandler('updater:quit-and-install')
    ipcMain.removeHandler('updater:get-version')
}

/**
 * Clean up auto-updater resources
 */
export function cleanupAutoUpdater(): void {
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval)
        autoUpdateInterval = null
    }
}
