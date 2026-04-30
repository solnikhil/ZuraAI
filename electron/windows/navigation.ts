import { BrowserWindow } from 'electron'

import { createMainWindow, getMainWindow } from './mainWindow'

function showAndFocus(win: BrowserWindow): void {
  if (win.isMinimized()) {
    win.restore()
  }
  win.show()
  win.focus()
}

export function showMainWindowAndNavigateSettings(section = 'providers'): void {
  const win = getMainWindow() ?? createMainWindow()
  showAndFocus(win)

  const sendNavigation = () => {
    if (!win.isDestroyed()) {
      win.webContents.send('settings:navigate', section)
    }
  }

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', sendNavigation)
    return
  }

  sendNavigation()
}

