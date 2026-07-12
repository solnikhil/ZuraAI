import { app, globalShortcut, session } from 'electron'
import path from 'path'
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer'

import {
  allowMainWindowToClose,
  createMainWindow,
  createApplicationMenu,
  createTray,
  destroyTray,
  getMainWindow,
  showMainWindow,
  setAppQuitting,
  destroyChatDebugWindow,
  destroyCommandCenterWindow,
  destroyAgentApprovalOverlay,
  registerAgentApprovalOverlayHandlers,
  unregisterAgentApprovalOverlayHandlers,
} from './windows'
import { applyDevelopmentAppIcon } from './windowIcon'
import { registerAllHandlers } from './ipc'
import {
  initializeMcpManager,
  connectAutoConnectMcpServers,
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
import {
  handleZuraAppUrl,
  handleZuraChatMessageUrl,
  registerZuraChatProtocolHandlers,
} from './chatLinks'
import { log } from './startup/logger'
import {
  disposeCommandCenter,
  registerCommandCenterHandlers,
  unregisterCommandCenterHandlers,
} from './commandCenter'
import { registerGitHubWorkspaceHandlers, unregisterGitHubWorkspaceHandlers } from './githubWorkspace'
import { registerExtensionHandlers, unregisterExtensionHandlers } from './extensions/extensionService'

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
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  registerZuraChatProtocolHandlers()
}

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

  // CORS bypass for provider APIs that do not send Access-Control-Allow-Origin
  // headers, so renderer fetch() is blocked.
  defaultSession.webRequest.onHeadersReceived(
    {
      urls: ['https://integrate.api.nvidia.com/*'],
    },
    (details, callback) => {
      const responseHeaders = details.responseHeaders || {}
      responseHeaders['Access-Control-Allow-Origin'] = ['*']
      responseHeaders['Access-Control-Allow-Headers'] = ['Authorization, Content-Type, Accept']
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
  // On Windows/Linux the main window hides to tray instead of closing, so this
  // usually only fires when every window was destroyed on quit. Keep darwin
  // behavior (menu bar app stays alive with zero windows).
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (!IS_MACOS) return
  // Dock click: show a hidden main window, or create one if it was destroyed.
  if (getMainWindow()) {
    showMainWindow()
  } else {
    createMainWindow()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  destroyChatDebugWindow()
  destroyCommandCenterWindow()
  destroyAgentApprovalOverlay()
  unregisterAgentApprovalOverlayHandlers()
  disposeCommandCenter()
  unregisterCommandCenterHandlers()
  unregisterGitHubWorkspaceHandlers()
  unregisterExtensionHandlers()
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
  stopMonitorRuntime()
})

app.on('before-quit', (event) => {
  // Let the main window fully close instead of intercepting as hide-to-tray.
  allowMainWindowToClose()
  // Allow macOS close handlers to destroy windows instead of hiding to Dock.
  setAppQuitting(true)

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

if (hasSingleInstanceLock) {
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
            log.warn(
              `devtools install skipped: ${err instanceof Error ? err.message : String(err)}`
            )
          }
        },
      })
    }

    // Register every preload-exposed IPC surface before the window is created.
    log.startPhase('ipc-handlers')
    registerAllHandlers()
    registerMcpHandlers()
    registerToolHandlers()
    registerAgentApprovalOverlayHandlers()
    registerCommandCenterHandlers()
    registerExtensionHandlers()
    registerGitHubWorkspaceHandlers()
    registerUpdaterHandlers(getMainWindow)
    setShutdownHook(() => shutdownMcpManager())
    registerCodeExecutionHandlers()
    registerTerminalHandlers()
    registerDiscordRpcHandlers(getMainWindow)
    if (!IS_MACOS) {
      registerComputerUseHandlers()
    }
    registerSessionSecurityHandlers()
    log.endPhase('ipc-handlers')

    // MCP manager without auto-connect on the critical path — connect after paint.
    log.startPhase('mcp-init')
    await initializeMcpManager({
      autoConnect: false,
      clientInfo: {
        name: APP_NAME,
        version: app.getVersion(),
      },
    })
    log.endPhase('mcp-init')
    deferredInitializer.markIPCReady()

    createApplicationMenu()
    applyDevelopmentAppIcon()

    deferredInitializer.registerTask({
      name: 'mcp-auto-connect',
      priority: 'high',
      delayMs: 0,
      execute: async () => {
        log.startPhase('mcp-auto-connect')
        await connectAutoConnectMcpServers()
        log.endPhase('mcp-auto-connect')
        log.success('MCP auto-connect completed')
      },
    })

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

    const initialAppLink = process.argv.find((arg) => arg.startsWith('zuraai://'))
    if (initialAppLink) {
      handleZuraAppUrl(initialAppLink)
    }

    const initialChatLink = process.argv.find((arg) => arg.startsWith('zura-chat://'))
    if (initialChatLink) {
      handleZuraChatMessageUrl(initialChatLink)
    }


    void trackStartupAnalytics()
  })
}
