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

  it('returns only the provider-key allowlist from secure-storage:get-all', async () => {
    const storedValues: Record<string, string> = {
      openRouterApiKey: 'or-key',
      perplexityApiKey: 'pplx-key',
      groqApiKey: 'groq-key',
      tavilyApiKey: 'tavily-key',
      alibabaApiKey: 'alibaba-key',
      fireworksApiKey: 'fireworks-key',
      nvidiaApiKey: 'nvidia-key',
      deepseekApiKey: 'deepseek-key',
      opencodeGoApiKey: 'opencode-key',
      onlineCompilerApiKey: 'oc-key',
      brevoApiKey: 'brevo-key',
    }

    secureStorageMocks.getSecureValueAsync.mockImplementation((key: string) =>
      Promise.resolve(storedValues[key])
    )

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
      nvidiaApiKey: 'nvidia-key',
      deepseekApiKey: 'deepseek-key',
      opencodeGoApiKey: 'opencode-key',
      onlineCompilerApiKey: 'oc-key',
      brevoApiKey: 'brevo-key',
    })

    expect(secureStorageMocks.getSecureValueAsync).toHaveBeenCalledTimes(11)
    expect(secureStorageMocks.getSecureValueAsync).not.toHaveBeenCalledWith('mcp.server.demo.token')
  })

  it('returns provider-key presence without decrypting secure values', async () => {
    secureStorageMocks.getSecureValuePresenceAsync.mockResolvedValue({
      openRouterApiKey: true,
      perplexityApiKey: false,
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
      perplexityApiKey: false,
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
