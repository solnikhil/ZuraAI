import { app, BrowserWindow, shell } from 'electron'
import path from 'path'

import { getMainWindow, resolveDistPath } from './mainWindow'

const devServerUrl = process.env.VITE_DEV_SERVER_URL
const devServerOrigin = devServerUrl ? new URL(devServerUrl).origin : null

let aboutWindow: BrowserWindow | null = null

function isExternalHttpUrl(url: string): boolean {
  if (!url.startsWith('http:') && !url.startsWith('https:')) return false
  if (devServerOrigin && url.startsWith(devServerOrigin)) return false
  return true
}

export function createAboutWindow(): BrowserWindow {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    if (aboutWindow.isMinimized()) {
      aboutWindow.restore()
    }
    aboutWindow.show()
    aboutWindow.focus()
    return aboutWindow
  }

  const distPath = resolveDistPath(__dirname)
  const parentWindow = getMainWindow() ?? undefined

  aboutWindow = new BrowserWindow({
    width: 560,
    height: 420,
    minWidth: 560,
    minHeight: 420,
    maxWidth: 560,
    maxHeight: 420,
    title: 'About ZuraAI',
    icon: path.join(process.env.PUBLIC || '', 'icon.png'),
    parent: parentWindow,
    modal: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    skipTaskbar: true,
    backgroundColor: '#181818',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: !app.isPackaged,
      spellcheck: false,
      additionalArguments: ['--process-name=ZuraAI-About'],
    },
  })

  aboutWindow.removeMenu()

  aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  aboutWindow.webContents.on('will-navigate', (event, url) => {
    if (isExternalHttpUrl(url)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  aboutWindow.once('ready-to-show', () => {
    aboutWindow?.show()
    aboutWindow?.focus()
  })

  const loadPromise = process.env.VITE_DEV_SERVER_URL
    ? aboutWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/about`)
    : aboutWindow.loadFile(path.join(distPath, 'index.html'), { hash: 'about' })

  void loadPromise.catch((error) => {
    console.error('[MAIN] Failed to load about window:', error)
  })

  aboutWindow.on('closed', () => {
    aboutWindow = null
  })

  return aboutWindow
}

export function showAboutWindow(): void {
  createAboutWindow()
}
