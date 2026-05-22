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
})
