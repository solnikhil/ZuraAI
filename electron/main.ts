import { app, globalShortcut, session } from 'electron'
import path from 'path'
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer'

import {
  applyOverlaySettings,
  cleanupOverlay,
  createMainWindow,
  createApplicationMenu,
  createTray,
  destroyTray,
  getMainWindow,
  initializeOverlay,
  destroyChatDebugWindow,
} from './windows'
import { applyDevelopmentAppIcon } from './windowIcon'
import { registerAllHandlers } from './ipc'
import {
  initializeMcpManager,
  registerMcpHandlers,
  shutdownMcpManager,
  unregisterMcpHandlers,
} from './mcp'
import { registerToolHandlers } from './tools'
import {
  cleanupAutoUpdater,
  initializeAutoUpdater,
  isInstallingUpdate,
  registerUpdaterHandlers,
  setShutdownHook,
} from './updater'
import { deferredInitializer } from './startup/deferredInit'
import { startResourceMonitor, stopResourceMonitor } from './diagnostics/resourceMonitor'
import {
  registerCodeExecutionHandlers,
  unregisterCodeExecutionHandlers,
  disposeCodeExecutionApprovalManager,
} from './tools/code-execution'
import {
  registerTerminalHandlers,
  unregisterTerminalHandlers,
  disposeTerminalApprovalManager,
} from './tools/terminal'
import {
  registerComputerUseHandlers,
  unregisterComputerUseHandlers,
  disposeComputerUseApprovalManager,
} from './tools/computer-use'
import {
  registerDiscordRpcHandlers,
  unregisterDiscordRpcHandlers,
  disposeDiscordRpcClient,
} from './discordRpc'
import { trackAppCrash, trackStartupAnalytics } from './analytics'
import { startMonitorRuntime, stopMonitorRuntime } from './monitors'
import { log } from './startup/logger'

// Resolve packaged asset paths consistently in both development and production.
const DIST_PATH = process.env.DIST || path.join(__dirname, '../dist')
process.env.DIST = DIST_PATH
process.env.PUBLIC = app.isPackaged ? DIST_PATH : path.join(__dirname, '../public')

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')



const WINDOWS_APP_ID = 'in.zuraai.desktop'
const APP_NAME = 'ZuraAI'
const IS_MACOS = process.platform === 'darwin'
let isAwaitingMcpShutdown = false
let hasCompletedMcpShutdown = false

process.on('uncaughtException', (error) => {
  trackAppCrash({
    category: 'uncaught_exception',
    code: error.name,
    processType: 'main',
    fatal: true,
  })
  log.error(`uncaught exception: ${error.message}`)
  if (error.stack) log.error(error.stack)
})

process.on('unhandledRejection', (reason) => {
  const code = reason instanceof Error ? reason.name : typeof reason
  trackAppCrash({
    category: 'unhandled_rejection',
    code,
    processType: 'main',
    fatal: false,
  })
  const message = reason instanceof Error ? reason.message : String(reason)
  log.error(`unhandled rejection: ${message}`)
})

function registerSessionSecurityHandlers(): void {
  const defaultSession = session.defaultSession

  defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  defaultSession.setPermissionCheckHandler(() => false)

  // CORS bypass for NVIDIA NIM API: integrate.api.nvidia.com does not send
  // Access-Control-Allow-Origin headers, so renderer fetch() is blocked.
  defaultSession.webRequest.onHeadersReceived(
    { urls: ['https://integrate.api.nvidia.com/*'] },
    (details, callback) => {
      const responseHeaders = details.responseHeaders || {}
      responseHeaders['Access-Control-Allow-Origin'] = ['*']
      responseHeaders['Access-Control-Allow-Headers'] = ['*']
      responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS']
      responseHeaders['Access-Control-Max-Age'] = ['86400']
      callback({ responseHeaders, cancel: false })
    }
  )
}

app.commandLine.appendSwitch('process-name', APP_NAME)

