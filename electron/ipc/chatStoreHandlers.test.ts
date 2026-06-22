// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const chatStoreMocks = vi.hoisted(() => ({
  getSessionMetadataAsync: vi.fn(),
  getSessionAsync: vi.fn(),
  saveSessionAsync: vi.fn(),
  deleteSessionAsync: vi.fn(),
  saveChatIndexAsync: vi.fn(),
  getAllSessionsAsync: vi.fn(),
  saveAllSessionsAsync: vi.fn(),
  migrateFromLocalStorage: vi.fn(),
  getAllFoldersAsync: vi.fn(),
  saveFoldersAsync: vi.fn(),
}))

const memoryStoreMocks = vi.hoisted(() => ({
  deleteMemoriesForSessionAsync: vi.fn(),
}))

const summaryStoreMocks = vi.hoisted(() => ({
  deleteSummaryAsync: vi.fn(),
}))

const ipcMainMocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()

  return {
    handlers,
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel)
    }),
  }
})

const browserWindowMocks = vi.hoisted(() => {
  const send = vi.fn()
  return {
    send,
    getAllWindows: vi.fn(() => [
      {
        isDestroyed: () => false,
        webContents: { send },
      },
      {
        isDestroyed: () => true,
        webContents: { send: vi.fn() },
      },
    ]),
  }
})

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: browserWindowMocks.getAllWindows,
  },
  ipcMain: {
    handle: ipcMainMocks.handle,
    removeHandler: ipcMainMocks.removeHandler,
  },
}))

vi.mock('../chatStore', () => ({
  getSessionMetadataAsync: chatStoreMocks.getSessionMetadataAsync,
  getSessionAsync: chatStoreMocks.getSessionAsync,
  saveSessionAsync: chatStoreMocks.saveSessionAsync,
  deleteSessionAsync: chatStoreMocks.deleteSessionAsync,
  saveChatIndexAsync: chatStoreMocks.saveChatIndexAsync,
  getAllSessionsAsync: chatStoreMocks.getAllSessionsAsync,
  saveAllSessionsAsync: chatStoreMocks.saveAllSessionsAsync,
  migrateFromLocalStorage: chatStoreMocks.migrateFromLocalStorage,
  getAllFoldersAsync: chatStoreMocks.getAllFoldersAsync,
  saveFoldersAsync: chatStoreMocks.saveFoldersAsync,
}))

vi.mock('../memoryStore', () => ({
  deleteMemoriesForSessionAsync: memoryStoreMocks.deleteMemoriesForSessionAsync,
}))

vi.mock('../conversationSummaryStore', () => ({
  deleteSummaryAsync: summaryStoreMocks.deleteSummaryAsync,
}))

