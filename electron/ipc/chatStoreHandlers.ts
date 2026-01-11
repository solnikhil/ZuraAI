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

    ipcMain.handle('chat-store:create-session', (_event, session) => {
        chatStore.createSession(session)
        return true
    })

    ipcMain.handle('chat-store:update-session', (_event, id, updates) => {
        chatStore.updateSession(id, updates)
        return true
    })

    ipcMain.handle('chat-store:add-message', (_event, sessionId, message) => {
        chatStore.addMessageToSession(sessionId, message)
        return true
    })

    ipcMain.handle('chat-store:delete-session', (_event, id) => {
        chatStore.deleteSession(id)
        return true
    })

    ipcMain.handle('chat-store:clear-all', () => {
        chatStore.clearAllSessions()
        return true
    })

    ipcMain.handle('chat-store:migrate', (_event, localStorageData) => {
        chatStore.migrateFromLocalStorage(localStorageData)
        return true
    })

    ipcMain.handle('chat-store:get-path', () => {
        return chatStore.getStoreFilePath()
    })
}

/**
 * Unregister all chat store IPC handlers
 */
export function unregisterChatStoreHandlers(): void {
    ipcMain.removeHandler('chat-store:get-all')
    ipcMain.removeHandler('chat-store:save-all')
    ipcMain.removeHandler('chat-store:create-session')
    ipcMain.removeHandler('chat-store:update-session')
    ipcMain.removeHandler('chat-store:add-message')
    ipcMain.removeHandler('chat-store:delete-session')
    ipcMain.removeHandler('chat-store:clear-all')
    ipcMain.removeHandler('chat-store:migrate')
    ipcMain.removeHandler('chat-store:get-path')
}