if (process.platform === 'win32') {
  app.setAppUserModelId(WINDOWS_APP_ID)
}
app.setName(APP_NAME)

process.title = APP_NAME

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (IS_MACOS && !getMainWindow()) {
    createMainWindow()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  cleanupOverlay()
  destroyChatDebugWindow()
  unregisterMcpHandlers()
  disposeCodeExecutionApprovalManager()
  unregisterCodeExecutionHandlers()
  disposeTerminalApprovalManager()
  unregisterTerminalHandlers()
  unregisterDiscordRpcHandlers()
  disposeDiscordRpcClient()
  disposeComputerUseApprovalManager()
  unregisterComputerUseHandlers()

  cleanupAutoUpdater()
  destroyTray()
  stopResourceMonitor()
  stopMonitorRuntime()
})

app.on('before-quit', (event) => {
  if (hasCompletedMcpShutdown) {
    return
  }

  // The update install path already runs the shutdown hook synchronously and
  // then calls autoUpdater.quitAndInstall(...). Don't preventDefault here —
  // that would race with the platform installer and freeze the app while async
  // tasks unwind.
  if (isInstallingUpdate()) {
    hasCompletedMcpShutdown = true
    return
  }

  event.preventDefault()

  if (isAwaitingMcpShutdown) {
    return
  }

  isAwaitingMcpShutdown = true
  void shutdownMcpManager()
    .catch((error) => {
      log.error(`MCP shutdown failed: ${error instanceof Error ? error.message : String(error)}`)
    })
    .finally(() => {
      hasCompletedMcpShutdown = true
      isAwaitingMcpShutdown = false
      app.quit()
    })
})

app.whenReady().then(async () => {
  log.banner(app.getVersion())
  log.startPhase('app-ready')
  deferredInitializer.markAppReady()
  log.endPhase('app-ready')

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
          log.success(`devtools installed: ${name}`)
        } catch (err) {
          log.warn(`devtools install skipped: ${err instanceof Error ? err.message : String(err)}`)
        }
      },
    })
  }

  // Register every preload-exposed IPC surface before the window is created.
  log.startPhase('ipc-handlers')
  registerAllHandlers()
  registerMcpHandlers()
  registerToolHandlers()
  registerUpdaterHandlers(getMainWindow)
  setShutdownHook(() => shutdownMcpManager())
  registerCodeExecutionHandlers()
  registerTerminalHandlers()
  registerDiscordRpcHandlers(getMainWindow)
  if (!IS_MACOS) {
    registerComputerUseHandlers()
  }
  startResourceMonitor()
  registerSessionSecurityHandlers()
  log.endPhase('ipc-handlers')

  log.startPhase('mcp-init')
  await initializeMcpManager({
    autoConnect: true,
    clientInfo: {
      name: APP_NAME,
      version: app.getVersion(),
    },
  })
  log.endPhase('mcp-init')
  deferredInitializer.markIPCReady()

  createApplicationMenu()
  applyDevelopmentAppIcon()

  log.startPhase('overlay')
  initializeOverlay()
  applyOverlaySettings({})
  log.endPhase('overlay')

  deferredInitializer.registerTask({
    name: 'scheduled-tasks',
    priority: 'high',
    delayMs: 1000,
    execute: async () => {
      await startMonitorRuntime()
      log.success('scheduled tasks initialized')
    },
  })

  // Defer auto-updater initialization (only in production)
  // The updater itself adds an additional 10-second delay before checking
  deferredInitializer.registerTask({
    name: 'auto-updater',
    priority: 'low',
    delayMs: 0, // Start immediately after window visible, updater adds its own 10s delay
    execute: async () => {
      initializeAutoUpdater(getMainWindow)
      log.success('auto-updater initialized')
    },
  })

  log.startPhase('tray')
  createTray()
  log.endPhase('tray')

  log.startPhase('main-window')
  createMainWindow()
  log.endPhase('main-window')

  void trackStartupAnalytics()
})
