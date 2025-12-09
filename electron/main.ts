import { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer, screen, NativeImage, Tray, Menu, nativeImage, Notification } from 'electron'
import path from 'path'

// Fix for process.env.DIST type issue
const DIST_PATH = process.env.DIST || path.join(__dirname, '../dist')
process.env.DIST = DIST_PATH
process.env.PUBLIC = app.isPackaged ? DIST_PATH : path.join(__dirname, '../public')

// Global references
let overlayWin: BrowserWindow | null = null
let settingsWin: BrowserWindow | null = null
let currentScreenshot: NativeImage | null = null
let tray: Tray | null = null
let isQuitting = false

function createSettingsWindow() {
    if (settingsWin) {
        settingsWin.focus()
        return
    }

    settingsWin = new BrowserWindow({
        width: 900,
        height: 700,
        title: 'Zura Settings',
        icon: path.join(process.env.PUBLIC || '', 'tray-icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        autoHideMenuBar: true,
        backgroundColor: '#1a1a1a',
    })

    if (process.env.VITE_DEV_SERVER_URL) {
        settingsWin.loadURL(`${process.env.VITE_DEV_SERVER_URL}#settings`)
    } else {
        settingsWin.loadFile(path.join(DIST_PATH, 'index.html'), { hash: 'settings' })
    }

    settingsWin.on('closed', () => {
        settingsWin = null
    })
}

function createTray() {
    const iconPath = path.join(process.env.PUBLIC || '', 'tray-icon.png')
    const icon = nativeImage.createFromPath(iconPath)
    tray = new Tray(icon)

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show Chat',
            click: () => {
                if (overlayWin) {
                    overlayWin.show()
                } else {
                    console.log('No active session to show')
                }
            }
        },
        {
            label: 'Settings',
            click: () => {
                createSettingsWindow()
            }
        },
        {
            label: 'Hide Chat',
            click: () => {
                if (overlayWin) overlayWin.hide()
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

function createOverlayWindow() {
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
        },
    })

    if (process.env.VITE_DEV_SERVER_URL) {
        overlayWin.loadURL(`${process.env.VITE_DEV_SERVER_URL}#overlay`)
    } else {
        overlayWin.loadFile(path.join(DIST_PATH, 'index.html'), { hash: 'overlay' })
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
})

app.whenReady().then(() => {
    createTray()
    createOverlayWindow()

    globalShortcut.register('CommandOrControl+Shift+Z', async () => {
        console.log('[SHORTCUT] Triggered')
        if (overlayWin) {
            if (overlayWin.isVisible()) {
                overlayWin.hide()
            } else {
                overlayWin.show()
                overlayWin.focus()
                overlayWin.setAlwaysOnTop(true)
                // Reset state
                overlayWin.webContents.send('reset-overlay')
            }
        }
    })

    // Ctrl+Shift+X - Direct screenshot selection mode
    globalShortcut.register('CommandOrControl+Shift+X', async () => {
        console.log('[SHORTCUT] Screenshot mode triggered')

        // Hide overlay while capturing
        if (overlayWin) {
            overlayWin.hide()
        }

        // Small delay to ensure window is hidden
        await new Promise(resolve => setTimeout(resolve, 50))

        // Capture the screen
        const displaySize = screen.getPrimaryDisplay().size
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: displaySize,
            fetchWindowIcons: false
        })

        const primarySource = sources[0]
        if (primarySource) {
            currentScreenshot = primarySource.thumbnail
            console.log('[CAPTURE] Screenshot captured for selection, size:', currentScreenshot.getSize())
        }

        // Show overlay in selection mode
        if (overlayWin) {
            overlayWin.show()
            overlayWin.focus()
            overlayWin.setAlwaysOnTop(true)
            // Send direct screenshot selection mode signal
            overlayWin.webContents.send('start-screenshot-selection')
        }
    })
})

// IPC Handlers

ipcMain.on('log-to-terminal', (_event, message) => {
    console.log(message)
})

ipcMain.on('settings-changed', (_event, settings) => {
    const settingsToLog = { ...settings }
    if (settingsToLog.systemPrompt && settingsToLog.systemPrompt.length > 50) {
        settingsToLog.systemPrompt = settingsToLog.systemPrompt.substring(0, 50) + '... (truncated)'
    }
    // console.log('[SETTINGS] Updated:', JSON.stringify(settingsToLog, null, 2))

    // Only notify if explicitly requested or critical (avoiding spam on every keystroke/sync)
    // new Notification({
    //     title: 'Zura Settings',
    //     body: 'Settings updated successfully'
    // }).show()

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

ipcMain.handle('capture-screen', async () => {
    console.log('[CAPTURE] Requested')
    if (overlayWin) {
        overlayWin.hide() // Hide to avoid capturing the overlay itself
    }

    // Small delay to ensure window is hidden
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
        console.log('[CAPTURE] Success, size:', currentScreenshot.getSize())
    }

    if (overlayWin) {
        overlayWin.show()
        overlayWin.setAlwaysOnTop(true)
    }

    return true
})

ipcMain.handle('crop-screenshot', async (_event, selection) => {
    if (!currentScreenshot) {
        console.error('[ERROR] No screenshot!')
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
    console.log('[IPC] Prompt:', prompt)
    console.log('[IPC] Selection:', selection)

    if (!currentScreenshot) {
        console.error('[ERROR] No screenshot!')
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
        console.log('[CROP] Success, base64 length:', base64Image.length)

        if (overlayWin) {
            overlayWin.webContents.send('ai-response-start', {
                prompt,
                image: base64Image
            })
            console.log('[IPC] Sent to overlay')
        }
    } catch (error) {
        console.error('[ERROR] Crop failed:', error)
    }
})

ipcMain.on('close-overlay', () => {
    console.log('[IPC] Close requested')
    if (overlayWin) {
        overlayWin.hide()
        currentScreenshot = null
    }
})

ipcMain.on('minimize-overlay', () => {
    console.log('[IPC] Minimize requested')
    if (overlayWin) {
        overlayWin.hide()
    }
})

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.setIgnoreMouseEvents(ignore, options)
})

ipcMain.on('open-settings', () => {
    createSettingsWindow()
})
