import { registerChatStoreHandlers, unregisterChatStoreHandlers } from './chatStoreHandlers'
import { registerSecureStorageHandlers, unregisterSecureStorageHandlers } from './secureStorageHandlers'
import { registerSystemHandlers, unregisterSystemHandlers } from './systemHandlers'
import { registerPerformanceHandlers, unregisterPerformanceHandlers } from './performanceHandlers'
import { registerNotificationHandlers, unregisterNotificationHandlers } from './notificationHandlers'

/**
 * Register all IPC handlers for the main process
 */
export function registerAllHandlers(): void {
    // Register core handlers
    registerChatStoreHandlers()
    registerSecureStorageHandlers()
    registerSystemHandlers()
    registerPerformanceHandlers()
    registerNotificationHandlers()
}

/**
 * Unregister all IPC handlers (for cleanup)
 */
export function unregisterAllHandlers(): void {
    unregisterChatStoreHandlers()
    unregisterSecureStorageHandlers()
    unregisterSystemHandlers()
    unregisterPerformanceHandlers()
    unregisterNotificationHandlers()
}

// Re-export individual handler modules for granular control
export { registerChatStoreHandlers, unregisterChatStoreHandlers } from './chatStoreHandlers'
export { registerSecureStorageHandlers, unregisterSecureStorageHandlers } from './secureStorageHandlers'
export { registerSystemHandlers, unregisterSystemHandlers } from './systemHandlers'
export { registerPerformanceHandlers, unregisterPerformanceHandlers } from './performanceHandlers'
export { registerNotificationHandlers, unregisterNotificationHandlers } from './notificationHandlers'
