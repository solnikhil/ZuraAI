import { describe, expect, it } from 'vitest'

import { getTitleEligibleModels, isModelEligibleForTitleGeneration } from './titleGenerationModels'

describe('titleGenerationModels', () => {
  it('excludes image-only models from title generation', () => {
    expect(
      isModelEligibleForTitleGeneration({
        code: 'openrouter/image-model',
        displayName: 'Image Model',
        modelType: 'image',
        outputModalities: ['image'],
      })
    ).toBe(false)
  })

  it('keeps text-capable multimodal models available for title generation', () => {
    expect(
      isModelEligibleForTitleGeneration({
        code: 'openrouter/multimodal-model',
        displayName: 'Multimodal Model',
        outputModalities: ['text', 'image'],
      })
    ).toBe(true)
  })

  it('dedupes models by code while preserving the first eligible entry', () => {
    expect(
      getTitleEligibleModels([
        { code: 'same-model', displayName: 'First Copy' },
        { code: 'same-model', displayName: 'Second Copy' },
        { code: 'image-only', displayName: 'Image Only', outputModalities: ['image'] },
        { code: 'text-model', displayName: 'Text Model', outputModalities: ['text'] },
      ])
    ).toEqual([
      { code: 'same-model', displayName: 'First Copy' },
      { code: 'text-model', displayName: 'Text Model', outputModalities: ['text'] },
    ])
  })
})
