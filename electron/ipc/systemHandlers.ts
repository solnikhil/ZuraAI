import { ipcMain, BrowserWindow, desktopCapturer, screen } from 'electron'
import {
    getMainWindow,
    setTitleBarOverlay,
    createMainWindow,
    getOverlayWindow,
    hideOverlay,
    showOverlay,
    setCurrentScreenshot,
    getCurrentScreenshot,
    clearScreenshot,
    sendSettingsToOverlay
} from '../windows'

/**
 * Register all system IPC handlers
 */
export function registerSystemHandlers(): void {
    // Titlebar overlay handler (Windows only)
    ipcMain.on('set-titlebar-overlay', (_event, overlay) => {
        if (process.platform !== 'win32') return

        const color = overlay?.color
        const symbolColor = overlay?.symbolColor
        const height = overlay?.height

        if (typeof color !== 'string' || typeof symbolColor !== 'string') return

        const parsedHeight = typeof height === 'number' && Number.isFinite(height) ? Math.round(height) : undefined
        const safeHeight = parsedHeight !== undefined && parsedHeight >= 28 && parsedHeight <= 64 ? parsedHeight : undefined

        setTitleBarOverlay(color, symbolColor, safeHeight)
    })

    // Settings changed handler
    ipcMain.on('settings-changed', (_event, settings) => {
        (global as any).tavilyApiKey = settings.tavilyApiKey || undefined

        // Forward settings to overlay window if needed
        sendSettingsToOverlay(settings)
    })

    // Screen capture handler
    ipcMain.handle('capture-screen', async () => {
        const overlayWin = getOverlayWindow()
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
            setCurrentScreenshot(primarySource.thumbnail)
        }

        if (overlayWin) {
            overlayWin.show()
            overlayWin.setAlwaysOnTop(true)
        }

        return true
    })

    // Screenshot crop handler
    ipcMain.handle('crop-screenshot', async (_event, selection) => {
        const currentScreenshot = getCurrentScreenshot()
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

    // Submit prompt with screenshot handler
    ipcMain.on('submit-prompt', async (_event, { prompt, selection }) => {
        const currentScreenshot = getCurrentScreenshot()
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

            const overlayWin = getOverlayWindow()
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

    // Overlay control handlers
    ipcMain.on('close-overlay', () => {
        hideOverlay()
        clearScreenshot()
    })

    ipcMain.on('minimize-overlay', () => {
        hideOverlay()
    })

    // Mouse events handler
    ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        win?.setIgnoreMouseEvents(ignore, options)
    })

    // Open settings handler
    ipcMain.on('open-settings', () => {
        createMainWindow()
    })
}

/**
 * Unregister all system IPC handlers
 */
export function unregisterSystemHandlers(): void {
    ipcMain.removeAllListeners('set-titlebar-overlay')
    ipcMain.removeAllListeners('settings-changed')
    ipcMain.removeHandler('capture-screen')
    ipcMain.removeHandler('crop-screenshot')
    ipcMain.removeAllListeners('submit-prompt')
    ipcMain.removeAllListeners('close-overlay')
    ipcMain.removeAllListeners('minimize-overlay')
    ipcMain.removeAllListeners('set-ignore-mouse-events')
    ipcMain.removeAllListeners('open-settings')
}
