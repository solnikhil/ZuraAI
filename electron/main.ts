import { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer, screen, NativeImage, Tray, Menu, nativeImage, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import * as chatStore from './chatStore'
import * as secureStorage from './secureStorage'
import { registerCodexAuthHandlers, registerCodexStreamingHandler, cleanupCodexAuth } from './codexAuth'
import { mcpManager } from './mcp'

// Import tool handlers - use dynamic import to avoid circular dependency issues
let registerToolHandlers: (() => void) | undefined

// Fix for process.env.DIST type issue
const DIST_PATH = process.env.DIST || path.join(__dirname, '../dist')
process.env.DIST = DIST_PATH
process.env.PUBLIC = app.isPackaged ? DIST_PATH : path.join(__dirname, '../public')

// Production mode check
const isProduction = app.isPackaged

// Fix cursor flickering during window resize on Windows
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

// Memory Optimization: Reduce process count and overhead
app.commandLine.appendSwitch('disable-site-isolation-trials')
app.commandLine.appendSwitch('wm-window-animations-disabled')

// Set App Name explicitly
if (process.platform === 'win32') {
    app.setAppUserModelId('com.zura.ai')
}
app.setName('Zura')

// Global references
let overlayWin: BrowserWindow | null = null
let mainWindow: BrowserWindow | null = null
let currentScreenshot: NativeImage | null = null
let tray: Tray | null = null
let isQuitting = false
let autoUpdateInterval: NodeJS.Timeout | null = null

function createMainWindow() {
    if (mainWindow) {
        mainWindow.focus()
        return
    }

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'Zura',
        icon: path.join(process.env.PUBLIC || '', 'icon.png'),
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            devTools: !isProduction,  // Enable DevTools in development
            spellcheck: false,        // Disable spellcheck for performance
        },
        autoHideMenuBar: true,
        backgroundColor: '#14120B',
        show: false,  // Don't show until ready
    })

    const sendWindowState = () => {
        if (!mainWindow) return
        mainWindow.webContents.send('window-controls:state', {
            isMaximized: mainWindow.isMaximized() || mainWindow.isFullScreen()
        })
    }

    // Handle external links - open in default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https:') || url.startsWith('http:')) {
            shell.openExternal(url)
        }
        return { action: 'deny' }
    })

    // Handle in-page navigation (e.g. clicking links)
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith('https:') || url.startsWith('http:')) {
            event.preventDefault()
            shell.openExternal(url)
        }
    })

    // Show when ready to prevent white flash
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show()
        sendWindowState()
    })

    mainWindow.webContents.on('did-finish-load', sendWindowState)
    mainWindow.on('maximize', sendWindowState)
    mainWindow.on('unmaximize', sendWindowState)
    mainWindow.on('enter-full-screen', sendWindowState)
    mainWindow.on('leave-full-screen', sendWindowState)

    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/dashboard`)
    } else {
        mainWindow.loadFile(path.join(DIST_PATH, 'index.html'), { hash: 'dashboard' })
    }

    mainWindow.on('closed', () => {
        mainWindow = null
    })
}

function createTray() {
    const iconPath = path.join(process.env.PUBLIC || '', 'icon.png')
    
    let icon = nativeImage.createFromPath(iconPath)
    
    // Try alternative path if icon not found
    if (icon.isEmpty()) {
        const altPath = path.join(__dirname, '../public/icon.png')
        icon = nativeImage.createFromPath(altPath)
    }
    
    // Resize icon for tray
    if (process.platform === 'win32') {
        icon = icon.resize({ width: 32, height: 32 })
    } else if (process.platform === 'darwin') {
        icon = icon.resize({ width: 22, height: 22 })
    } else {
        icon = icon.resize({ width: 24, height: 24 })
    }
    
    tray = new Tray(icon)

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open Chat',
            click: () => {
                if (mainWindow) {
                    mainWindow.show()
                    mainWindow.focus()
                } else {
                    createMainWindow()
                }
            }
        },
        {
            label: 'Settings',
            click: () => {
                createMainWindow() // Settings is inside main window now
            }
        },
        { type: 'separator' },
        {
            label: 'Quit Zura',
            click: () => {
                app.quit()
            }
        }
    ])

    tray.setToolTip('Zura AI')
    tray.setContextMenu(contextMenu)
}

function createOverlayWindow(showImmediately = false) {
    if (overlayWin) {
        return
    }

    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize

    overlayWin = new BrowserWindow({
        width,
        height,
        x: 0,
        y: 0,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            devTools: !isProduction,  // Enable DevTools in development
            spellcheck: false,        // Disable spellcheck for performance
            backgroundThrottling: false,  // Keep overlay responsive when hidden
        },
    })

    // Handle external links in overlay
    overlayWin.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https:') || url.startsWith('http:')) {
            shell.openExternal(url)
        }
        return { action: 'deny' }
    })

    overlayWin.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith('https:') || url.startsWith('http:')) {
            event.preventDefault()
            shell.openExternal(url)
        }
    })

    if (process.env.VITE_DEV_SERVER_URL) {
        overlayWin.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/overlay`)
    } else {
        overlayWin.loadFile(path.join(DIST_PATH, 'index.html'), { hash: 'overlay' })
    }

    // Show immediately if requested (e.g., via settings or screenshot shortcut)
    if (showImmediately) {
        overlayWin.once('ready-to-show', () => {
            overlayWin?.show()
            overlayWin?.focus()
            overlayWin?.setAlwaysOnTop(true)
        })
    }

    overlayWin.on('close', (e) => {
        if (!isQuitting) {
            e.preventDefault()
            overlayWin?.hide()
        }
        return false
    })
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('before-quit', () => {
    isQuitting = true
    // Clean up global shortcuts to prevent memory leaks
    globalShortcut.unregisterAll()
})

