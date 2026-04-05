import { ipcMain } from 'electron'
import * as chatStore from '../chatStore'

/**
 * Registers the IPC handlers responsible for chat history and folder persistence.
 *
 * These handlers form the main-process side of the renderer ↔ preload ↔ main
 * storage bridge. The renderer never talks to the filesystem directly; instead,
 * it invokes these narrow channels and this module delegates the actual
 * persistence work to `electron/chatStore.ts`.
 *
 * Kept intentionally small and explicit because this boundary is security- and
 * maintenance-sensitive in an open-source Electron app.
 */
export function registerChatStoreHandlers(): void {
  /**
   * Returns every persisted chat session.
   *
   * Used during app startup and refresh flows so the renderer can rebuild its
   * in-memory chat state from the canonical on-disk store.
   */
  ipcMain.handle('chat-store:get-all', async () => {
    return chatStore.getAllSessionsAsync()
  })

  /**
   * Replaces the full persisted chat session collection.
   *
   * The renderer sends the complete session array after local edits
   * (creating chats, renaming them, updating messages, deleting threads, etc.)
   * and the main process commits that array to disk.
   */
  ipcMain.handle('chat-store:save-all', async (_event, sessions) => {
    await chatStore.saveAllSessionsAsync(sessions)
    return true
  })

  /**
   * Imports chat data from legacy renderer-managed localStorage.
   *
   * This exists for migration/upgrade scenarios where older app versions stored
   * chat history in the renderer. Once received here, the data is normalized and
   * written into the current main-process-backed storage location.
   */
  ipcMain.handle('chat-store:migrate', async (_event, localStorageData) => {
    chatStore.migrateFromLocalStorage(localStorageData)
    return true
  })

  /**
   * Returns all persisted chat folders.
   *
   * Folders are stored separately from session content so the renderer can
   * rebuild sidebar organization state independently from chat message payloads.
   */
  ipcMain.handle('chat-store:get-all-folders', async () => {
    return chatStore.getAllFoldersAsync()
  })

  /**
   * Replaces the full persisted folder collection.
   *
   * Called when users create, rename, reorder, or remove folders in the chat UI.
   */
  ipcMain.handle('chat-store:save-folders', async (_event, folders) => {
    await chatStore.saveFoldersAsync(folders)
    return true
  })
}

/**
 * Unregisters every chat store IPC handler.
 *
 * This is mainly useful for cleanup in tests, hot-reload-style development
 * flows, or any lifecycle path where handlers may be re-registered.
 */
export function unregisterChatStoreHandlers(): void {
  ipcMain.removeHandler('chat-store:get-all')
  ipcMain.removeHandler('chat-store:save-all')
  ipcMain.removeHandler('chat-store:migrate')
  ipcMain.removeHandler('chat-store:get-all-folders')
  ipcMain.removeHandler('chat-store:save-folders')
}
