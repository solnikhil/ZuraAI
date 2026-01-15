import { app, ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

// Production mode check
const isProduction = app.isPackaged

// Auto-update interval reference
let autoUpdateInterval: NodeJS.Timeout | null = null

/**
 * Initialize the auto-updater with event handlers
 * @param getMainWindow Function to get the main window for sending update notifications
 */
export function initializeAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
    if (!isProduction) {
        console.log('[UPDATER] Skipping auto-updater initialization in development mode')
        return
    }

    // Initial check for updates
    autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
        console.error('[UPDATER] Auto-update check failed:', err)
    })

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