// Ensure proper cleanup on will-quit event
app.on('will-quit', () => {
    // Unregister all global shortcuts (redundant safety measure)
    globalShortcut.unregisterAll()
    
    // Clean up auto-update interval
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval)
        autoUpdateInterval = null
    }
    
    // Clean up tray
    if (tray) {
        tray.destroy()
        tray = null
    }
    
    // Clean up Codex auth (close OAuth server if running)
    cleanupCodexAuth()
})

app.whenReady().then(async () => {
    // Register Codex authentication handlers
    registerCodexAuthHandlers()
    registerCodexStreamingHandler()

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
    // This will be updated when settings are synced, but we initialize it here
    // in case tools are called before the first settings sync
    (global as any).tavilyApiKey = undefined

    // Set up auto-updater (only in production)
    if (isProduction) {
        autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
            console.error('Auto-update check failed:', err)
        })

        // Check for updates every 4 hours
        autoUpdateInterval = setInterval(() => {
            autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
                console.error('Auto-update check failed:', err)
            })
        }, 4 * 60 * 60 * 1000)

        // Handle update events
        autoUpdater.on('update-available', () => {
            if (mainWindow) {
                mainWindow.webContents.send('update-available')
            }
        })

        autoUpdater.on('update-downloaded', () => {
            if (mainWindow) {
                mainWindow.webContents.send('update-downloaded')
            }
        })

        autoUpdater.on('error', (error: Error) => {
            console.error('Auto-updater error:', error)
        })
    }

    createTray()
    createMainWindow() // Open main window on start

    // Overlay is now lazy-loaded - only created when first needed
    // This saves ~100-200MB RAM when overlay is not being used

    // DISABLED: Agent shortcut popup (Ctrl+Shift+Z)
    // To re-enable, uncomment the globalShortcut.register calls below
    // globalShortcut.register('CommandOrControl+Shift+Z', async () => {
    //     if (!overlayWin) {
    //         createOverlayWindow(true)
    //     }
    //     if (overlayWin) {
    //         if (overlayWin.isVisible()) {
    //             overlayWin.hide()
    //         } else {
    //             overlayWin.show()
    //             overlayWin.focus()
    //             overlayWin.setAlwaysOnTop(true)
    //             overlayWin.webContents.send('reset-overlay')
    //         }
    //     }
    // })

    // DISABLED: Agent shortcut popup (Ctrl+Shift+Z)
    // To re-enable, uncomment the globalShortcut.register calls below
    // globalShortcut.register('CommandOrControl+Shift+Z', async () => {
    //     if (!overlayWin) {
    //         createOverlayWindow(true)
    //     }
    //     if (overlayWin) {
    //         if (overlayWin.isVisible()) {
    //             overlayWin.hide()
    //         } else {
    //             overlayWin.show()
    //             overlayWin.focus()
    //             overlayWin.setAlwaysOnTop(true)
    //             overlayWin.webContents.send('reset-overlay')
    //         }
    //     }
    // })

    // // Ctrl+Shift+X - Direct screenshot selection mode
    // globalShortcut.register('CommandOrControl+Shift+X', async () => {
    //     if (!overlayWin) {
    //         createOverlayWindow(true)
    //     }
    //     if (overlayWin) {
    //         overlayWin.hide()
    //     }
    //     await new Promise(resolve => setTimeout(resolve, 50))
    //     const displaySize = screen.getPrimaryDisplay().size
    //     const sources = await desktopCapturer.getSources({
    //         types: ['screen'],
    //         thumbnailSize: displaySize,
    //         fetchWindowIcons: false
    //     })
    //     const primarySource = sources[0]
    //     if (primarySource) {
    //         currentScreenshot = primarySource.thumbnail
    //     }
    //     if (overlayWin) {
    //         overlayWin.show()
    //         overlayWin.focus()
    //         overlayWin.setAlwaysOnTop(true)
    //         overlayWin.webContents.send('start-screenshot-selection')
    //     }
    // })
})

