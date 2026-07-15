import { describe, expect, it, vi } from 'vitest'
import {
  fetchAlibabaModels,
  inferAlibabaSupportsDeepThinking,
  mapAlibabaModelToConfiguredModel,
  searchAlibabaModels,
} from './alibabaModels'

describe('alibabaModels', () => {
  it('returns a credential-free curated catalog without a network request', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    const models = await fetchAlibabaModels()

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(models.map((model) => model.id)).toEqual([
      'qwen3.7-max',
      'qwen3.7-plus',
      'qwen3.6-flash',
      'qwen3.5-omni-plus',
      'qwen3-vl-plus',
    ])
    expect(models[0]).toEqual(
      expect.objectContaining({
        supportsDeepThinking: true,
        supportsToolCall: true,
        maxContext: 1_000_000,
      })
    )
  })

  it('maps explicit catalog metadata without inferring missing capabilities', () => {
    const configured = mapAlibabaModelToConfiguredModel({
      id: 'qwen3-vl-plus',
      displayName: 'Qwen3-VL-Plus',
      inputModalities: ['text', 'image', 'video'],
      outputModalities: ['text'],
      supportsVision: true,
      supportsVideoRecognition: true,
      supportsDeepThinking: false,
      supportsToolCall: true,
    })

    expect(configured).toEqual(
      expect.objectContaining({
        modelType: 'video',
        supportsVision: true,
        supportsVideoRecognition: true,
        supportsDeepThinking: false,
        supportsToolCall: true,
      })
    )
  })

  it('filters models by id, display name, description, and category', async () => {
    const models = await fetchAlibabaModels()
    expect(searchAlibabaModels(models, 'cost efficient')).toHaveLength(1)
    expect(searchAlibabaModels(models, 'visual understanding').map((model) => model.id)).toContain(
      'qwen3-vl-plus'
    )
  })

  it('uses only explicit thinking capability metadata', () => {
    expect(inferAlibabaSupportsDeepThinking({ supportsDeepThinking: true })).toBe(true)
    expect(inferAlibabaSupportsDeepThinking({ supportsDeepThinking: false })).toBe(false)
    expect(inferAlibabaSupportsDeepThinking(undefined)).toBe(false)
  })
})
