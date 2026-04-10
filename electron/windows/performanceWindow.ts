import { app, BrowserWindow, shell } from 'electron'
import path from 'path'

import { getMainWindow, resolveDistPath } from './mainWindow'

const devServerUrl = process.env.VITE_DEV_SERVER_URL
const devServerOrigin = devServerUrl ? new URL(devServerUrl).origin : null

let performanceWindow: BrowserWindow | null = null

function isExternalHttpUrl(url: string): boolean {
  if (!url.startsWith('http:') && !url.startsWith('https:')) return false
  if (devServerOrigin && url.startsWith(devServerOrigin)) return false
  return true
}

export function createPerformanceWindow(): BrowserWindow {
  if (performanceWindow && !performanceWindow.isDestroyed()) {
    if (performanceWindow.isMinimized()) {
      performanceWindow.restore()
    }
    performanceWindow.show()
    performanceWindow.focus()
    return performanceWindow
  }

  const distPath = resolveDistPath(__dirname)
  const parentWindow = getMainWindow() ?? undefined

  performanceWindow = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 920,
    minHeight: 640,
    title: 'Performance Monitor',
    icon: path.join(process.env.PUBLIC || '', 'icon.png'),
    parent: parentWindow,
    modal: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    resizable: true,
    show: false,
    autoHideMenuBar: true,
    skipTaskbar: true,
    backgroundColor: '#121212',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
      spellcheck: false,
      additionalArguments: ['--process-name=ZuraAI-Performance'],
    },
  })

  performanceWindow.removeMenu()

  performanceWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  performanceWindow.webContents.on('will-navigate', (event, url) => {
    if (isExternalHttpUrl(url)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  performanceWindow.once('ready-to-show', () => {
    performanceWindow?.show()
    performanceWindow?.focus()
  })

  const loadPromise = process.env.VITE_DEV_SERVER_URL
    ? performanceWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/performance`)
    : performanceWindow.loadFile(path.join(distPath, 'index.html'), { hash: 'performance' })

  void loadPromise.catch((error) => {
    console.error('[MAIN] Failed to load performance window:', error)
  })

  performanceWindow.on('closed', () => {
    performanceWindow = null
  })

  return performanceWindow
}

export function showPerformanceWindow(): void {
  createPerformanceWindow()
}
