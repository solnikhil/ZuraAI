import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchFireworksModels,
  mapFireworksModelToConfiguredModel,
  searchFireworksModels,
  type FireworksModel,
} from './fireworksModels'

describe('fireworksModels', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches all paginated Fireworks catalog pages', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'accounts/fireworks/models/deepseek-v3p2' }],
          nextPageToken: 'page-2',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'accounts/fireworks/models/kimi-k2p5' }],
        }),
      } as Response)

    const models = await fetchFireworksModels('fw-key')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('filter=supports_serverless%3Dtrue')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('pageToken=page-2')
    expect(models).toEqual([
      { name: 'accounts/fireworks/models/deepseek-v3p2' },
      { name: 'accounts/fireworks/models/kimi-k2p5' },
    ])
  })

  it('maps Fireworks catalog metadata into configured model capabilities', () => {
    const configured = mapFireworksModelToConfiguredModel({
      name: 'accounts/fireworks/models/kimi-k2p5',
      displayName: 'Kimi K2.5',
      description: 'Unified multimodal model',
      context_length: 262144,
      input_modalities: ['text', 'image'],
      output_modalities: ['text'],
      supportsToolUse: true,
      supportsReasoning: true,
    })

    expect(configured).toEqual(
      expect.objectContaining({
        code: 'accounts/fireworks/models/kimi-k2p5',
        displayName: 'Kimi K2.5',
        maxContext: 262144,
        modelType: 'reasoning',
        supportsToolCall: true,
        supportsVision: true,
        supportsDeepThinking: true,
      })
    )
  })

  it('filters Fireworks catalog models by name and description', () => {
    const models: FireworksModel[] = [
      {
        name: 'accounts/fireworks/models/deepseek-v3p2',
        displayName: 'DeepSeek V3.2',
        description: 'General purpose reasoning model',
      },
      {
        name: 'accounts/fireworks/models/kimi-k2p5-turbo',
        displayName: 'Kimi K2.5 Turbo',
        description: 'Fast production model',
      },
    ]

    expect(searchFireworksModels(models, 'reasoning')).toEqual([models[0]])
    expect(searchFireworksModels(models, 'kimi 2.5 turbo')).toEqual([models[1]])
  })
})