// IPC Handlers

ipcMain.on('settings-changed', (_event, settings) => {
    (global as any).tavilyApiKey = settings.tavilyApiKey || undefined
    if (Array.isArray(settings.mcpServers)) {
        mcpManager.setServerConfigs(settings.mcpServers)
    }

    // Handle settings changes that affect the main process
    if (settings.shortcuts?.toggleOverlay) {
        // TODO: Re-register global shortcuts if changed
        // globalShortcut.unregisterAll()
        // globalShortcut.register(settings.shortcuts.toggleOverlay, ...)
    }

    // Forward settings to overlay window if needed
    if (overlayWin) {
        overlayWin.webContents.send('settings-updated', settings)
    }
})

ipcMain.handle('mcp:list-tools', async (_event, mcpServers) => {
    if (Array.isArray(mcpServers)) {
        mcpManager.setServerConfigs(mcpServers)
    }
    return mcpManager.listTools()
})

// ==================== CHAT STORE IPC HANDLERS ====================

ipcMain.handle('chat-store:get-all', () => {
    return chatStore.getAllSessions()
})

ipcMain.handle('chat-store:save-all', (_event, sessions) => {
    chatStore.saveAllSessions(sessions)
    return true
})

ipcMain.handle('chat-store:create-session', (_event, session) => {
    chatStore.createSession(session)
    return true
})

ipcMain.handle('chat-store:update-session', (_event, id, updates) => {
    chatStore.updateSession(id, updates)
    return true
})

ipcMain.handle('chat-store:add-message', (_event, sessionId, message) => {
    chatStore.addMessageToSession(sessionId, message)
    return true
})

ipcMain.handle('chat-store:delete-session', (_event, id) => {
    chatStore.deleteSession(id)
    return true
})

ipcMain.handle('chat-store:clear-all', () => {
    chatStore.clearAllSessions()
    return true
})

