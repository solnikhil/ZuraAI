import { describe, it, expect, vi, beforeEach } from 'vitest'

const ipcMainMocks = {
  handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    ipcMainMocks.handlers.set(channel, handler)
  }),
  removeHandler: vi.fn(),
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}

const secureStorageMocks = {
  getSecureValueAsync: vi.fn(),
  setSecureValueAsync: vi.fn(),
}

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMainMocks.handle,
    removeHandler: ipcMainMocks.removeHandler,
  },
}))

vi.mock('../secureStorage', () => ({
  getSecureValueAsync: secureStorageMocks.getSecureValueAsync,
  setSecureValueAsync: secureStorageMocks.setSecureValueAsync,
}))

describe('registerSecureStorageHandlers', () => {
  beforeEach(() => {
    vi.resetModules()
    ipcMainMocks.handlers.clear()
    ipcMainMocks.handle.mockClear()
    ipcMainMocks.removeHandler.mockClear()
    secureStorageMocks.getSecureValueAsync.mockReset()
    secureStorageMocks.setSecureValueAsync.mockReset()
  })

  it('returns only the provider-key allowlist from secure-storage:get-all', async () => {
    secureStorageMocks.getSecureValueAsync
      .mockResolvedValueOnce('or-key')
      .mockResolvedValueOnce('pplx-key')
      .mockResolvedValueOnce('groq-key')
      .mockResolvedValueOnce('tavily-key')
      .mockResolvedValueOnce('alibaba-key')
      .mockResolvedValueOnce('fireworks-key')
      .mockResolvedValueOnce('oc-key')

    const { registerSecureStorageHandlers } = await import('./secureStorageHandlers')
    registerSecureStorageHandlers()

    const handler = ipcMainMocks.handlers.get('secure-storage:get-all')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.()).resolves.toEqual({
      openRouterApiKey: 'or-key',
      perplexityApiKey: 'pplx-key',
      groqApiKey: 'groq-key',
      tavilyApiKey: 'tavily-key',
      alibabaApiKey: 'alibaba-key',
      fireworksApiKey: 'fireworks-key',
      onlineCompilerApiKey: 'oc-key',
    })

    expect(secureStorageMocks.getSecureValueAsync).toHaveBeenCalledTimes(7)
    expect(secureStorageMocks.getSecureValueAsync).not.toHaveBeenCalledWith('mcp.server.demo.token')
  })
})
