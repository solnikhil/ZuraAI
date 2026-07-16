import { describe, expect, it } from 'vitest'

import { defaultSettings, type Settings } from '../../../../../contexts/settingsStore'
import { buildProviderRunCapabilities, buildStreamingSettings } from './chatRunConfig'

function settings(overrides: Partial<Settings>): Settings {
  return { ...defaultSettings, ...overrides }
}

describe('chat run configuration', () => {
  it('builds the shared provider settings used by send and regenerate', () => {
    const result = buildStreamingSettings(
      settings({
        modelProvider: 'ollama',
        aiModel: 'local-test-model',
        maxTokens: 321,
        temperature: 0.25,
      })
    )

    expect(result).toMatchObject({
      modelProvider: 'ollama',
      aiModel: 'local-test-model',
      maxTokens: 321,
      temperature: 0.25,
    })
  })

  it('derives OpenRouter reasoning and regeneration image modalities once', () => {
    const result = buildProviderRunCapabilities(
      settings({
        modelProvider: 'openrouter',
        aiModel: 'reasoning-image-test-model',
        configuredModels: [
          {
            code: 'reasoning-image-test-model',
            displayName: 'Reasoning Image Test',
            supportsDeepThinking: true,
            supportsImageGeneration: true,
            outputModalities: ['image', 'text'],
          },
        ],
        openRouterReasoningEffort: { 'reasoning-image-test-model': 'high' },
      }),
      { includeImageModalities: true }
    )

    expect(result.reasoning).toEqual({ enabled: true, effort: 'high' })
    expect(result.modalities).toEqual(['image', 'text'])
  })

  it('uses the explicit DeepSeek reasoning preference', () => {
    const result = buildProviderRunCapabilities(
      settings({
        modelProvider: 'deepseek',
        aiModel: 'reasoning-test-model',
        deepseekReasoning: {
          'reasoning-test-model': { enabled: true, effort: 'medium' },
        },
      })
    )

    expect(result.enableThinking).toBe(true)
    expect(result.reasoningEffort).toBe('medium')
  })

  it('keeps NVIDIA thinking disabled when the user selects none', () => {
    const result = buildProviderRunCapabilities(
      settings({
        modelProvider: 'nvidia',
        aiModel: 'reasoning-test-model',
        nvidiaReasoningEffort: { 'reasoning-test-model': 'none' },
        nvidiaModels: [
          {
            code: 'reasoning-test-model',
            displayName: 'Reasoning Test',
            supportsDeepThinking: true,
          },
        ],
      })
    )

    expect(result.enableThinking).toBe(false)
  })
})
