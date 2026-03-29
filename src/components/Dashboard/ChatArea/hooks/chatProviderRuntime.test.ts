import { describe, expect, it } from 'vitest'
import {
  getAvailableModelOptions,
  getProviderCredentialError,
  resolveChatProvider,
} from './chatProviderRuntime'

describe('chatProviderRuntime', () => {
  it('defaults unknown providers to openrouter', () => {
    expect(resolveChatProvider('unknown-provider')).toBe('openrouter')
  })

  it('returns credential errors through the shared provider registry', () => {
    expect(
      getProviderCredentialError({
        modelProvider: 'alibaba',
        alibabaApiKey: '',
        fireworksApiKey: '',
        openRouterApiKey: '',
      })
    ).toContain('Alibaba API key is required')

    expect(
      getProviderCredentialError({
        modelProvider: 'openrouter',
        alibabaApiKey: '',
        openRouterApiKey: '',
      })
    ).toContain('OpenRouter API key is required')

    expect(
      getProviderCredentialError({
        modelProvider: 'groq',
        alibabaApiKey: '',
        groqApiKey: '',
        openRouterApiKey: '',
      })
    ).toContain('Groq API key is required')
  })

  it('only includes active providers in switch-model options', () => {
    const models = getAvailableModelOptions({
      providerEnabled: {
        openrouter: true,
      },
      openRouterApiKey: 'or-key',
      configuredModels: [
        { code: 'openrouter-a', displayName: 'OpenRouter A', enabled: true },
        { code: 'openrouter-b', displayName: 'OpenRouter B', enabled: false },
      ],
    })

    expect(models).toEqual([
      { id: 'openrouter-a', provider: 'openrouter', displayName: 'OpenRouter A' },
    ])
  })
})
