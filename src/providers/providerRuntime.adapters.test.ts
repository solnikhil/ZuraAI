import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateGroqCompletion: vi.fn(),
  streamGroqCompletion: vi.fn(),
  generateFireworksCompletion: vi.fn(),
  streamFireworksCompletion: vi.fn(),
  generateOllamaCompletion: vi.fn(),
  streamOllamaCompletion: vi.fn(),
  generateOpenRouterCompletion: vi.fn(),
  streamOpenRouterCompletion: vi.fn(),
  generateAlibabaCompletion: vi.fn(),
  streamAlibabaCompletion: vi.fn(),
  generateDeepSeekCompletion: vi.fn(),
  streamDeepSeekCompletion: vi.fn(),
  generateNvidiaCompletion: vi.fn(),
  streamNvidiaCompletion: vi.fn(),
  generateOpencodeCompletion: vi.fn(),
  streamOpencodeCompletion: vi.fn(),
}))

vi.mock('../services/groq', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/groq')>()),
  generateGroqCompletion: mocks.generateGroqCompletion,
  streamGroqCompletion: mocks.streamGroqCompletion,
}))

vi.mock('../services/fireworks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/fireworks')>()),
  generateFireworksCompletion: mocks.generateFireworksCompletion,
  streamFireworksCompletion: mocks.streamFireworksCompletion,
}))

vi.mock('../services/ollama', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/ollama')>()),
  generateOllamaCompletion: mocks.generateOllamaCompletion,
  streamOllamaCompletion: mocks.streamOllamaCompletion,
}))

vi.mock('../services/openrouter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/openrouter')>()),
  generateOpenRouterCompletion: mocks.generateOpenRouterCompletion,
  streamOpenRouterCompletion: mocks.streamOpenRouterCompletion,
}))

vi.mock('../services/alibaba', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/alibaba')>()),
  generateAlibabaCompletion: mocks.generateAlibabaCompletion,
  streamAlibabaCompletion: mocks.streamAlibabaCompletion,
}))

vi.mock('../services/deepseek', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/deepseek')>()),
  generateDeepSeekCompletion: mocks.generateDeepSeekCompletion,
  streamDeepSeekCompletion: mocks.streamDeepSeekCompletion,
}))

vi.mock('../services/nvidia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/nvidia')>()),
  generateNvidiaCompletion: mocks.generateNvidiaCompletion,
  streamNvidiaCompletion: mocks.streamNvidiaCompletion,
}))

vi.mock('../services/opencode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/opencode')>()),
  generateOpencodeCompletion: mocks.generateOpencodeCompletion,
  streamOpencodeCompletion: mocks.streamOpencodeCompletion,
}))

import {
  generateProviderTitleText,
  providerRuntimeAdapters,
  streamProviderEvents,
} from './providerRuntime'
import type { ActiveProviderId } from './providerTypes'

const message = { role: 'user' as const, content: 'hello' }

async function collect(provider: ActiveProviderId, settings: Record<string, unknown>) {
  return Array.fromAsync(
    streamProviderEvents(
      { temperature: 0.25, maxTokens: 321, streamResponses: false, ...settings },
      {
        provider,
        model: provider === 'openrouter' ? 'openrouter/acme/model' : 'acme/model',
        messages: [message],
        temperature: 0.25,
        maxTokens: 321,
        streamResponses: provider === 'openrouter' ? true : false,
      }
    )
  )
}

