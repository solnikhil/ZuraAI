import { app, globalShortcut } from 'electron'
import path from 'path'
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer'

// Import window management
import {
    createMainWindow,
    getMainWindow,
    createTray,
    destroyTray
} from './windows'

// Import IPC handlers
import { registerAllHandlers } from './ipc'
import { registerToolHandlers } from './tools'

// Import auto-updater
import {
    initializeAutoUpdater,
    registerUpdaterHandlers,
    cleanupAutoUpdater
} from './updater'

// Import deferred initialization system
import { deferredInitializer } from './startup/deferredInit'

// Fix for process.env.DIST type issue
const DIST_PATH = process.env.DIST || path.join(__dirname, '../dist')
process.env.DIST = DIST_PATH
process.env.PUBLIC = app.isPackaged ? DIST_PATH : path.join(__dirname, '../public')

// Fix cursor flickering during window resize on Windows
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

// Disable window animations
app.commandLine.appendSwitch('wm-window-animations-disabled')

// Add process identifier for Task Manager (visible in "Command line" column)
app.commandLine.appendSwitch('process-name', 'Zura-Main')

// Set App Name explicitly for Windows Task Manager
if (process.platform === 'win32') {
    app.setAppUserModelId('Zura AI')
}
app.setName('Zura AI')

// Set process title for main process (shows in Task Manager)
process.title = 'Zura AI - Main'

// ==================== APP LIFECYCLE ====================

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    cleanupAutoUpdater()
    destroyTray()
})

app.whenReady().then(async () => {
    deferredInitializer.markAppReady()

    // Defer DevTools installation in development mode (2000ms after window visible)
    // Skip entirely in production builds (Requirement 1.4)
    if (!app.isPackaged) {
        deferredInitializer.registerTask({
            name: 'devtools-install',
            priority: 'low',
            delayMs: 2000,
            execute: async () => {
                try {
                    const name = await installExtension(REACT_DEVELOPER_TOOLS)
                    console.log(`[MAIN] Added Extension: ${name}`)
                } catch (err) {
                    console.log('[MAIN] DevTools installation error:', err)
                }
            },
        });
    }

    // Register all IPC handlers (including execute-tool for web_search)
    registerAllHandlers()
    registerToolHandlers()
    registerUpdaterHandlers()
    deferredInitializer.markIPCReady()

    // Defer auto-updater initialization (only in production)
    // The updater itself adds an additional 5-second delay before checking (Requirement 1.5)
    deferredInitializer.registerTask({
        name: 'auto-updater',
        priority: 'low',
        delayMs: 0, // Start immediately after window visible, updater adds its own 5s delay
        execute: async () => {
            initializeAutoUpdater(getMainWindow)
            console.log('[MAIN] Auto-updater initialized')
        },
    });

    // Create system tray
    createTray()

    // Open main window on start
    createMainWindow()

})
