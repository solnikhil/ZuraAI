import { BrowserWindow } from 'electron'
import { trustedIpcMain as ipcMain } from './trustedIpc'
import * as chatStore from '../chatStore'
import * as memoryStore from '../memoryStore'
import * as summaryStore from '../conversationSummaryStore'
import { loadToolMediaDataUrl } from '../tools/toolMediaStore'
import {
  assertChatIndexInput,
  assertChatSessionInput,
  assertFoldersInput,
  assertSessionLoadOptions,
  assertSessionsInput,
} from './chatStoreValidation'
import type { ChatStoreChangedEvent, ChatStoreMutationResult } from '../../src/electron/types'

const CHAT_STORE_CHANGED_CHANNEL = 'chat-store:changed'
const MEMORY_CHANGED_CHANNEL = 'memory-store:changed'

let chatStoreRevision = 0

function getMutationResult(changed: boolean): ChatStoreMutationResult {
  if (changed) chatStoreRevision += 1
  return { changed, revision: chatStoreRevision }
}

function broadcastChatStoreChanged(originWebContentsId: number, revision: number): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    const event: ChatStoreChangedEvent = {
      revision,
      source: window.webContents.id === originWebContentsId ? 'self' : 'external',
    }
    window.webContents.send(CHAT_STORE_CHANGED_CHANNEL, event)
  }
}

function broadcastMemoryStoreChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    window.webContents.send(MEMORY_CHANGED_CHANNEL)
  }
}

/** Registers chat and folder persistence IPC handlers. */
export function registerChatStoreHandlers(): void {
  /** Return lightweight session metadata only. */
  ipcMain.handle('chat-store:get-metadata', async () => {
    return chatStore.getSessionMetadataAsync()
  })

  /** Return the process-local durable mutation revision for missed-event reconciliation. */
  ipcMain.handle('chat-store:get-revision', async () => chatStoreRevision)

  /** Return one chat session on demand. Supports optional { limit } to load only the most recent N messages for fast UI. */
  ipcMain.handle(
    'chat-store:get-session',
    async (_event, sessionId: string, options?: { limit?: number }) => {
      if (typeof sessionId !== 'string' || !sessionId.trim()) {
        throw new Error('Invalid chat session id')
      }
      assertSessionLoadOptions(options)
      return chatStore.getSessionAsync(sessionId, options)
    }
  )

  /** Save or replace one full chat session. */
  ipcMain.handle('chat-store:save-session', async (ipcEvent, session: unknown) => {
    assertChatSessionInput(session)
    await chatStore.saveSessionAsync(session)
    const result = getMutationResult(true)
    broadcastChatStoreChanged(ipcEvent.sender.id, result.revision)
    return result
  })

  /** Delete one full chat session and its metadata. */
  ipcMain.handle('chat-store:delete-session', async (ipcEvent, sessionId) => {
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('Invalid chat session id')
    }
    const deleted = await chatStore.deleteSessionAsync(sessionId)
    if (deleted) {
      const result = getMutationResult(true)
      broadcastChatStoreChanged(ipcEvent.sender.id, result.revision)
      const [deletedMemories, deletedSummary] = await Promise.all([
        memoryStore.deleteMemoriesForSessionAsync(sessionId),
        summaryStore.deleteSummaryAsync(sessionId),
      ])
      if (deletedMemories > 0 || deletedSummary) {
        broadcastMemoryStoreChanged()
      }
      return result
    }
    return getMutationResult(false)
  })

  /** Replace lightweight session metadata and folders. */
  ipcMain.handle('chat-store:save-index', async (ipcEvent, index: unknown) => {
    assertChatIndexInput(index)
    await chatStore.saveChatIndexAsync(index)
    const result = getMutationResult(true)
    broadcastChatStoreChanged(ipcEvent.sender.id, result.revision)
    return result
  })

  /** Return all stored chat sessions. */
  ipcMain.handle('chat-store:get-all', async () => {
    return chatStore.getAllSessionsAsync()
  })

  /**
   * Return all sessions with multi-MB fields stripped for Usage metrics.
   * Prefer this over get-all so the renderer never holds full chat bodies.
   */
  ipcMain.handle('chat-store:get-usage-sessions', async () => {
    return chatStore.getUsageSessionsAsync()
  })

  /** Replace all stored chat sessions. */
  ipcMain.handle('chat-store:save-all', async (ipcEvent, sessions: unknown) => {
    assertSessionsInput(sessions)
    await chatStore.saveAllSessionsAsync(sessions)
    const result = getMutationResult(true)
    broadcastChatStoreChanged(ipcEvent.sender.id, result.revision)
    return result
  })

  /** Import legacy renderer-localStorage chat history. */
  ipcMain.handle('chat-store:migrate', async (ipcEvent, localStorageData: unknown) => {
    assertSessionsInput(localStorageData)
    const changed = await chatStore.migrateFromLocalStorage(localStorageData)
    const result = getMutationResult(changed)
    if (changed) broadcastChatStoreChanged(ipcEvent.sender.id, result.revision)
    return result
  })

  /** Return all stored chat folders. */
  ipcMain.handle('chat-store:get-all-folders', async () => {
    return chatStore.getAllFoldersAsync()
  })

  /**
   * Load an externalized tool screenshot by mediaRef only.
   * Does not accept filesystem paths from the renderer.
   */
  ipcMain.handle('tool-media:load', async (_event, mediaRef: unknown) => {
    if (typeof mediaRef !== 'string' || !mediaRef.startsWith('tool-media:')) {
      return null
    }
    return loadToolMediaDataUrl(mediaRef)
  })

  /** Replace all stored chat folders. */
  ipcMain.handle('chat-store:save-folders', async (ipcEvent, folders: unknown) => {
    assertFoldersInput(folders)
    await chatStore.saveFoldersAsync(folders)
    const result = getMutationResult(true)
    broadcastChatStoreChanged(ipcEvent.sender.id, result.revision)
    return result
  })
}

/** Unregister all chat-store IPC handlers. */
export function unregisterChatStoreHandlers(): void {
  ipcMain.removeHandler('chat-store:get-metadata')
  ipcMain.removeHandler('chat-store:get-revision')
  ipcMain.removeHandler('chat-store:get-session')
  ipcMain.removeHandler('chat-store:save-session')
  ipcMain.removeHandler('chat-store:delete-session')
  ipcMain.removeHandler('chat-store:save-index')
  ipcMain.removeHandler('chat-store:get-all')
  ipcMain.removeHandler('chat-store:get-usage-sessions')
  ipcMain.removeHandler('chat-store:save-all')
  ipcMain.removeHandler('chat-store:migrate')
  ipcMain.removeHandler('chat-store:get-all-folders')
  ipcMain.removeHandler('chat-store:save-folders')
  ipcMain.removeHandler('tool-media:load')
}
