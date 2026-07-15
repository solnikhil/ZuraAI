// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  streamProviderEvents: vi.fn(),
  generateProviderTitleText: vi.fn(),
  streamCodexProviderEvents: vi.fn(),
  generateCodexText: vi.fn(),
  signInToCodex: vi.fn(),
  listCodexModels: vi.fn(),
  getCodexAuthStatus: vi.fn(),
  signOutOfCodex: vi.fn(),
  openExternal: vi.fn(),
  fetchOpenRouterModels: vi.fn(),
  fetchDeepSeekModels: vi.fn(),
  fetchFireworksModels: vi.fn(),
  fetchNvidiaModels: vi.fn(),
  fetchOpencodeModels: vi.fn(),
  fetchAlibabaModels: vi.fn(),
  getSecureValueAsync: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '0.0.6'),
  },
  shell: { openExternal: mocks.openExternal },
}))

vi.mock('./trustedIpc', () => ({
  trustedIpcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      mocks.handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => mocks.handlers.delete(channel)),
  },
}))

vi.mock('../../src/providers/providerRuntime', () => ({
  streamProviderEvents: mocks.streamProviderEvents,
  generateProviderTitleText: mocks.generateProviderTitleText,
}))

vi.mock('../providers/codexProvider', () => ({
  streamCodexProviderEvents: mocks.streamCodexProviderEvents,
  generateCodexText: mocks.generateCodexText,
  listCodexModels: mocks.listCodexModels,
  getCodexAuthStatus: mocks.getCodexAuthStatus,
  signOutOfCodex: mocks.signOutOfCodex,
  signInToCodex: mocks.signInToCodex,
}))

vi.mock('../../src/providers/providerRegistry', () => ({
  normalizeActiveProviderId: (provider: string) => {
    if (
      provider !== 'groq' &&
      provider !== 'codex' &&
      provider !== 'ollama' &&
      provider !== 'alibaba' &&
      provider !== 'openrouter'
    ) {
      throw new Error(`Unknown provider id: ${provider}`)
    }
    return provider
  },
}))

vi.mock('../../src/providers/providerSettingsRegistry', () => ({
  getProviderSettingsDefinition: (provider: string) =>
    provider === 'groq'
      ? { secretKeyField: 'groqApiKey' }
      : provider === 'openrouter'
        ? { secretKeyField: 'openRouterApiKey' }
        : {},
}))

vi.mock('../secureStorage', () => ({
  getSecureValueAsync: mocks.getSecureValueAsync,
}))

vi.mock('../../src/services/openrouterModels', () => ({
  fetchOpenRouterModels: mocks.fetchOpenRouterModels,
}))
vi.mock('../../src/services/deepseek', () => ({ fetchDeepSeekModels: mocks.fetchDeepSeekModels }))
vi.mock('../../src/services/fireworksModels', () => ({
  fetchFireworksModels: mocks.fetchFireworksModels,
}))
vi.mock('../../src/services/nvidiaModels', () => ({ fetchNvidiaModels: mocks.fetchNvidiaModels }))
vi.mock('../../src/services/opencode', () => ({ fetchOpencodeModels: mocks.fetchOpencodeModels }))
vi.mock('../../src/services/alibabaModels', () => ({
  fetchAlibabaModels: mocks.fetchAlibabaModels,
}))

function createSender() {
  const listeners = new Map<string, () => void>()
  return {
    id: 7,
    send: vi.fn(),
    isDestroyed: () => false,
    once: vi.fn((name: string, listener: () => void) => listeners.set(name, listener)),
    removeListener: vi.fn((name: string) => listeners.delete(name)),
  }
}

const baseRequest = {
  requestId: 'request-1',
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  messages: [{ role: 'user', content: 'hello' }],
  temperature: 0.2,
  maxTokens: 128,
  streamResponses: true,
}