ipcMain.handle('chat-store:migrate', (_event, localStorageData) => {
    chatStore.migrateFromLocalStorage(localStorageData)
    return true
})

ipcMain.handle('chat-store:get-path', () => {
    return chatStore.getStoreFilePath()
})

// ===============================================================

ipcMain.handle('capture-screen', async () => {
    if (overlayWin) {
        overlayWin.hide()
    }

    await new Promise(resolve => setTimeout(resolve, 50))

    const displaySize = screen.getPrimaryDisplay().size
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: displaySize,
        fetchWindowIcons: false
    })

    const primarySource = sources[0]
    if (primarySource) {
        currentScreenshot = primarySource.thumbnail
    }

    if (overlayWin) {
        overlayWin.show()
        overlayWin.setAlwaysOnTop(true)
    }

    return true
})

ipcMain.handle('crop-screenshot', async (_event, selection) => {
    if (!currentScreenshot) {
        return null
    }

    try {
        const croppedImage = currentScreenshot.crop({
            x: Math.round(selection.x),
            y: Math.round(selection.y),
            width: Math.round(selection.width),
            height: Math.round(selection.height)
        })

        const base64Image = `data:image/png;base64,${croppedImage.toPNG().toString('base64')}`
        return base64Image
    } catch (error) {
        console.error('[ERROR] Crop failed:', error)
        return null
    }
})

ipcMain.on('submit-prompt', async (_event, { prompt, selection }) => {
    if (!currentScreenshot) {
        return
    }

    try {
        const croppedImage = currentScreenshot.crop({
            x: Math.round(selection.x),
            y: Math.round(selection.y),
            width: Math.round(selection.width),
            height: Math.round(selection.height)
        })

        const base64Image = `data:image/png;base64,${croppedImage.toPNG().toString('base64')}`

        if (overlayWin) {
            overlayWin.webContents.send('ai-response-start', {
                prompt,
                image: base64Image
            })
        }
    } catch (error) {
        console.error('[ERROR] Crop failed:', error)
    }
})

ipcMain.on('close-overlay', () => {
    if (overlayWin) {
        overlayWin.hide()
        currentScreenshot = null
    }
})

ipcMain.on('minimize-overlay', () => {
    if (overlayWin) {
        overlayWin.hide()
    }
})

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.setIgnoreMouseEvents(ignore, options)
})

ipcMain.on('open-settings', () => {
    createMainWindow()
})

// ==================== WINDOW CONTROLS IPC HANDLERS ====================

ipcMain.handle('window-controls:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
    return true
})

ipcMain.handle('window-controls:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    const isCurrentlyMaximized = win.isMaximized() || win.isFullScreen()
    if (isCurrentlyMaximized) {
        if (win.isFullScreen()) {
            win.setFullScreen(false)
        } else {
            win.unmaximize()
        }
    } else {
        win.maximize()
    }
    return win.isMaximized() || win.isFullScreen()
})

ipcMain.handle('window-controls:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
    return true
})

ipcMain.handle('window-controls:is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win ? (win.isMaximized() || win.isFullScreen()) : false
})

// ==================== SECURE STORAGE IPC HANDLERS ====================

ipcMain.handle('secure-storage:get', async (_event, key: string) => {
    return secureStorage.getSecureValueAsync(key as any)
})

ipcMain.handle('secure-storage:set', async (_event, key: string, value: string) => {
    // Use async version to ensure data is written to disk before returning
    return secureStorage.setSecureValueAsync(key as any, value)
})

ipcMain.handle('secure-storage:get-all', async () => {
    return secureStorage.getAllSecureValuesAsync()
})

ipcMain.handle('secure-storage:clear', () => {
    return secureStorage.clearSecureStorage()
})

ipcMain.handle('secure-storage:status', () => {
    return secureStorage.getStorageStatus()
})

// ==================== AUTO-UPDATER IPC HANDLERS ====================

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

// ===============================================================
