import { BrowserWindow, ipcMain } from 'electron'
import * as chatStore from '../chatStore'

const CHAT_STORE_CHANGED_CHANNEL = 'chat-store:changed'

function broadcastChatStoreChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    window.webContents.send(CHAT_STORE_CHANGED_CHANNEL)
  }
}

/** Registers chat and folder persistence IPC handlers. */
export function registerChatStoreHandlers(): void {
  /** Return lightweight session metadata only. */
  ipcMain.handle('chat-store:get-metadata', async () => {
    return chatStore.getSessionMetadataAsync()
  })

  /** Return one full chat session on demand. */
  ipcMain.handle('chat-store:get-session', async (_event, sessionId) => {
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('Invalid chat session id')
    }
    return chatStore.getSessionAsync(sessionId)
  })

  /** Save or replace one full chat session. */
  ipcMain.handle('chat-store:save-session', async (_event, session) => {
    await chatStore.saveSessionAsync(session)
    broadcastChatStoreChanged()
    return true
  })

  /** Delete one full chat session and its metadata. */
  ipcMain.handle('chat-store:delete-session', async (_event, sessionId) => {
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('Invalid chat session id')
    }
    const deleted = await chatStore.deleteSessionAsync(sessionId)
    if (deleted) broadcastChatStoreChanged()
    return deleted
  })

  /** Replace lightweight session metadata and folders. */
  ipcMain.handle('chat-store:save-index', async (_event, index) => {
    await chatStore.saveChatIndexAsync(index)
    broadcastChatStoreChanged()
    return true
  })

  /** Return all stored chat sessions. */
  ipcMain.handle('chat-store:get-all', async () => {
    return chatStore.getAllSessionsAsync()
  })

  /** Replace all stored chat sessions. */
  ipcMain.handle('chat-store:save-all', async (_event, sessions) => {
    await chatStore.saveAllSessionsAsync(sessions)
    broadcastChatStoreChanged()
    return true
  })

  /** Import legacy renderer-localStorage chat history. */
  ipcMain.handle('chat-store:migrate', async (_event, localStorageData) => {
    await chatStore.migrateFromLocalStorage(localStorageData)
    return true
  })

  /** Return all stored chat folders. */
  ipcMain.handle('chat-store:get-all-folders', async () => {
    return chatStore.getAllFoldersAsync()
  })

  /** Replace all stored chat folders. */
  ipcMain.handle('chat-store:save-folders', async (_event, folders) => {
    await chatStore.saveFoldersAsync(folders)
    broadcastChatStoreChanged()
    return true
  })
}

/** Unregister all chat-store IPC handlers. */
export function unregisterChatStoreHandlers(): void {
  ipcMain.removeHandler('chat-store:get-metadata')
  ipcMain.removeHandler('chat-store:get-session')
  ipcMain.removeHandler('chat-store:save-session')
  ipcMain.removeHandler('chat-store:delete-session')
  ipcMain.removeHandler('chat-store:save-index')
  ipcMain.removeHandler('chat-store:get-all')
  ipcMain.removeHandler('chat-store:save-all')
  ipcMain.removeHandler('chat-store:migrate')
  ipcMain.removeHandler('chat-store:get-all-folders')
  ipcMain.removeHandler('chat-store:save-folders')
}
