import { describe, expect, it } from 'vitest'
import {
  getLogoVisibleProviderIds,
  getPickerVisibleProviders,
  getProviderDashboardUrl,
  getProviderEnabledDefaults,
  getProviderModelListField,
  getProviderSecretFields,
  getSettingsVisibleProviders,
} from './providerSettingsRegistry'

describe('providerSettingsRegistry', () => {
  it('centralizes provider secret fields and model list fields', () => {
    expect(getProviderSecretFields()).toEqual([
      'openRouterApiKey',
      'groqApiKey',
      'alibabaApiKey',
      'deepseekApiKey',
      'fireworksApiKey',
      'nvidiaApiKey',
      'opencodeGoApiKey',
    ])

    expect(getProviderModelListField('openrouter')).toBe('configuredModels')
    expect(getProviderModelListField('deepseek')).toBe('deepseekModels')
    expect(getProviderModelListField('nvidia')).toBe('nvidiaModels')
    expect(getProviderModelListField('ollama')).toBe('ollamaModels')
  })

  it('exposes dashboard links and default enablement from one registry', () => {
    expect(getProviderDashboardUrl('deepseek')).toBe('https://platform.deepseek.com/api_keys')
    expect(getProviderEnabledDefaults()).toEqual({
      alibaba: true,
      deepseek: true,
      fireworks: true,
      groq: true,
      nvidia: true,
      ollama: true,
      openrouter: true,
      opencode: true,
    })
  })

  it('keeps settings, picker, and logo provider coverage aligned', () => {
    expect(getSettingsVisibleProviders().map((provider) => provider.id)).toEqual([
      'openrouter',
      'groq',
      'alibaba',
      'deepseek',
      'ollama',
      'fireworks',
      'nvidia',
      'opencode',
    ])

    expect(getPickerVisibleProviders().map((provider) => provider.id)).toEqual([
      'openrouter',
      'deepseek',
      'groq',
      'fireworks',
      'alibaba',
      'ollama',
      'nvidia',
      'opencode',
    ])

    expect(getLogoVisibleProviderIds()).toEqual([
      'openrouter',
      'groq',
      'alibaba',
      'deepseek',
      'ollama',
      'fireworks',
      'nvidia',
      'opencode',
    ])
  })
})