describe('provider runtime handlers', () => {
  beforeEach(async () => {
    vi.resetModules()
    mocks.handlers.clear()
    mocks.streamProviderEvents.mockReset()
    mocks.generateProviderTitleText.mockReset()
    mocks.streamCodexProviderEvents.mockReset()
    mocks.generateCodexText.mockReset()
    mocks.signInToCodex.mockReset().mockResolvedValue(undefined)
    mocks.listCodexModels
      .mockReset()
      .mockResolvedValue([{ code: 'gpt-5.4', displayName: 'GPT-5.4', enabled: true }])
    mocks.getCodexAuthStatus.mockReset().mockResolvedValue({ signedIn: true })
    mocks.signOutOfCodex.mockReset().mockResolvedValue(true)
    mocks.openExternal.mockReset().mockResolvedValue(undefined)
    mocks.fetchOpenRouterModels.mockReset()
    mocks.getSecureValueAsync.mockReset().mockResolvedValue('main-only-key')
    const { registerProviderRuntimeHandlers } = await import('./providerRuntimeHandlers')
    registerProviderRuntimeHandlers()
  })

  it('resolves credentials in main and streams sanitized events to the requesting renderer', async () => {
    mocks.streamProviderEvents.mockImplementation(async function* () {
      yield { type: 'text-delta', delta: 'hello' }
      yield { type: 'finish', finishReason: 'stop' }
    })
    const sender = createSender()
    const start = mocks.handlers.get('provider-runtime:start')!

    await expect(start({ sender }, baseRequest)).resolves.toBe(true)
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledTimes(3))

    expect(mocks.getSecureValueAsync).toHaveBeenCalledWith('groqApiKey')
    expect(mocks.streamProviderEvents).toHaveBeenCalledWith(
      expect.objectContaining({ groqApiKey: 'main-only-key' }),
      expect.objectContaining({ provider: 'groq', signal: expect.any(AbortSignal) })
    )
    expect(sender.send.mock.calls.map((call) => call[1]?.type)).toEqual(['event', 'event', 'done'])
    expect(JSON.stringify(sender.send.mock.calls)).not.toContain('main-only-key')
  })

  it('cancels only a request owned by the calling renderer', async () => {
    mocks.streamProviderEvents.mockImplementation(async function* (_settings, request) {
      yield* []
      await new Promise<void>((resolve) =>
        request.signal.addEventListener('abort', () => resolve())
      )
      throw new DOMException('aborted', 'AbortError')
    })
    const sender = createSender()
    const start = mocks.handlers.get('provider-runtime:start')!
    const cancel = mocks.handlers.get('provider-runtime:cancel')!

    await start({ sender }, baseRequest)
    await vi.waitFor(() => expect(mocks.streamProviderEvents).toHaveBeenCalled())
    expect(cancel({ sender: { ...sender, id: 8 } }, 'request-1')).toBe(false)
    expect(cancel({ sender }, 'request-1')).toBe(true)
    await vi.waitFor(() =>
      expect(sender.send).toHaveBeenCalledWith(
        'provider-runtime:event',
        expect.objectContaining({ requestId: 'request-1', type: 'error' })
      )
    )
  })

  it('rejects non-loopback Ollama URLs instead of exposing a broad HTTP proxy', async () => {
    const sender = createSender()
    const start = mocks.handlers.get('provider-runtime:start')!
    await expect(
      start(
        { sender },
        {
          ...baseRequest,
          provider: 'ollama',
          ollamaUrl: 'http://169.254.169.254/latest/meta-data',
        }
      )
    ).rejects.toThrow('restricted to loopback')
    expect(mocks.streamProviderEvents).not.toHaveBeenCalled()
  })

  it('rejects unknown Alibaba regions', async () => {
    const sender = createSender()
    const start = mocks.handlers.get('provider-runtime:start')!
    await expect(
      start({ sender }, { ...baseRequest, provider: 'alibaba', alibabaRegion: 'made-up-region' })
    ).rejects.toThrow('Alibaba region is invalid')
  })

  it('generates lightweight text in main without returning the credential', async () => {
    mocks.generateProviderTitleText.mockResolvedValue('Short title')
    const sender = createSender()
    const generate = mocks.handlers.get('provider-runtime:generate')!

    await expect(
      generate(
        { sender },
        {
          requestId: 'title-1',
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
          prompt: 'Create a title',
          maxTokens: 32,
        }
      )
    ).resolves.toBe('Short title')

    expect(mocks.generateProviderTitleText).toHaveBeenCalledWith(
      expect.objectContaining({ groqApiKey: 'main-only-key' }),
      'groq',
      'llama-3.3-70b-versatile',
      'Create a title',
      expect.objectContaining({ signal: expect.any(AbortSignal), maxTokens: 32 })
    )
  })

  it('loads authenticated catalogs in main and returns only model metadata', async () => {
    mocks.fetchOpenRouterModels.mockResolvedValue([{ id: 'model-1' }])
    const sender = createSender()
    const listModels = mocks.handlers.get('provider-runtime:list-models')!

    await expect(
      listModels({ sender }, { requestId: 'catalog-1', provider: 'openrouter' })
    ).resolves.toEqual([{ id: 'model-1' }])
    expect(mocks.fetchOpenRouterModels).toHaveBeenCalledWith(
      'main-only-key',
      expect.any(AbortSignal)
    )
  })

  it('streams Codex through the main-only OAuth provider without loading a renderer secret', async () => {
    mocks.streamCodexProviderEvents.mockImplementation(async function* () {
      yield { type: 'text-delta', delta: 'Hello from Codex' }
      yield { type: 'finish', finishReason: 'stop' }
    })
    const sender = createSender()
    const start = mocks.handlers.get('provider-runtime:start')!

    await expect(
      start(
        { sender },
        {
          ...baseRequest,
          requestId: 'codex-stream',
          provider: 'codex',
          model: 'gpt-5.4',
        }
      )
    ).resolves.toBe(true)
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledTimes(3))

    expect(mocks.streamCodexProviderEvents).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'codex', model: 'gpt-5.4' }),
      { appVersion: '0.0.6' }
    )
    expect(mocks.streamProviderEvents).not.toHaveBeenCalled()
    expect(mocks.getSecureValueAsync).not.toHaveBeenCalled()
  })

  it('uses Codex generation and discovers account-accessible models in main', async () => {
    mocks.generateCodexText.mockResolvedValue('Codex title')
    const sender = createSender()
    const generate = mocks.handlers.get('provider-runtime:generate')!
    const listModels = mocks.handlers.get('provider-runtime:list-models')!

    await expect(
      generate(
        { sender },
        {
          requestId: 'codex-generate',
          provider: 'codex',
          model: 'gpt-5.4',
          prompt: 'Create a title',
        }
      )
    ).resolves.toBe('Codex title')
    await expect(
      listModels({ sender }, { requestId: 'codex-models', provider: 'codex' })
    ).resolves.toEqual([{ code: 'gpt-5.4', displayName: 'GPT-5.4', enabled: true }])
    expect(mocks.listCodexModels).toHaveBeenCalledWith(expect.any(AbortSignal), {
      appVersion: '0.0.6',
    })
    expect(mocks.generateProviderTitleText).not.toHaveBeenCalled()
  })

  it('owns Codex OAuth sign-in, status, and sign-out in main', async () => {
    const signIn = mocks.handlers.get('provider-runtime:codex-sign-in')!
    const status = mocks.handlers.get('provider-runtime:codex-auth-status')!
    const signOut = mocks.handlers.get('provider-runtime:codex-sign-out')!

    await expect(signIn({ sender: createSender() })).resolves.toBe(true)
    await expect(status({ sender: createSender() })).resolves.toEqual({ signedIn: true })
    await expect(signOut({ sender: createSender() })).resolves.toBe(true)

    expect(mocks.signInToCodex).toHaveBeenCalledWith({ openExternal: expect.any(Function) })
    expect(mocks.getCodexAuthStatus).toHaveBeenCalledOnce()
    expect(mocks.signOutOfCodex).toHaveBeenCalledOnce()
  })
})
