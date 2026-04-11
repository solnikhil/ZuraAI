import { registerChatStoreHandlers, unregisterChatStoreHandlers } from './chatStoreHandlers'
import {
  registerSecureStorageHandlers,
  unregisterSecureStorageHandlers,
} from './secureStorageHandlers'
import {
  registerOverlayHandlers,
  unregisterOverlayHandlers,
} from './overlayHandlers'
import { registerSystemHandlers, unregisterSystemHandlers } from './systemHandlers'
import {
  registerPromptPopupHandlers,
  unregisterPromptPopupHandlers,
} from './promptPopupHandlers'

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
  // Register each IPC domain in one place so startup order stays explicit.
  registerChatStoreHandlers()
  registerSecureStorageHandlers()
registerOverlayHandlers()
  registerPromptPopupHandlers()
  registerSystemHandlers()
}

/**
 * Unregisters every main-process IPC handler registered by `registerAllHandlers`.
 *
 * This is primarily useful for teardown flows such as app shutdown, tests, or
 * hot-reload scenarios where handlers might otherwise be registered more than
 * once. Electron keeps handlers attached until they are explicitly removed, so
 * centralized cleanup helps prevent duplicate registrations and hard-to-trace
 * behavior.
 */
export function unregisterAllHandlers(): void {
  unregisterChatStoreHandlers()
  unregisterSecureStorageHandlers()
unregisterOverlayHandlers()
  unregisterPromptPopupHandlers()
  unregisterSystemHandlers()
}

/**
 * Re-export individual registrars so specific IPC domains can be composed or
 * tested independently without forcing the full handler set to be installed.
 */
export { registerChatStoreHandlers, unregisterChatStoreHandlers } from './chatStoreHandlers'
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
