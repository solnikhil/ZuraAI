import { registerChatStoreHandlers, unregisterChatStoreHandlers } from './chatStoreHandlers'
import { registerSecureStorageHandlers, unregisterSecureStorageHandlers } from './secureStorageHandlers'
import { registerSystemHandlers, unregisterSystemHandlers } from './systemHandlers'

/**
 * Register all IPC handlers for the main process
 */
export function registerAllHandlers(): void {
    registerChatStoreHandlers()
    registerSecureStorageHandlers()
    registerSystemHandlers()
}

/**
 * Unregister all IPC handlers (for cleanup)
 */
export function unregisterAllHandlers(): void {
    unregisterChatStoreHandlers()
    unregisterSecureStorageHandlers()
    unregisterSystemHandlers()
}

// Re-export individual handler modules for granular control
export { registerChatStoreHandlers, unregisterChatStoreHandlers } from './chatStoreHandlers'
export { registerSecureStorageHandlers, unregisterSecureStorageHandlers } from './secureStorageHandlers'
export { registerSystemHandlers, unregisterSystemHandlers } from './systemHandlers'
