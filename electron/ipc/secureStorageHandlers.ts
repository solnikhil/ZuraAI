import { ipcMain } from 'electron'
import * as secureStorage from '../secureStorage'

const ALLOWED_SECURE_STORAGE_KEYS = new Set([
    'openRouterApiKey',
    'perplexityApiKey',
    'groqApiKey',
    'tavilyApiKey',
    'alibabaApiKey',
])

type SecureStorageKey =
    | 'openRouterApiKey'
    | 'perplexityApiKey'
    | 'groqApiKey'
    | 'tavilyApiKey'
    | 'alibabaApiKey'

function assertSecureStorageKey(key: string): asserts key is SecureStorageKey {
    if (!ALLOWED_SECURE_STORAGE_KEYS.has(key)) {
        throw new Error(`Invalid secure storage key: ${key}`)
    }
}

/**
 * Register all secure storage IPC handlers
 */
export function registerSecureStorageHandlers(): void {
    ipcMain.handle('secure-storage:get', async (_event, key: string) => {
        assertSecureStorageKey(key)
        return secureStorage.getSecureValueAsync(key)
    })

    ipcMain.handle('secure-storage:set', async (_event, key: string, value: string) => {
        assertSecureStorageKey(key)
        // Use async version to ensure data is written to disk before returning
        return secureStorage.setSecureValueAsync(key, value)
    })
}

/**
 * Unregister all secure storage IPC handlers
 */
export function unregisterSecureStorageHandlers(): void {
    ipcMain.removeHandler('secure-storage:get')
    ipcMain.removeHandler('secure-storage:set')
}
