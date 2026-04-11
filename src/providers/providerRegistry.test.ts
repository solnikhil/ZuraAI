import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OLLAMA_URL,
  getActiveProviderIds,
  getAvailableModelOptions,
  getProviderCredentialError,
  getProviderDefinition,
  getProviderEndpoint,
  getProviderRetryPolicy,
  hasProviderAccess,
  modelSupportsTools,
  normalizeActiveProviderId,
  providerSupportsTools,
  providerUsesNativeSearch,
} from './providerRegistry'

describe('providerRegistry', () => {
  it('includes Fireworks in the active provider surface', () => {
    expect(getActiveProviderIds()).toEqual([
      'openrouter',
      'groq',
      'alibaba',
      'perplexity',
      'ollama',
      'fireworks',
    ])
    expect(normalizeActiveProviderId('fireworks')).toBe('fireworks')
    expect(getProviderDefinition('fireworks').activeSurface).toBe(true)
  })

  it('resolves endpoints and retry policy from the registry', () => {
    expect(getProviderEndpoint('openrouter', 'chatCompletionsUrl')).toContain('/chat/completions')
    expect(getProviderEndpoint('perplexity', 'modelCatalogUrl')).toContain(
      '/api-reference/sonar-post'
    )
    expect(getProviderEndpoint('ollama', 'defaultLocalUrl')).toBe(DEFAULT_OLLAMA_URL)
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
        groq: true,
        alibaba: true,
        perplexity: true,
        ollama: true,
      },
      openRouterApiKey: 'or-key',
      groqApiKey: '',
      alibabaApiKey: 'ali-key',
      perplexityApiKey: 'px-key',
      ollamaUrl: DEFAULT_OLLAMA_URL,
      configuredModels: [{ code: 'openai/gpt-4.1', displayName: 'GPT-4.1', enabled: true }],
      groqModels: [{ code: 'llama-3.1-8b-instant', displayName: 'Llama Instant', enabled: true }],
      alibabaModels: [{ code: 'qwen-max', displayName: 'Qwen Max', enabled: true }],
      perplexityModels: [{ code: 'sonar', displayName: 'Sonar', enabled: true }],
      ollamaModels: [{ code: 'llama3.2', displayName: 'Llama 3.2', enabled: true }],
    }

    expect(hasProviderAccess(settings, 'openrouter')).toBe(true)
    expect(hasProviderAccess(settings, 'groq')).toBe(false)
    expect(getProviderCredentialError(settings, 'groq')).toContain('Groq API key is required')
    expect(providerSupportsTools('perplexity')).toBe(false)
    expect(providerUsesNativeSearch('perplexity')).toBe(true)
    expect(modelSupportsTools('alibaba', 'qwen-max')).toBe(true)
    expect(modelSupportsTools('perplexity', 'sonar')).toBe(false)

    expect(getAvailableModelOptions(settings)).toEqual([
      { id: 'openai/gpt-4.1', provider: 'openrouter', displayName: 'GPT-4.1' },
      { id: 'qwen-max', provider: 'alibaba', displayName: 'Qwen Max' },
      { id: 'sonar', provider: 'perplexity', displayName: 'Sonar' },
      { id: 'llama3.2', provider: 'ollama', displayName: 'Llama 3.2' },
    ])
  })
})
