// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcMocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    ipcMocks.handlers.set(channel, handler)
  }),
  removeHandler: vi.fn((channel: string) => {
    ipcMocks.handlers.delete(channel)
  }),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMocks.handle,
    removeHandler: ipcMocks.removeHandler,
  },
}))

describe('provider proxy handlers', () => {
  beforeEach(async () => {
    vi.resetModules()
    ipcMocks.handlers.clear()
    ipcMocks.handle.mockClear()
    ipcMocks.removeHandler.mockClear()
    vi.restoreAllMocks()

    const { registerProviderProxyHandlers } = await import('./providerProxyHandlers')
    registerProviderProxyHandlers()
  })

  it('proxies allowlisted OpenCode Go requests through main fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"data":[]}', {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      })
    )
    const handler = ipcMocks.handlers.get('provider-proxy:opencode-fetch')

    await expect(
      handler?.({}, {
        url: 'https://opencode.ai/zen/go/v1/models',
        method: 'GET',
        headers: {
          Authorization: 'Bearer test',
          'X-Not-Allowed': 'drop-me',
        },
      })
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        status: 200,
        body: '{"data":[]}',
      })
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://opencode.ai/zen/go/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer test' },
      })
    )
  })

  it('rejects URLs outside the OpenCode Go API path', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const handler = ipcMocks.handlers.get('provider-proxy:opencode-fetch')

    await expect(
      handler?.({}, {
        url: 'https://example.com/zen/go/v1/models',
        method: 'GET',
      })
    ).rejects.toThrow('OpenCode Go proxy only allows')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
