import { ipcMain } from 'electron'
import * as secureStorage from '../secureStorage'

/**
 * Register all secure storage IPC handlers
 */
export function registerSecureStorageHandlers(): void {
    ipcMain.handle('secure-storage:get', async (_event, key: string) => {
        return secureStorage.getSecureValueAsync(key as any)
    })

    ipcMain.handle('secure-storage:set', async (_event, key: string, value: string) => {
        // Use async version to ensure data is written to disk before returning
        return secureStorage.setSecureValueAsync(key as any, value)
    })

    ipcMain.handle('secure-storage:get-all', async () => {
        return secureStorage.getAllSecureValuesAsync()
    })

    ipcMain.handle('secure-storage:clear', () => {
        return secureStorage.clearSecureStorage()
    })

    ipcMain.handle('secure-storage:status', () => {
        return secureStorage.getStorageStatus()
    })
}

/**
 * Unregister all secure storage IPC handlers
 */
export function unregisterSecureStorageHandlers(): void {
    ipcMain.removeHandler('secure-storage:get')
    ipcMain.removeHandler('secure-storage:set')
    ipcMain.removeHandler('secure-storage:get-all')
    ipcMain.removeHandler('secure-storage:clear')
    ipcMain.removeHandler('secure-storage:status')
}
