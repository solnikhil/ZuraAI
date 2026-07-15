import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OLLAMA_URL,
  getActiveProviderIds,
  getAvailableModelOptions,
  getAvailableTitleModelOptions,
  getProviderCredentialError,
  getProviderEndpoint,
  getProviderRetryPolicy,
  hasProviderAccess,
  modelSupportsTools,
  normalizeActiveProviderId,
  resolveProviderForModel,
} from './providerRegistry'

describe('providerRegistry', () => {
  it('includes Fireworks and NVIDIA in the active provider surface', () => {
    expect(getActiveProviderIds()).toEqual([
      'openrouter',
      'codex',
      'groq',
      'alibaba',
      'deepseek',
      'ollama',
      'fireworks',
      'opencode',
      'nvidia',
    ])
    expect(normalizeActiveProviderId('fireworks')).toBe('fireworks')
    expect(normalizeActiveProviderId('nvidia')).toBe('nvidia')
    expect(normalizeActiveProviderId('codex')).toBe('codex')
  })

  it('resolves endpoints and retry policy from the registry', () => {
    expect(getProviderEndpoint('openrouter', 'chatCompletionsUrl')).toContain('/chat/completions')
    expect(getProviderEndpoint('ollama', 'defaultLocalUrl')).toBe(DEFAULT_OLLAMA_URL)
    expect(getProviderEndpoint('nvidia', 'chatCompletionsUrl')).toBe(
      'https://integrate.api.nvidia.com/v1/chat/completions'
    )
    expect(getProviderEndpoint('opencode', 'baseUrl')).toBe('https://opencode.ai/zen/go/v1')
    expect(getProviderEndpoint('opencode', 'chatCompletionsUrl')).toBe(
      'https://opencode.ai/zen/go/v1/chat/completions'
    )
    expect(getProviderRetryPolicy('openrouter')).toMatchObject({
      maxRetries: 3,
      retryableStatusCodes: [429, 502, 503, 529],
    })
    expect(getProviderRetryPolicy('groq').maxRetries).toBe(0)
  })

  it('centralizes provider access, credentials, and model capability checks', () => {
    const settings = {
      providerEnabled: {
        openrouter: true,
        codex: true,
        groq: true,
        alibaba: true,
        deepseek: true,
        ollama: true,
        nvidia: true,
      },
      openRouterApiKey: 'or-key',
      groqApiKey: '',
      alibabaApiKey: 'ali-key',
      deepseekApiKey: 'deepseek-key',
      nvidiaApiKey: 'nvapi-key',
      ollamaUrl: DEFAULT_OLLAMA_URL,
      configuredModels: [{ code: 'openai/gpt-4.1', displayName: 'GPT-4.1', enabled: true }],
      codexModels: [{ code: 'gpt-5.4', displayName: 'GPT-5.4', enabled: true }],
      groqModels: [{ code: 'llama-3.1-8b-instant', displayName: 'Llama Instant', enabled: true }],
      alibabaModels: [{ code: 'qwen-max', displayName: 'Qwen Max', enabled: true }],
      deepseekModels: [
        { code: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash', enabled: true },
      ],
      nvidiaModels: [{ code: 'minimaxai/minimax-m3', displayName: 'MiniMax M3', enabled: true }],
      ollamaModels: [{ code: 'llama3.2', displayName: 'Llama 3.2', enabled: true }],
    }

    expect(hasProviderAccess(settings, 'openrouter')).toBe(true)
    expect(hasProviderAccess(settings, 'codex')).toBe(true)
    expect(hasProviderAccess(settings, 'groq')).toBe(false)
    expect(hasProviderAccess(settings, 'deepseek')).toBe(true)
    expect(hasProviderAccess(settings, 'nvidia')).toBe(true)
    expect(hasProviderAccess({ ...settings, opencodeGoApiKey: 'go-key' }, 'opencode')).toBe(true)
    expect(hasProviderAccess({ ...settings, opencodeGoApiKey: '' }, 'opencode')).toBe(false)
    expect(getProviderCredentialError(settings, 'groq')).toContain('Groq API key is required')
    expect(modelSupportsTools('alibaba', 'qwen-max')).toBe(true)
    expect(modelSupportsTools('nvidia', 'minimaxai/minimax-m3')).toBe(false)
    expect(modelSupportsTools('codex', 'gpt-5.4')).toBe(false)

    expect(getAvailableModelOptions(settings)).toEqual([
      { id: 'openai/gpt-4.1', provider: 'openrouter', displayName: 'GPT-4.1' },
      { id: 'gpt-5.4', provider: 'codex', displayName: 'GPT-5.4' },
      { id: 'qwen-max', provider: 'alibaba', displayName: 'Qwen Max' },
      { id: 'deepseek-v4-flash', provider: 'deepseek', displayName: 'DeepSeek V4 Flash' },
      { id: 'llama3.2', provider: 'ollama', displayName: 'Llama 3.2' },
      { id: 'minimaxai/minimax-m3', provider: 'nvidia', displayName: 'MiniMax M3' },
    ])
  })

  it('builds title-model options and resolves providers from the selected model', () => {
    const settings = {
      openRouterApiKey: 'or-key',
      groqApiKey: 'groq-key',
      ollamaUrl: DEFAULT_OLLAMA_URL,
      configuredModels: [
        {
          code: 'openai/gpt-4.1-mini',
          displayName: 'GPT-4.1 Mini',
          enabled: true,
          outputModalities: ['text'],
        },
        {
          code: 'openai/gpt-image',
          displayName: 'GPT Image',
          enabled: true,
          outputModalities: ['image'],
        },
      ],
      groqModels: [{ code: 'llama-3.1-8b-instant', displayName: 'Llama Instant', enabled: true }],
      ollamaModels: [{ code: 'llama3.2', displayName: 'Llama 3.2', enabled: false }],
    }

    expect(getAvailableTitleModelOptions(settings)).toEqual([
      expect.objectContaining({
        id: 'openai/gpt-4.1-mini',
        provider: 'openrouter',
        displayName: 'GPT-4.1 Mini',
      }),
      expect.objectContaining({
        id: 'llama-3.1-8b-instant',
        provider: 'groq',
        displayName: 'Llama Instant',
      }),
      expect.objectContaining({
        id: 'llama3.2',
        provider: 'ollama',
        displayName: 'Llama 3.2',
      }),
    ])
    expect(resolveProviderForModel(settings, 'llama-3.1-8b-instant')).toEqual(
      expect.objectContaining({
        provider: 'groq',
        id: 'llama-3.1-8b-instant',
      })
    )
    expect(resolveProviderForModel(settings, 'missing-model')).toBeNull()
  })
})
