import { BrowserWindow, shell } from 'electron'
import path from 'path'
import { deferredInitializer } from '../startup/deferredInit'

// Fix for process.env.DIST type issue
const DIST_PATH = process.env.DIST || path.join(__dirname, '../../dist')

// Production mode check
const isProduction = require('electron').app.isPackaged

const devServerUrl = process.env.VITE_DEV_SERVER_URL
const devServerOrigin = devServerUrl ? new URL(devServerUrl).origin : null

function isExternalHttpUrl(url: string): boolean {
    if (!url.startsWith('http:') && !url.startsWith('https:')) return false
    if (devServerOrigin && url.startsWith(devServerOrigin)) return false
    return true
}

// Global reference to main window
let mainWindow: BrowserWindow | null = null

export interface MainWindowOptions {
    width?: number
    height?: number
    devTools?: boolean
}

/**
 * Create and manage the main application window
 */
export function createMainWindow(options?: MainWindowOptions): BrowserWindow {
    if (mainWindow) {
        mainWindow.focus()
        return mainWindow
    }

    const isWindows = process.platform === 'win32'
    const isMacOS = process.platform === 'darwin'

    mainWindow = new BrowserWindow({
        width: options?.width ?? 1200,
        height: options?.height ?? 800,
        minWidth: 900,
        minHeight: 600,
        title: 'Zura AI - Dashboard',
        icon: path.join(process.env.PUBLIC || '', 'icon.png'),
        ...(isWindows ? {
            titleBarStyle: 'hidden',
            titleBarOverlay: {
                color: 'rgba(0, 0, 0, 0)',
                symbolColor: '#E5E0D5',
                height: 44,
            },
        } : {}),
        ...(isMacOS ? {
            titleBarStyle: 'hidden',
            trafficLightPosition: { x: 12, y: 12 },
        } : {}),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false, // Required for preload to use Node.js APIs like fs
            devTools: options?.devTools ?? !isProduction,
            spellcheck: false,
            additionalArguments: ['--process-name=Zura-Dashboard'],
        },
        autoHideMenuBar: true,
        backgroundColor: '#14120B',
        show: false,
    })

    // Handle external links - open in default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isExternalHttpUrl(url)) {
            shell.openExternal(url)
        }
        return { action: 'deny' }
    })

    // Handle in-page navigation (e.g. clicking links)
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (isExternalHttpUrl(url)) {
            event.preventDefault()
            shell.openExternal(url)
        }
    })

    // Show when ready to prevent white flash
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show()
        // Mark window as visible and trigger deferred task execution
        deferredInitializer.markWindowVisible()
        deferredInitializer.executeAfterWindowVisible()
    })

    // Track window creation
    deferredInitializer.markWindowCreated()

    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/dashboard`)
    } else {
        mainWindow.loadFile(path.join(DIST_PATH, 'index.html'), { hash: 'dashboard' })
    }

    mainWindow.on('closed', () => {
        mainWindow = null
    })

    return mainWindow
}

/**
 * Get the current main window instance
 */
export function getMainWindow(): BrowserWindow | null {
    return mainWindow
}

/**
 * Focus or create the main window
 */
export function showMainWindow(): void {
    if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
    } else {
        createMainWindow()
    }
}

/**
 * Set the titlebar overlay colors (Windows only)
 */
export function setTitleBarOverlay(color: string, symbolColor: string, height?: number): void {
    if (process.platform !== 'win32') return
    if (!mainWindow) return

    const overlay: Electron.TitleBarOverlay = { color, symbolColor }
    if (typeof height === 'number' && Number.isFinite(height)) {
        overlay.height = height
    }

    try {
        mainWindow.setTitleBarOverlay(overlay)
    } catch {
        // Ignore if unsupported
    }
}
