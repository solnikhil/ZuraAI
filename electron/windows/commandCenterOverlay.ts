import { app, BrowserWindow, shell, screen } from 'electron'
import path from 'path'

import { resolveDistPath } from './mainWindow'
import { resolveAppIconPath } from '../windowIcon'

const devServerUrl = process.env.VITE_DEV_SERVER_URL
const devServerOrigin = devServerUrl ? new URL(devServerUrl).origin : null

let commandCenterWindow: BrowserWindow | null = null

function isExternalHttpUrl(url: string): boolean {
  if (!url.startsWith('http:') && !url.startsWith('https:')) return false
  if (devServerOrigin && url.startsWith(devServerOrigin)) return false
  return true
}

function centerBounds(): { x: number; y: number; width: number; height: number } {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const width = Math.min(760, Math.max(560, Math.floor(display.workArea.width * 0.46)))
  const height = 232
  return {
    x: display.workArea.x + Math.round((display.workArea.width - width) / 2),
    y: display.workArea.y + Math.round(display.workArea.height * 0.18),
    width,
    height,
  }
}

function createCommandCenterWindow(): BrowserWindow {
  if (commandCenterWindow && !commandCenterWindow.isDestroyed()) {
    return commandCenterWindow
  }

  const distPath = resolveDistPath(__dirname)
  const bounds = centerBounds()

  commandCenterWindow = new BrowserWindow({
    ...bounds,
    title: 'ZuraAI Command Center',
    icon: resolveAppIconPath(),
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
      spellcheck: false,
      backgroundThrottling: false,
      additionalArguments: ['--process-name=ZuraAI-CommandCenter'],
    },
  })

  commandCenterWindow.removeMenu()

  commandCenterWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  commandCenterWindow.webContents.on('will-navigate', (event, url) => {
    if (isExternalHttpUrl(url)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  commandCenterWindow.on('blur', () => {
    commandCenterWindow?.hide()
  })

  commandCenterWindow.on('closed', () => {
    commandCenterWindow = null
  })

  const loadPromise = process.env.VITE_DEV_SERVER_URL
    ? commandCenterWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/command-center`)
    : commandCenterWindow.loadFile(path.join(distPath, 'index.html'), { hash: 'command-center' })

  void loadPromise.catch((error) => {
    console.error('[MAIN] Failed to load Command Center window:', error)
  })

  return commandCenterWindow
}

export function showCommandCenterWindow(): void {
  const win = createCommandCenterWindow()
  win.setBounds(centerBounds())
  win.show()
  win.focus()
  win.webContents.send('command-center:shown')
}

export function hideCommandCenterWindow(): void {
  if (commandCenterWindow && !commandCenterWindow.isDestroyed()) {
    commandCenterWindow.hide()
  }
}

export function toggleCommandCenterWindow(): void {
  const win = createCommandCenterWindow()
  if (win.isVisible()) {
    win.hide()
    return
  }
  showCommandCenterWindow()
}

export function destroyCommandCenterWindow(): void {
  if (commandCenterWindow && !commandCenterWindow.isDestroyed()) {
    commandCenterWindow.destroy()
  }
  commandCenterWindow = null
}
