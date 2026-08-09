import { app, dialog, globalShortcut } from 'electron'
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
} from './windows'
import { applyDevelopmentAppIcon } from './windowIcon'
import { initializeMcpManager, connectAutoConnectMcpServers, shutdownMcpManager } from './mcp'
import { initializeAutoUpdater, isInstallingUpdate } from './updater'
import { deferredInitializer } from './startup/deferredInit'
import { trackAppCrash, trackStartupAnalytics } from './analytics'
import { startMonitorRuntime } from './monitors'
import {
  handleZuraAppUrl,
  handleZuraChatMessageUrl,
  registerZuraChatProtocolHandlers,
} from './chatLinks'
import { log } from './startup/logger'
import { registerMainProcessComposition } from './startup/mainProcessComposition'

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
let disposeMainProcessComposition: (() => void) | null = null
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
  // After an uncaught exception, process state is unreliable.
  // Terminate to prevent silent data corruption.
  setImmediate(() => app.exit(1))
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
  try {
    disposeMainProcessComposition?.()
  } catch (error) {
    log.error(
      `main-process disposal failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  disposeMainProcessComposition = null
  destroyTray()
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
  app
    .whenReady()
    .then(async () => {
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
      disposeMainProcessComposition = registerMainProcessComposition({
        isMacOS: IS_MACOS,
        getMainWindow,
        shutdownMcp: shutdownMcpManager,
      })
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
          await startMonitorRuntime({ getMainWindow })
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
    .catch((error: unknown) => {
      try {
        disposeMainProcessComposition?.()
      } catch {
        // Best-effort cleanup; the original error is more important.
      }
      const message = error instanceof Error ? error.message : String(error)
      log.error(`startup failed: ${message}`)
      dialog.showErrorBox('ZuraAI failed to start', message)
      app.exit(1)
    })
}
