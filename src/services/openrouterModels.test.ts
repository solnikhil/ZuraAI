import { describe, expect, it } from 'vitest'

import {
  inferOpenRouterSupportsDeepThinking,
  mapOpenRouterModelToConfiguredModel,
} from './openrouterModels'

describe('openrouterModels', () => {
  it('maps reasoning parameters to deep thinking support', () => {
    const mapped = mapOpenRouterModelToConfiguredModel({
      id: 'moonshotai/kimi-k2-thinking',
      name: 'Kimi K2 Thinking',
      supported_parameters: ['reasoning'],
    })

    expect(mapped.supportsDeepThinking).toBe(true)
    expect(mapped.openRouterReasoningDetected).toBe(true)
  })

  it('infers deep thinking support from model names when metadata is missing', () => {
    expect(
      inferOpenRouterSupportsDeepThinking({
        code: 'moonshotai/kimi-k2-thinking',
        displayName: 'Kimi K2 Thinking',
      })
    ).toBe(true)

    expect(
      inferOpenRouterSupportsDeepThinking({
        code: 'deepseek/deepseek-r1',
        displayName: 'DeepSeek R1',
      })
    ).toBe(true)
  })

  it('does not mark regular chat models as deep thinking', () => {
    expect(
      inferOpenRouterSupportsDeepThinking({
        code: 'openai/gpt-4.1-mini',
        displayName: 'GPT-4.1 Mini',
      })
    ).toBe(false)
  })
})
