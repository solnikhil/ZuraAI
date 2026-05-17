import { app, BrowserWindow } from 'electron'
import path from 'path'

import { getMainWindow, resolveDistPath } from './mainWindow'
import { resolveAppIconPath } from '../windowIcon'

let chatDebugWindow: BrowserWindow | null = null

function buildHash(sessionId: string): string {
  // The route renderer parses sessionId from the hash query string. We URL-encode
  // the session id to keep arbitrary characters from breaking the hash.
  return `chat-debug?sessionId=${encodeURIComponent(sessionId)}`
}

/**
 * Open (or focus) the dev-only Chat Debug window for a given chat session.
 *
 * Returns `null` in packaged builds — the window is part of the same
 * dev-diagnostics surface that's intentionally absent from production.
 */
export function showChatDebugWindow(sessionId: string): BrowserWindow | null {
  if (app.isPackaged) return null
  if (typeof sessionId !== 'string' || !sessionId.trim()) return null

  const trimmedSessionId = sessionId.trim()
  const targetHash = buildHash(trimmedSessionId)

  if (chatDebugWindow && !chatDebugWindow.isDestroyed()) {
    // Reuse the existing window. Reload it onto the requested session so the
    // panel is always scoped to whichever chat the developer just selected.
    const distPath = resolveDistPath(__dirname)
    const loadPromise = process.env.VITE_DEV_SERVER_URL
      ? chatDebugWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/${targetHash}`)
      : chatDebugWindow.loadFile(path.join(distPath, 'index.html'), { hash: targetHash })

    void loadPromise.catch((error) => {
      console.error('[MAIN] Failed to reload chat debug window:', error)
    })

    if (chatDebugWindow.isMinimized()) chatDebugWindow.restore()
    chatDebugWindow.show()
    chatDebugWindow.focus()
    return chatDebugWindow
  }

  const distPath = resolveDistPath(__dirname)
  const parentWindow = getMainWindow() ?? undefined

  chatDebugWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    title: 'ZuraAI · Chat Debug Logs',
    icon: resolveAppIconPath(),
    parent: parentWindow,
    modal: false,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    resizable: true,
    show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    skipTaskbar: false,
    backgroundColor: '#181818',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // Dev-only window — DevTools are useful for debugging the debug panel itself.
      devTools: !app.isPackaged,
      spellcheck: false,
      additionalArguments: ['--process-name=ZuraAI-ChatDebug'],
    },
  })

  chatDebugWindow.removeMenu()

  chatDebugWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  chatDebugWindow.once('ready-to-show', () => {
    chatDebugWindow?.show()
    chatDebugWindow?.focus()
  })

  const loadPromise = process.env.VITE_DEV_SERVER_URL
    ? chatDebugWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/${targetHash}`)
    : chatDebugWindow.loadFile(path.join(distPath, 'index.html'), { hash: targetHash })

  void loadPromise.catch((error) => {
    console.error('[MAIN] Failed to load chat debug window:', error)
  })

  chatDebugWindow.on('closed', () => {
    chatDebugWindow = null
  })

  return chatDebugWindow
}

/**
 * Closes the chat debug window if it's open. Safe to call when there is no
 * window. Used at app shutdown alongside other window cleanups.
 */
export function destroyChatDebugWindow(): void {
  if (chatDebugWindow && !chatDebugWindow.isDestroyed()) {
    chatDebugWindow.close()
  }
  chatDebugWindow = null
}
