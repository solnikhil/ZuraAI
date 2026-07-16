import { session, type BrowserWindow } from 'electron'
import { registerAllHandlers } from '../ipc'
import { registerMcpHandlers, unregisterMcpHandlers } from '../mcp'
import { registerToolHandlers, unregisterToolHandlers } from '../tools'
import {
  destroyAgentApprovalOverlay,
  registerAgentApprovalOverlayHandlers,
  unregisterAgentApprovalOverlayHandlers,
} from '../windows'
import {
  cleanupAutoUpdater,
  registerUpdaterHandlers,
  setShutdownHook,
  unregisterUpdaterHandlers,
} from '../updater'
import {
  disposeCodeExecutionApprovalManager,
  registerCodeExecutionHandlers,
  unregisterCodeExecutionHandlers,
} from '../tools/code-execution'
import {
  disposeTerminalApprovalManager,
  registerTerminalHandlers,
  unregisterTerminalHandlers,
} from '../tools/terminal'
import {
  disposeComputerUseApprovalManager,
  registerComputerUseHandlers,
  unregisterComputerUseHandlers,
} from '../tools/computer-use'
import {
  disposeDiscordRpcClient,
  registerDiscordRpcHandlers,
  unregisterDiscordRpcHandlers,
} from '../discordRpc'
import { disposeAppIndexRuntime } from '../appIndexService'
import { stopMonitorRuntime } from '../monitors'
import { DisposableRegistry } from './disposableRegistry'

export interface MainProcessCompositionOptions {
  isMacOS: boolean
  getMainWindow: () => BrowserWindow | null
  shutdownMcp: () => Promise<void>
}

function registerSessionSecurityHandlers(): () => void {
  const defaultSession = session.defaultSession
  defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false)
  )
  defaultSession.setPermissionCheckHandler(() => false)
  return () => {
    defaultSession.setPermissionRequestHandler(null)
    defaultSession.setPermissionCheckHandler(null)
  }
}

/** Registers privileged main-process surfaces and returns one idempotent disposer. */
export function registerMainProcessComposition(options: MainProcessCompositionOptions): () => void {
  const registry = new DisposableRegistry()
  try {
    registry.add(registerAllHandlers())

    registerMcpHandlers()
    registry.add(unregisterMcpHandlers)

    registerToolHandlers()
    registry.add(unregisterToolHandlers)

    registerAgentApprovalOverlayHandlers()
    registry.add(() => {
      unregisterAgentApprovalOverlayHandlers()
      destroyAgentApprovalOverlay()
    })

    registerUpdaterHandlers(options.getMainWindow)
    setShutdownHook(options.shutdownMcp)
    registry.add(() => {
      setShutdownHook(null)
      unregisterUpdaterHandlers()
      cleanupAutoUpdater()
    })

    registerCodeExecutionHandlers()
    registry.add(() => {
      unregisterCodeExecutionHandlers()
      disposeCodeExecutionApprovalManager()
    })

    registerTerminalHandlers()
    registry.add(() => {
      unregisterTerminalHandlers()
      disposeTerminalApprovalManager()
    })

    registerDiscordRpcHandlers(options.getMainWindow)
    registry.add(() => {
      unregisterDiscordRpcHandlers()
      disposeDiscordRpcClient()
    })

    if (!options.isMacOS) {
      registerComputerUseHandlers()
      registry.add(() => {
        unregisterComputerUseHandlers()
        disposeComputerUseApprovalManager()
      })
    }

    registry.add(registerSessionSecurityHandlers())
    registry.add(disposeAppIndexRuntime)
    registry.add(stopMonitorRuntime)
  } catch (error) {
    registry.dispose()
    throw error
  }

  return () => registry.dispose()
}
