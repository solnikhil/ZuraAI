import { ipcMain } from 'electron'
import * as chatStore from '../chatStore'

/**
 * Register all chat store IPC handlers
 */
export function registerChatStoreHandlers(): void {
    ipcMain.handle('chat-store:get-all', () => {
        return chatStore.getAllSessions()
    })

    ipcMain.handle('chat-store:save-all', (_event, sessions) => {
        chatStore.saveAllSessions(sessions)
        return true
    })

    ipcMain.handle('chat-store:migrate', (_event, localStorageData) => {
        chatStore.migrateFromLocalStorage(localStorageData)
        return true
    })

    // Folder persistence handlers (Requirement 11.6)
    ipcMain.handle('chat-store:get-all-folders', () => {
        return chatStore.getAllFolders()
    })

    ipcMain.handle('chat-store:save-folders', (_event, folders) => {
        chatStore.saveFolders(folders)
        return true
    })
}

/**
 * Unregister all chat store IPC handlers
 */
export function unregisterChatStoreHandlers(): void {
    ipcMain.removeHandler('chat-store:get-all')
    ipcMain.removeHandler('chat-store:save-all')
    ipcMain.removeHandler('chat-store:migrate')
    ipcMain.removeHandler('chat-store:get-all-folders')
    ipcMain.removeHandler('chat-store:save-folders')
}
