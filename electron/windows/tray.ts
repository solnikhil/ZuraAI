import { app, Tray, Menu, nativeImage } from 'electron'
import { showAboutWindow } from './aboutWindow'
import { allowMainWindowToClose, createMainWindow, getMainWindow, showMainWindow } from './mainWindow'
import { showMainWindowAndNavigateSettings } from './navigation'
import { createAppIcon, resolveAppIconPath } from '../windowIcon'

// Global reference to tray
let tray: Tray | null = null

/**
 * Create the system tray icon and menu
 */
export function createTray(): Tray {
  let icon = createAppIcon()

  // Try alternative path if icon not found
  if (icon.isEmpty()) {
    icon = nativeImage.createFromPath(resolveAppIconPath())
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

  const showOrCreateMainWindow = () => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
    } else {
      createMainWindow()
    }
  }

  const contextMenu =
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([
          {
            label: 'Show ZuraAI',
            click: () => showMainWindow(),
          },
          {
            label: 'Settings...',
            accelerator: 'Command+,',
            click: () => showMainWindowAndNavigateSettings('providers'),
          },
          {
            label: 'About ZuraAI',
            click: () => showAboutWindow(),
          },
          { type: 'separator' },
          {
            label: 'Quit ZuraAI',
            accelerator: 'Command+Q',
            click: () => {
              allowMainWindowToClose()
              app.quit()
            },
          },
        ])
      : Menu.buildFromTemplate([
          {
            label: 'Open Chat',
            click: showOrCreateMainWindow,
          },
          {
            label: 'Settings',
            click: () => showMainWindowAndNavigateSettings('providers'),
          },
          { type: 'separator' },
          {
            label: 'Quit ZuraAI',
            click: () => {
              // Allow the main window close interceptor to fully exit.
              allowMainWindowToClose()
              app.quit()
            },
          },
        ])

  tray.setToolTip('ZuraAI')
  tray.setContextMenu(contextMenu)
  if (process.platform !== 'darwin') {
    tray.on('click', showOrCreateMainWindow)
  }

  return tray
}

/**
 * Destroy the tray icon
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
