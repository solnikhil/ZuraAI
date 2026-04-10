import { app, globalShortcut, session } from 'electron'
import path from 'path'
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer'

import { createMainWindow, getMainWindow, createTray, destroyTray } from './windows'
import { resetPerformanceMonitorService } from './diagnostics/performanceMonitor'
import { registerAllHandlers } from './ipc'
import {
  initializeMcpManager,
  registerMcpHandlers,
  shutdownMcpManager,
  unregisterMcpHandlers,
} from './mcp'
import { registerToolHandlers } from './tools'
import { initializeAutoUpdater, registerUpdaterHandlers, cleanupAutoUpdater } from './updater'
import { deferredInitializer } from './startup/deferredInit'

// Resolve packaged asset paths consistently in both development and production.
const DIST_PATH = process.env.DIST || path.join(__dirname, '../dist')
process.env.DIST = DIST_PATH
process.env.PUBLIC = app.isPackaged ? DIST_PATH : path.join(__dirname, '../public')

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

// Disable window animations
app.commandLine.appendSwitch('wm-window-animations-disabled')

const WINDOWS_APP_ID = 'in.zuraai.desktop'
const APP_NAME = 'ZuraAI'
const STARTUP_LOG_PREFIX = '[startup]'
let isAwaitingMcpShutdown = false
let hasCompletedMcpShutdown = false

function registerSessionSecurityHandlers(): void {
  const defaultSession = session.defaultSession

  defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  defaultSession.setPermissionCheckHandler(() => false)
}

// Add process identifier for Task Manager (visible in "Command line" column)
app.commandLine.appendSwitch('process-name', 'ZuraAI-Main')

// Set App Name explicitly for Windows Task Manager
if (process.platform === 'win32') {
  app.setAppUserModelId(WINDOWS_APP_ID)
}
app.setName(APP_NAME)

// Set process title for main process (shows in Task Manager)
process.title = 'ZuraAI - Main'

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  unregisterMcpHandlers()
  cleanupAutoUpdater()
  resetPerformanceMonitorService()
  destroyTray()
})

app.on('before-quit', (event) => {
  if (hasCompletedMcpShutdown) {
    return
  }

  event.preventDefault()

  if (isAwaitingMcpShutdown) {
    return
  }

  isAwaitingMcpShutdown = true
  void shutdownMcpManager()
    .catch((error) => {
      console.error(`${STARTUP_LOG_PREFIX} MCP shutdown failed`, error)
    })
    .finally(() => {
      hasCompletedMcpShutdown = true
      isAwaitingMcpShutdown = false
      app.quit()
    })
})

app.whenReady().then(async () => {
  deferredInitializer.markAppReady()

  // Defer DevTools installation in development mode (2000ms after window visible)
  // Skip entirely in production builds
  if (!app.isPackaged) {
    deferredInitializer.registerTask({
      name: 'devtools-install',
      priority: 'low',
      delayMs: 2000,
      execute: async () => {
        try {
          const name = await installExtension(REACT_DEVELOPER_TOOLS)
          console.log(`${STARTUP_LOG_PREFIX} devtools installed: ${name}`)
        } catch (err) {
          console.warn(`${STARTUP_LOG_PREFIX} devtools install skipped`, err)
        }
      },
    })
  }

  // Register every preload-exposed IPC surface before the window is created.
  registerAllHandlers()
  registerMcpHandlers()
  registerToolHandlers()
  registerUpdaterHandlers()
  registerSessionSecurityHandlers()
  await initializeMcpManager({
    autoConnect: true,
    clientInfo: {
      name: APP_NAME,
      version: app.getVersion(),
    },
  })
  deferredInitializer.markIPCReady()

  // Defer auto-updater initialization (only in production)
  // The updater itself adds an additional 10-second delay before checking
  deferredInitializer.registerTask({
    name: 'auto-updater',
    priority: 'low',
    delayMs: 0, // Start immediately after window visible, updater adds its own 10s delay
    execute: async () => {
      initializeAutoUpdater(getMainWindow)
      console.log(`${STARTUP_LOG_PREFIX} auto-updater initialized`)
    },
  })

  createTray()

  createMainWindow()
})