describe('registerChatStoreHandlers', () => {
  beforeEach(() => {
    vi.resetModules()
    ipcMainMocks.handlers.clear()
    ipcMainMocks.handle.mockClear()
    ipcMainMocks.removeHandler.mockClear()
    browserWindowMocks.getAllWindows.mockClear()
    browserWindowMocks.send.mockClear()
    chatStoreMocks.getSessionMetadataAsync.mockReset()
    chatStoreMocks.getSessionAsync.mockReset()
    chatStoreMocks.saveSessionAsync.mockReset()
    chatStoreMocks.deleteSessionAsync.mockReset()
    chatStoreMocks.saveChatIndexAsync.mockReset()
    chatStoreMocks.getAllSessionsAsync.mockReset()
    chatStoreMocks.saveAllSessionsAsync.mockReset()
    chatStoreMocks.migrateFromLocalStorage.mockReset()
    chatStoreMocks.getAllFoldersAsync.mockReset()
    chatStoreMocks.saveFoldersAsync.mockReset()
    memoryStoreMocks.deleteMemoriesForSessionAsync.mockReset()
    summaryStoreMocks.deleteSummaryAsync.mockReset()
    memoryStoreMocks.deleteMemoriesForSessionAsync.mockResolvedValue(0)
    summaryStoreMocks.deleteSummaryAsync.mockResolvedValue(false)
  })

  it('broadcasts chat-store:changed after saving sessions', async () => {
    const { registerChatStoreHandlers } = await import('./chatStoreHandlers')
    registerChatStoreHandlers()

    const handler = ipcMainMocks.handlers.get('chat-store:save-all')
    expect(handler).toBeTypeOf('function')

    await handler?.({}, [{ id: 'session-1' }])

    expect(chatStoreMocks.saveAllSessionsAsync).toHaveBeenCalledWith([{ id: 'session-1' }])
    expect(browserWindowMocks.getAllWindows).toHaveBeenCalledTimes(1)
    expect(browserWindowMocks.send).toHaveBeenCalledWith('chat-store:changed')
  })

  it('broadcasts chat-store:changed after saving folders', async () => {
    const { registerChatStoreHandlers } = await import('./chatStoreHandlers')
    registerChatStoreHandlers()

    const handler = ipcMainMocks.handlers.get('chat-store:save-folders')
    expect(handler).toBeTypeOf('function')

    await handler?.({}, [{ id: 'folder-1' }])

    expect(chatStoreMocks.saveFoldersAsync).toHaveBeenCalledWith([{ id: 'folder-1' }])
    expect(browserWindowMocks.send).toHaveBeenCalledWith('chat-store:changed')
  })

  it('deletes linked memory data when deleting a chat session', async () => {
    chatStoreMocks.deleteSessionAsync.mockResolvedValue(true)
    memoryStoreMocks.deleteMemoriesForSessionAsync.mockResolvedValue(2)
    summaryStoreMocks.deleteSummaryAsync.mockResolvedValue(true)

    const { registerChatStoreHandlers } = await import('./chatStoreHandlers')
    registerChatStoreHandlers()

    const handler = ipcMainMocks.handlers.get('chat-store:delete-session')
    expect(handler).toBeTypeOf('function')

    const result = await handler?.({}, 'session-1')

    expect(result).toBe(true)
    expect(chatStoreMocks.deleteSessionAsync).toHaveBeenCalledWith('session-1')
    expect(memoryStoreMocks.deleteMemoriesForSessionAsync).toHaveBeenCalledWith('session-1')
    expect(summaryStoreMocks.deleteSummaryAsync).toHaveBeenCalledWith('session-1')
    expect(browserWindowMocks.send).toHaveBeenCalledWith('chat-store:changed')
    expect(browserWindowMocks.send).toHaveBeenCalledWith('memory-store:changed')
  })

  it('keeps memory data untouched when chat deletion does not remove a session', async () => {
    chatStoreMocks.deleteSessionAsync.mockResolvedValue(false)

    const { registerChatStoreHandlers } = await import('./chatStoreHandlers')
    registerChatStoreHandlers()

    const handler = ipcMainMocks.handlers.get('chat-store:delete-session')
    const result = await handler?.({}, 'missing-session')

    expect(result).toBe(false)
    expect(memoryStoreMocks.deleteMemoriesForSessionAsync).not.toHaveBeenCalled()
    expect(summaryStoreMocks.deleteSummaryAsync).not.toHaveBeenCalled()
    expect(browserWindowMocks.send).not.toHaveBeenCalled()
  })

  it('does not broadcast memory-store:changed when no linked memory data was removed', async () => {
    chatStoreMocks.deleteSessionAsync.mockResolvedValue(true)
    memoryStoreMocks.deleteMemoriesForSessionAsync.mockResolvedValue(0)
    summaryStoreMocks.deleteSummaryAsync.mockResolvedValue(false)

    const { registerChatStoreHandlers } = await import('./chatStoreHandlers')
    registerChatStoreHandlers()

    const handler = ipcMainMocks.handlers.get('chat-store:delete-session')
    await handler?.({}, 'session-2')

    expect(browserWindowMocks.send).toHaveBeenCalledWith('chat-store:changed')
    expect(browserWindowMocks.send).not.toHaveBeenCalledWith('memory-store:changed')
  })
})
