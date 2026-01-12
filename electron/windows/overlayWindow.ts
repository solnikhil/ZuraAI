import { BrowserWindow, screen, shell, NativeImage } from 'electron'
import path from 'path'

// Fix for process.env.DIST type issue
const DIST_PATH = process.env.DIST || path.join(__dirname, '../../dist')

// Production mode check
const isProduction = require('electron').app.isPackaged

// Global references
let overlayWin: BrowserWindow | null = null
let currentScreenshot: NativeImage | null = null
let isQuitting = false

/**
 * Set the quitting state to allow proper window cleanup
 */
export function setQuitting(quitting: boolean): void {
    isQuitting = quitting
}

/**
 * Create the overlay window for screenshot selection
 */
export function createOverlayWindow(showImmediately = false): BrowserWindow | null {
    if (overlayWin) {
        return overlayWin
    }

    const primaryDisplay = screen.getPrimaryDisplay()
    const { x, y, width, height } = primaryDisplay.bounds

    overlayWin = new BrowserWindow({
        width,
        height,
        x,
        y,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, '../preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            devTools: !isProduction,
            spellcheck: false,
            backgroundThrottling: false,
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

    // Show immediately if requested
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

    return overlayWin
}

/**
 * Get the current overlay window instance
 */
export function getOverlayWindow(): BrowserWindow | null {
    return overlayWin
}

/**
 * Show the overlay window
 */
export function showOverlay(): void {
    if (overlayWin) {
        overlayWin.show()
        overlayWin.focus()
        overlayWin.setAlwaysOnTop(true)
    }
}

/**
 * Hide the overlay window
 */
export function hideOverlay(): void {
    if (overlayWin) {
        overlayWin.hide()
    }
}

/**
 * Store the current screenshot
 */
export function setCurrentScreenshot(screenshot: NativeImage | null): void {
    currentScreenshot = screenshot
}

/**
 * Get the current screenshot
 */
export function getCurrentScreenshot(): NativeImage | null {
    return currentScreenshot
}

/**
 * Clear the current screenshot
 */
export function clearScreenshot(): void {
    currentScreenshot = null
}

/**
 * Send settings update to overlay window
 */
export function sendSettingsToOverlay(settings: any): void {
    if (overlayWin) {
        overlayWin.webContents.send('settings-updated', settings)
    }
}