describe('provider runtime adapter registry', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.generateGroqCompletion.mockResolvedValue({
      choices: [{ message: { content: 'groq' }, finish_reason: 'stop' }],
    })
    mocks.generateFireworksCompletion.mockResolvedValue({
      choices: [{ message: { content: 'fireworks' }, finish_reason: 'stop' }],
    })
    mocks.generateOllamaCompletion.mockResolvedValue({
      message: { content: 'ollama' },
      done: true,
    })
    mocks.generateOpenRouterCompletion.mockResolvedValue({
      choices: [{ message: { content: 'openrouter' }, finish_reason: 'stop' }],
    })
    mocks.generateAlibabaCompletion.mockResolvedValue({
      choices: [{ message: { content: 'alibaba' }, finish_reason: 'stop' }],
    })
    mocks.generateDeepSeekCompletion.mockResolvedValue({
      choices: [{ message: { content: 'deepseek' }, finish_reason: 'stop' }],
    })
    mocks.generateNvidiaCompletion.mockResolvedValue({
      choices: [{ message: { content: 'nvidia' }, finish_reason: 'stop' }],
    })
    mocks.generateOpencodeCompletion.mockResolvedValue({
      choices: [{ message: { content: 'opencode' }, finish_reason: 'stop' }],
    })
    mocks.streamOpenRouterCompletion.mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'openrouter' }, finish_reason: 'stop' }] }
    })
    ;[
      mocks.streamGroqCompletion,
      mocks.streamFireworksCompletion,
      mocks.streamAlibabaCompletion,
      mocks.streamDeepSeekCompletion,
      mocks.streamNvidiaCompletion,
      mocks.streamOpencodeCompletion,
    ].forEach((stream) =>
      stream.mockImplementation(async function* () {
        yield { choices: [{ delta: { content: 'chunk' }, finish_reason: 'stop' }] }
      })
    )
    mocks.streamOllamaCompletion.mockImplementation(async function* () {
      yield { message: { content: 'chunk' }, done: true }
    })
  })

  it('has one adapter with both paths for every active provider', () => {
    expect(Object.keys(providerRuntimeAdapters).sort()).toEqual(
      [
        'alibaba',
        'codex',
        'deepseek',
        'fireworks',
        'groq',
        'nvidia',
        'ollama',
        'opencode',
        'openrouter',
      ].sort()
    )

    for (const [provider, adapter] of Object.entries(providerRuntimeAdapters)) {
      expect(adapter.provider).toBe(provider)
      expect(adapter.generateTitle).toBeTypeOf('function')
      expect(adapter.stream).toBeTypeOf('function')
    }
  })

  it.each([
    ['groq', { groqApiKey: 'groq-key' }, mocks.generateGroqCompletion, 'max_tokens'],
    [
      'fireworks',
      { fireworksApiKey: 'fireworks-key' },
      mocks.generateFireworksCompletion,
      'max_tokens',
    ],
    [
      'ollama',
      { ollamaUrl: 'http://127.0.0.1:11434' },
      mocks.generateOllamaCompletion,
      'num_predict',
    ],
    ['alibaba', { alibabaApiKey: 'alibaba-key' }, mocks.generateAlibabaCompletion, 'max_tokens'],
    [
      'deepseek',
      { deepseekApiKey: 'deepseek-key' },
      mocks.generateDeepSeekCompletion,
      'max_tokens',
    ],
    ['nvidia', { nvidiaApiKey: 'nvidia-key' }, mocks.generateNvidiaCompletion, 'max_tokens'],
    [
      'opencode',
      { opencodeGoApiKey: 'opencode-key' },
      mocks.generateOpencodeCompletion,
      'max_tokens',
    ],
    [
      'openrouter',
      { openRouterApiKey: 'router-key' },
      mocks.generateOpenRouterCompletion,
      'max_tokens',
    ],
  ] as const)(
    'shapes %s lightweight requests through its adapter',
    async (provider, settings, generate, maxTokenField) => {
      await generateProviderTitleText(settings, provider, `${provider}/acme/model`, 'title me', {
        maxTokens: 123,
      })

      expect(generate).toHaveBeenCalledOnce()
      const [, model, messages, options] = generate.mock.calls[0]!
      expect(model).toBe(provider === 'openrouter' ? 'acme/model' : `${provider}/acme/model`)
      expect(messages).toEqual([{ role: 'user', content: 'title me' }])
      expect(options).toMatchObject({ [maxTokenField]: 123 })
    }
  )

  it.each([
    ['groq', { groqApiKey: 'groq-key' }, mocks.generateGroqCompletion, 'max_tokens'],
    [
      'fireworks',
      { fireworksApiKey: 'fireworks-key' },
      mocks.generateFireworksCompletion,
      'max_tokens',
    ],
    [
      'ollama',
      { ollamaUrl: 'http://127.0.0.1:11434' },
      mocks.generateOllamaCompletion,
      'num_predict',
    ],
    ['alibaba', { alibabaApiKey: 'alibaba-key' }, mocks.generateAlibabaCompletion, 'max_tokens'],
    [
      'deepseek',
      { deepseekApiKey: 'deepseek-key' },
      mocks.generateDeepSeekCompletion,
      'max_tokens',
    ],
    ['nvidia', { nvidiaApiKey: 'nvidia-key' }, mocks.generateNvidiaCompletion, 'max_tokens'],
    [
      'opencode',
      { opencodeGoApiKey: 'opencode-key' },
      mocks.generateOpencodeCompletion,
      'max_tokens',
    ],
  ] as const)(
    'shapes %s non-stream chat requests through the same adapter',
    async (provider, settings, generate, maxTokenField) => {
      await collect(provider, settings)

      const [, model, messages, options] = generate.mock.calls.at(-1)!
      expect(model).toBe('acme/model')
      expect(messages).toEqual([message])
      expect(options).toMatchObject({ temperature: 0.25, [maxTokenField]: 321 })
    }
  )

  it('shapes OpenRouter streaming requests and removes its display prefix', async () => {
    await collect('openrouter', { openRouterApiKey: 'router-key' })

    expect(mocks.streamOpenRouterCompletion).toHaveBeenCalledWith(
      'router-key',
      'acme/model',
      [message],
      expect.objectContaining({ temperature: 0.25, maxTokens: 321 })
    )
  })

  it.each([
    ['groq', { groqApiKey: 'key' }, mocks.streamGroqCompletion],
    ['fireworks', { fireworksApiKey: 'key' }, mocks.streamFireworksCompletion],
    ['ollama', { ollamaUrl: 'http://127.0.0.1:11434' }, mocks.streamOllamaCompletion],
    ['alibaba', { alibabaApiKey: 'key' }, mocks.streamAlibabaCompletion],
    ['deepseek', { deepseekApiKey: 'key' }, mocks.streamDeepSeekCompletion],
    ['nvidia', { nvidiaApiKey: 'key' }, mocks.streamNvidiaCompletion],
    ['opencode', { opencodeGoApiKey: 'key' }, mocks.streamOpencodeCompletion],
  ] as const)('owns the %s streaming transport path', async (provider, settings, stream) => {
    const events = await Array.fromAsync(
      streamProviderEvents(
        { streamResponses: true, ...settings },
        { provider, model: 'acme/model', messages: [message], streamResponses: true }
      )
    )
    expect(stream).toHaveBeenCalledOnce()
    expect(events).toContainEqual({ type: 'text-delta', delta: 'chunk' })
    expect(events).toContainEqual({ type: 'finish', finishReason: 'stop' })
  })

  it('keeps Codex unavailable outside the Electron main-process bridge', async () => {
    await expect(generateProviderTitleText({}, 'codex', 'gpt-5', 'title')).rejects.toThrow(
      'main-process runtime'
    )
    await expect(
      Array.fromAsync(
        streamProviderEvents(
          { streamResponses: true },
          { provider: 'codex', model: 'gpt-5', messages: [message] }
        )
      )
    ).rejects.toMatchObject({ message: expect.stringContaining('main-process runtime') })
  })
})
