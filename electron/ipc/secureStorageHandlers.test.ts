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
  getSecureValuePresenceAsync: vi.fn(),
}

vi.mock('electron', () => ({
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

vi.mock('../secureStorage', () => ({
  getSecureValueAsync: secureStorageMocks.getSecureValueAsync,
  setSecureValueAsync: secureStorageMocks.setSecureValueAsync,
  getSecureValuePresenceAsync: secureStorageMocks.getSecureValuePresenceAsync,
}))

describe('registerSecureStorageHandlers', () => {
  beforeEach(() => {
    vi.resetModules()
    ipcMainMocks.handlers.clear()
    ipcMainMocks.handle.mockClear()
    ipcMainMocks.removeHandler.mockClear()
    secureStorageMocks.getSecureValueAsync.mockReset()
    secureStorageMocks.setSecureValueAsync.mockReset()
    secureStorageMocks.getSecureValuePresenceAsync.mockReset()
  })

  it('does not expose secret read or read-all handlers to the renderer', async () => {
    const { registerSecureStorageHandlers } = await import('./secureStorageHandlers')
    registerSecureStorageHandlers()

    expect(ipcMainMocks.handlers.has('secure-storage:get')).toBe(false)
    expect(ipcMainMocks.handlers.has('secure-storage:get-all')).toBe(false)
    expect(secureStorageMocks.getSecureValueAsync).not.toHaveBeenCalled()
  })

  it('returns provider-key presence without decrypting secure values', async () => {
    secureStorageMocks.getSecureValuePresenceAsync.mockResolvedValue({
      openRouterApiKey: true,
      groqApiKey: false,
      tavilyApiKey: true,
      alibabaApiKey: false,
      fireworksApiKey: false,
      nvidiaApiKey: false,
      onlineCompilerApiKey: false,
      brevoApiKey: true,
    })

    const { registerSecureStorageHandlers } = await import('./secureStorageHandlers')
    registerSecureStorageHandlers()

    const handler = ipcMainMocks.handlers.get('secure-storage:get-presence')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.()).resolves.toEqual({
      openRouterApiKey: true,
      groqApiKey: false,
      tavilyApiKey: true,
      alibabaApiKey: false,
      fireworksApiKey: false,
      nvidiaApiKey: false,
      onlineCompilerApiKey: false,
      brevoApiKey: true,
    })

    expect(secureStorageMocks.getSecureValuePresenceAsync).toHaveBeenCalledTimes(1)
    expect(secureStorageMocks.getSecureValueAsync).not.toHaveBeenCalled()
  })
})
