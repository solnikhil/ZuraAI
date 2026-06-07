// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const memoryStoreMocks = vi.hoisted(() => ({
  getAllMemoriesAsync: vi.fn(),
  addMemoryAsync: vi.fn(),
  updateMemoryAsync: vi.fn(),
  deleteMemoryAsync: vi.fn(),
  clearAllMemoriesAsync: vi.fn(),
  searchMemoriesAsync: vi.fn(),
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
      { isDestroyed: () => false, webContents: { send } },
    ]),
  }
})

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: browserWindowMocks.getAllWindows },
  ipcMain: { handle: ipcMainMocks.handle, removeHandler: ipcMainMocks.removeHandler },
}))

vi.mock('../memoryStore', () => memoryStoreMocks)

describe('registerMemoryStoreHandlers', () => {
  beforeEach(() => {
    vi.resetModules()
    ipcMainMocks.handlers.clear()
    Object.values(memoryStoreMocks).forEach((mock) => mock.mockReset())
    browserWindowMocks.send.mockClear()
  })

  it('list passes scope through and calls getAllMemoriesAsync', async () => {
    memoryStoreMocks.getAllMemoriesAsync.mockResolvedValue([])
    const { registerMemoryStoreHandlers } = await import('./memoryStoreHandlers')
    registerMemoryStoreHandlers()

    const handler = ipcMainMocks.handlers.get('memory:list')!
    await handler({}, { type: 'global' })

    expect(memoryStoreMocks.getAllMemoriesAsync).toHaveBeenCalledWith({ type: 'global' })
  })

  it('list ignores unknown scope shapes and falls back to undefined', async () => {
    memoryStoreMocks.getAllMemoriesAsync.mockResolvedValue([])
    const { registerMemoryStoreHandlers } = await import('./memoryStoreHandlers')
    registerMemoryStoreHandlers()

    const handler = ipcMainMocks.handlers.get('memory:list')!
    await handler({}, { type: 'galactic' })

    expect(memoryStoreMocks.getAllMemoriesAsync).toHaveBeenCalledWith(undefined)
  })

  it('add sanitizes payload, calls addMemoryAsync, and broadcasts change', async () => {
    memoryStoreMocks.addMemoryAsync.mockResolvedValue({ id: 'm1' })
    const { registerMemoryStoreHandlers } = await import('./memoryStoreHandlers')
    registerMemoryStoreHandlers()

    const handler = ipcMainMocks.handlers.get('memory:add')!
    const result = await handler({}, {
      content: 'hello',
      source: 'model',
      sessionId: 'chat-1',
      scope: { type: 'project', projectId: 'p1' },
      junk: 'ignored',
    })

    expect(memoryStoreMocks.addMemoryAsync).toHaveBeenCalledWith({
      content: 'hello',
      source: 'model',
      sessionId: 'chat-1',
      scope: { type: 'project', projectId: 'p1' },
    })
    expect(result).toEqual({ id: 'm1' })
    expect(browserWindowMocks.send).toHaveBeenCalledWith('memory-store:changed')
  })

  it('add preserves a valid background origin through sanitization', async () => {
    memoryStoreMocks.addMemoryAsync.mockResolvedValue({ id: 'm2' })
    const { registerMemoryStoreHandlers } = await import('./memoryStoreHandlers')
    registerMemoryStoreHandlers()

    const handler = ipcMainMocks.handlers.get('memory:add')!
    await handler({}, {
      content: 'extracted fact',
      source: 'model',
      sessionId: 'chat-1',
      origin: 'background',
    })

    expect(memoryStoreMocks.addMemoryAsync).toHaveBeenCalledWith({
      content: 'extracted fact',
      source: 'model',
      sessionId: 'chat-1',
      origin: 'background',
    })
  })

  it('add rejects payloads without a string content', async () => {
    const { registerMemoryStoreHandlers } = await import('./memoryStoreHandlers')
    registerMemoryStoreHandlers()
    const handler = ipcMainMocks.handlers.get('memory:add')!
    await expect(handler({}, { content: 123 })).rejects.toThrow(/string/)
    await expect(handler({}, null)).rejects.toThrow(/Invalid memory payload/)
  })

  it('update rejects empty ids and forwards valid patches', async () => {
    memoryStoreMocks.updateMemoryAsync.mockResolvedValue({ id: 'm1', content: 'x' })
    const { registerMemoryStoreHandlers } = await import('./memoryStoreHandlers')
    registerMemoryStoreHandlers()
    const handler = ipcMainMocks.handlers.get('memory:update')!

    await expect(handler({}, '', {})).rejects.toThrow(/id/)

    await handler({}, 'm1', { content: 'updated' })
    expect(memoryStoreMocks.updateMemoryAsync).toHaveBeenCalledWith('m1', { content: 'updated' })
    expect(browserWindowMocks.send).toHaveBeenCalledWith('memory-store:changed')
  })

  it('update returning null does not broadcast', async () => {
    memoryStoreMocks.updateMemoryAsync.mockResolvedValue(null)
    const { registerMemoryStoreHandlers } = await import('./memoryStoreHandlers')
    registerMemoryStoreHandlers()
    const handler = ipcMainMocks.handlers.get('memory:update')!

    await handler({}, 'missing', { content: 'x' })
    expect(browserWindowMocks.send).not.toHaveBeenCalled()
  })

  it('delete rejects empty ids and forwards otherwise', async () => {
    memoryStoreMocks.deleteMemoryAsync.mockResolvedValue(true)
    const { registerMemoryStoreHandlers } = await import('./memoryStoreHandlers')
    registerMemoryStoreHandlers()
    const handler = ipcMainMocks.handlers.get('memory:delete')!

    await expect(handler({}, '   ')).rejects.toThrow(/id/)
    await handler({}, 'm1')
    expect(memoryStoreMocks.deleteMemoryAsync).toHaveBeenCalledWith('m1')
    expect(browserWindowMocks.send).toHaveBeenCalledWith('memory-store:changed')
  })

  it('clear forwards and broadcasts', async () => {
    const { registerMemoryStoreHandlers } = await import('./memoryStoreHandlers')
    registerMemoryStoreHandlers()
    const handler = ipcMainMocks.handlers.get('memory:clear')!

    await handler({})
    expect(memoryStoreMocks.clearAllMemoriesAsync).toHaveBeenCalled()
    expect(browserWindowMocks.send).toHaveBeenCalledWith('memory-store:changed')
  })

  it('search clamps limit, forwards scope, and rejects non-string queries', async () => {
    memoryStoreMocks.searchMemoriesAsync.mockResolvedValue([])
    const { registerMemoryStoreHandlers } = await import('./memoryStoreHandlers')
    registerMemoryStoreHandlers()
    const handler = ipcMainMocks.handlers.get('memory:search')!

    await expect(handler({}, 123)).rejects.toThrow(/query/)

    await handler({}, 'hello', 999, { type: 'global' })
    // Limit is clamped to 50 max.
    expect(memoryStoreMocks.searchMemoriesAsync).toHaveBeenCalledWith('hello', 50, { type: 'global' })

    await handler({}, 'hello')
    // Default limit is 10 when not specified.
    expect(memoryStoreMocks.searchMemoriesAsync).toHaveBeenLastCalledWith('hello', 10, undefined)
  })

  it('unregister removes all handlers', async () => {
    const { registerMemoryStoreHandlers, unregisterMemoryStoreHandlers } = await import(
      './memoryStoreHandlers'
    )
    registerMemoryStoreHandlers()
    unregisterMemoryStoreHandlers()
    expect(ipcMainMocks.handlers.size).toBe(0)
  })
})
