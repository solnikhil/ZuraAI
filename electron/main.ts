import { app, globalShortcut } from 'electron'
import path from 'path'

// Import window management
import {
    createMainWindow,
    getMainWindow,
    createTray,
    destroyTray,
    setQuitting
} from './windows'

// Import IPC handlers
import { registerAllHandlers } from './ipc'

// Import auto-updater
import {
    initializeAutoUpdater,
    registerUpdaterHandlers,
    cleanupAutoUpdater
} from './updater'

// Fix for process.env.DIST type issue
const DIST_PATH = process.env.DIST || path.join(__dirname, '../dist')
process.env.DIST = DIST_PATH
process.env.PUBLIC = app.isPackaged ? DIST_PATH : path.join(__dirname, '../public')

// Import tool handlers - use dynamic import to avoid circular dependency issues
let registerToolHandlers: (() => void) | undefined

// Fix cursor flickering during window resize on Windows
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

// Disable window animations
app.commandLine.appendSwitch('wm-window-animations-disabled')

// Set App Name explicitly
if (process.platform === 'win32') {
    app.setAppUserModelId('com.zura.ai')
}
app.setName('Zura')

// ==================== APP LIFECYCLE ====================

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('before-quit', () => {
    setQuitting(true)
    globalShortcut.unregisterAll()
})

app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    cleanupAutoUpdater()
    destroyTray()
})

app.whenReady().then(async () => {
    // Register tool handlers for AI function calling
    try {
        const toolsModule = await import('./tools/index')
        registerToolHandlers = toolsModule.registerToolHandlers
        if (registerToolHandlers) {
            registerToolHandlers()
        }
    } catch (error) {
        console.error('[MAIN] Failed to load tool handlers:', error)
    }

    // Initialize Tavily API key from settings on startup
    (global as any).tavilyApiKey = undefined

    // Register all IPC handlers
    registerAllHandlers()
    registerUpdaterHandlers()

    // Initialize auto-updater (only in production)
    initializeAutoUpdater(getMainWindow)

    // Create system tray
    createTray()

    // Open main window on start
    createMainWindow()

    // Overlay is now lazy-loaded - only created when first needed
    // This saves ~100-200MB RAM when overlay is not being used
})
