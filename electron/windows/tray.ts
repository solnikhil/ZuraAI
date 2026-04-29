import { Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { createMainWindow, getMainWindow } from './mainWindow'

// Global reference to tray
let tray: Tray | null = null

/**
 * Create the system tray icon and menu
 */
export function createTray(): Tray {
    const iconPath = path.join(process.env.PUBLIC || '', 'icon.png')
    
    let icon = nativeImage.createFromPath(iconPath)
    
    // Try alternative path if icon not found
    if (icon.isEmpty()) {
        const altPath = path.join(__dirname, '../../public/icon.png')
        icon = nativeImage.createFromPath(altPath)
    }
    
    // Resize icon for tray based on platform
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
                const mainWindow = getMainWindow()
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
            label: 'Quit ZuraAI',
            click: () => {
                require('electron').app.quit()
            }
        }
    ])

    tray.setToolTip('ZuraAI')
    tray.setContextMenu(contextMenu)

    return tray
}

/**
 * Get the current tray instance

/**
 * Destroy the tray icon
 */
export function destroyTray(): void {
    if (tray) {
        tray.destroy()
        tray = null
    }
}
