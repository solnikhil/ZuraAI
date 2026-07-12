import { app, BrowserWindow } from 'electron'
import path from 'path'

import { getMainWindow, resolveDistPath } from './mainWindow'
import { resolveAppIconPath } from '../windowIcon'
import { installExternalNavigationGuards } from './externalNavigation'

let aboutWindow: BrowserWindow | null = null

function createAboutWindow(): BrowserWindow {
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

  const isMacOS = process.platform === 'darwin'

  aboutWindow = new BrowserWindow({
    width: 520,
    height: 580,
    minWidth: 520,
    minHeight: 580,
    title: 'About ZuraAI',
    icon: resolveAppIconPath(),
    parent: parentWindow,
    modal: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    resizable: false,
    show: false,
    autoHideMenuBar: !isMacOS,
    skipTaskbar: true,
    // Keep a solid fill so the About UI stays readable; on macOS use native
    // inset title-bar chrome (traffic lights) without full-window vibrancy.
    backgroundColor: '#181818',
    ...(isMacOS
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 14, y: 14 },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
      spellcheck: false,
      additionalArguments: ['--process-name=ZuraAI-About'],
    },
  })

  aboutWindow.removeMenu()

  installExternalNavigationGuards(aboutWindow)

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
