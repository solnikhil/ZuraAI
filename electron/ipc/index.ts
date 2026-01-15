import { registerChatStoreHandlers, unregisterChatStoreHandlers } from './chatStoreHandlers'
import { registerSecureStorageHandlers, unregisterSecureStorageHandlers } from './secureStorageHandlers'
import { registerSystemHandlers, unregisterSystemHandlers } from './systemHandlers'
import { registerPDFHandlers, unregisterPDFHandlers } from './pdfHandlers'

/**
 * Register all IPC handlers for the main process
 */
export function registerAllHandlers(): void {
    registerChatStoreHandlers()
    registerSecureStorageHandlers()
    registerSystemHandlers()
    registerPDFHandlers()
}

/**
 * Unregister all IPC handlers (for cleanup)
 */
export function unregisterAllHandlers(): void {
    unregisterChatStoreHandlers()
    unregisterSecureStorageHandlers()
    unregisterSystemHandlers()
    unregisterPDFHandlers()
}

// Re-export individual handler modules for granular control
export { registerChatStoreHandlers, unregisterChatStoreHandlers } from './chatStoreHandlers'
export { registerSecureStorageHandlers, unregisterSecureStorageHandlers } from './secureStorageHandlers'
export { registerSystemHandlers, unregisterSystemHandlers } from './systemHandlers'
export { registerPDFHandlers, unregisterPDFHandlers } from './pdfHandlers'
