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
  destroyPromptPopup,
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

// Resolve packaged asset paths consistently in both development and production.
const DIST_PATH = process.env.DIST || path.join(__dirname, '../dist')
process.env.DIST = DIST_PATH
process.env.PUBLIC = app.isPackaged ? DIST_PATH : path.join(__dirname, '../public')

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')



const WINDOWS_APP_ID = 'in.zuraai.desktop'
const APP_NAME = 'ZuraAI'
const STARTUP_LOG_PREFIX = '[startup]'
const IS_MACOS = process.platform === 'darwin'
let isAwaitingMcpShutdown = false
let hasCompletedMcpShutdown = false

function registerSessionSecurityHandlers(): void {
  const defaultSession = session.defaultSession

  defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  defaultSession.setPermissionCheckHandler(() => false)
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
  destroyPromptPopup()
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
  registerUpdaterHandlers(getMainWindow)
  // Hook up MCP shutdown so the install path can drain managed MCP servers
  // before the platform installer takes over.
  setShutdownHook(() => shutdownMcpManager())
  registerCodeExecutionHandlers()
  registerTerminalHandlers()
  registerDiscordRpcHandlers(getMainWindow)
  if (!IS_MACOS) {
    registerComputerUseHandlers()
  }
  startResourceMonitor()

  registerSessionSecurityHandlers()
  await initializeMcpManager({
    autoConnect: true,
    clientInfo: {
      name: APP_NAME,
      version: app.getVersion(),
    },
  })
  deferredInitializer.markIPCReady()
  createApplicationMenu()
  applyDevelopmentAppIcon()
  initializeOverlay()
  applyOverlaySettings({})

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
