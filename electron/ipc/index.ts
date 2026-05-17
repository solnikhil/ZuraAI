import { registerChatStoreHandlers, unregisterChatStoreHandlers } from './chatStoreHandlers'
import {
  registerChatDiagnosticsHandlers,
  unregisterChatDiagnosticsHandlers,
} from './chatDiagnosticsHandlers'
import { registerOverlayHandlers, unregisterOverlayHandlers } from './overlayHandlers'
import {
  registerPromptPopupHandlers,
  unregisterPromptPopupHandlers,
} from './promptPopupHandlers'
import {
  registerSecureStorageHandlers,
  unregisterSecureStorageHandlers,
} from './secureStorageHandlers'
import { registerSystemHandlers, unregisterSystemHandlers } from './systemHandlers'

interface IpcDomainHandlers {
  register: () => void
  unregister: () => void
}

const IPC_DOMAIN_HANDLERS: readonly IpcDomainHandlers[] = [
  {
    register: registerChatStoreHandlers,
    unregister: unregisterChatStoreHandlers,
  },
  {
    register: registerChatDiagnosticsHandlers,
    unregister: unregisterChatDiagnosticsHandlers,
  },
  {
    register: registerSecureStorageHandlers,
    unregister: unregisterSecureStorageHandlers,
  },
  {
    register: registerOverlayHandlers,
    unregister: unregisterOverlayHandlers,
  },
  {
    register: registerPromptPopupHandlers,
    unregister: unregisterPromptPopupHandlers,
  },
  {
    register: registerSystemHandlers,
    unregister: unregisterSystemHandlers,
  },
] as const

/**
 * Registers every main-process IPC handler exposed by the app.
 *
 * This function is the single entry point used during startup to wire up the
 * privileged IPC surface after Electron is ready. Each imported registrar owns
 * a focused slice of functionality:
 * - chat store persistence
 * - secure credential storage
 * - system and window controls
 *
 * Keeping registration centralized makes it easier to audit which renderer
 * requests are actually handled by the main process.
 */
export function registerAllHandlers(): void {
  for (const domain of IPC_DOMAIN_HANDLERS) {
    domain.register()
  }
}

/**
 * Re-export individual registrars so specific IPC domains can be composed or
 * tested independently without forcing the full handler set to be installed.
 */
export { registerChatStoreHandlers, unregisterChatStoreHandlers } from './chatStoreHandlers'
export {
  registerChatDiagnosticsHandlers,
  unregisterChatDiagnosticsHandlers,
} from './chatDiagnosticsHandlers'
export {
  registerSecureStorageHandlers,
  unregisterSecureStorageHandlers,
} from './secureStorageHandlers'
export {
  registerOverlayHandlers,
  unregisterOverlayHandlers,
} from './overlayHandlers'
export { registerSystemHandlers, unregisterSystemHandlers } from './systemHandlers'
export {
  registerPromptPopupHandlers,
  unregisterPromptPopupHandlers,
} from './promptPopupHandlers'
