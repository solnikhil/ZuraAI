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
  const externalSend = vi.fn()
  return {
    send,
    externalSend,
    getAllWindows: vi.fn(() => [
      {
        isDestroyed: () => false,
        webContents: { id: 1, send },
      },
      {
        isDestroyed: () => false,
        webContents: { id: 2, send: externalSend },
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

vi.mock('./trustedIpc', () => ({
  trustedIpcMain: {
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
  const session = {
    id: 'session-1',
    title: 'Test session',
    messages: [],
    createdAt: 1,
    updatedAt: 1,
  }
  const folder = { id: 'folder-1', name: 'Test folder', order: 0, createdAt: 1 }

  beforeEach(() => {
    vi.resetModules()
    ipcMainMocks.handlers.clear()
    ipcMainMocks.handle.mockClear()
    ipcMainMocks.removeHandler.mockClear()
    browserWindowMocks.getAllWindows.mockClear()
    browserWindowMocks.send.mockClear()
    browserWindowMocks.externalSend.mockClear()
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

    const result = await handler?.({ sender: { id: 1 } }, [session])

    expect(chatStoreMocks.saveAllSessionsAsync).toHaveBeenCalledWith([session])
    expect(browserWindowMocks.getAllWindows).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ changed: true, revision: 1 })
    expect(browserWindowMocks.send).toHaveBeenCalledWith('chat-store:changed', {
      revision: 1,
      source: 'self',
    })
    expect(browserWindowMocks.externalSend).toHaveBeenCalledWith('chat-store:changed', {
      revision: 1,
      source: 'external',
    })
  })

  it('does not acknowledge renderer migration when durable persistence fails', async () => {
    chatStoreMocks.migrateFromLocalStorage.mockRejectedValue(new Error('disk unavailable'))
    const { registerChatStoreHandlers } = await import('./chatStoreHandlers')
    registerChatStoreHandlers()

    const handler = ipcMainMocks.handlers.get('chat-store:migrate')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({ sender: { id: 1 } }, [session])).rejects.toThrow('disk unavailable')
    expect(chatStoreMocks.migrateFromLocalStorage).toHaveBeenCalledWith([session])
    expect(browserWindowMocks.send).not.toHaveBeenCalled()

    const revisionHandler = ipcMainMocks.handlers.get('chat-store:get-revision')
    await expect(revisionHandler?.({})).resolves.toBe(0)
  })

  it('assigns consecutive revisions to batched durable writes', async () => {
    const { registerChatStoreHandlers } = await import('./chatStoreHandlers')
    registerChatStoreHandlers()

    const saveSession = ipcMainMocks.handlers.get('chat-store:save-session')
    const saveIndex = ipcMainMocks.handlers.get('chat-store:save-index')
    const index = { sessions: [], folders: [], version: 4 }

    await expect(saveSession?.({ sender: { id: 1 } }, session)).resolves.toEqual({
      changed: true,
      revision: 1,
    })
    await expect(saveIndex?.({ sender: { id: 1 } }, index)).resolves.toEqual({
      changed: true,
      revision: 2,
    })
    expect(browserWindowMocks.externalSend).toHaveBeenLastCalledWith('chat-store:changed', {
      revision: 2,
      source: 'external',
    })
  })

  it('broadcasts chat-store:changed after saving folders', async () => {
    const { registerChatStoreHandlers } = await import('./chatStoreHandlers')
    registerChatStoreHandlers()

    const handler = ipcMainMocks.handlers.get('chat-store:save-folders')
    expect(handler).toBeTypeOf('function')

    await handler?.({ sender: { id: 1 } }, [folder])

    expect(chatStoreMocks.saveFoldersAsync).toHaveBeenCalledWith([folder])
    expect(browserWindowMocks.send).toHaveBeenCalledWith('chat-store:changed', {
      revision: 1,
      source: 'self',
    })
  })

  it('deletes linked memory data when deleting a chat session', async () => {
    chatStoreMocks.deleteSessionAsync.mockResolvedValue(true)
    memoryStoreMocks.deleteMemoriesForSessionAsync.mockResolvedValue(2)
    summaryStoreMocks.deleteSummaryAsync.mockResolvedValue(true)

    const { registerChatStoreHandlers } = await import('./chatStoreHandlers')
    registerChatStoreHandlers()

    const handler = ipcMainMocks.handlers.get('chat-store:delete-session')
    expect(handler).toBeTypeOf('function')

    const result = await handler?.({ sender: { id: 1 } }, 'session-1')

    expect(result).toEqual({ changed: true, revision: 1 })
    expect(chatStoreMocks.deleteSessionAsync).toHaveBeenCalledWith('session-1')
    expect(memoryStoreMocks.deleteMemoriesForSessionAsync).toHaveBeenCalledWith('session-1')
    expect(summaryStoreMocks.deleteSummaryAsync).toHaveBeenCalledWith('session-1')
    expect(browserWindowMocks.send).toHaveBeenCalledWith('chat-store:changed', {
      revision: 1,
      source: 'self',
    })
    expect(browserWindowMocks.send).toHaveBeenCalledWith('memory-store:changed')
  })

  it('keeps memory data untouched when chat deletion does not remove a session', async () => {
    chatStoreMocks.deleteSessionAsync.mockResolvedValue(false)

    const { registerChatStoreHandlers } = await import('./chatStoreHandlers')
    registerChatStoreHandlers()

    const handler = ipcMainMocks.handlers.get('chat-store:delete-session')
    const result = await handler?.({ sender: { id: 1 } }, 'missing-session')

    expect(result).toEqual({ changed: false, revision: 0 })
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
    await handler?.({ sender: { id: 1 } }, 'session-2')

    expect(browserWindowMocks.send).toHaveBeenCalledWith('chat-store:changed', {
      revision: 1,
      source: 'self',
    })
    expect(browserWindowMocks.send).not.toHaveBeenCalledWith('memory-store:changed')
  })

  it('rejects malformed session payloads before persistence', async () => {
    const { registerChatStoreHandlers } = await import('./chatStoreHandlers')
    registerChatStoreHandlers()

    const handler = ipcMainMocks.handlers.get('chat-store:save-session')
    await expect(handler?.({}, { id: 'session-1' })).rejects.toThrow('session.title')
    expect(chatStoreMocks.saveSessionAsync).not.toHaveBeenCalled()
  })

  it('rejects out-of-range session window limits', async () => {
    const { registerChatStoreHandlers } = await import('./chatStoreHandlers')
    registerChatStoreHandlers()

    const handler = ipcMainMocks.handlers.get('chat-store:get-session')
    await expect(handler?.({}, 'session-1', { limit: 50_000 })).rejects.toThrow('options.limit')
    expect(chatStoreMocks.getSessionAsync).not.toHaveBeenCalled()
  })

  it('rejects malformed folder payloads before persistence', async () => {
    const { registerChatStoreHandlers } = await import('./chatStoreHandlers')
    registerChatStoreHandlers()

    const handler = ipcMainMocks.handlers.get('chat-store:save-folders')
    await expect(handler?.({}, [{ id: 'folder-1' }])).rejects.toThrow('folders[0].name')
    expect(chatStoreMocks.saveFoldersAsync).not.toHaveBeenCalled()
  })
})
