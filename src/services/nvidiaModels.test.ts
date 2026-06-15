import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchNvidiaModels,
  mapNvidiaModelToConfiguredModel,
  searchNvidiaModels,
  type NvidiaModel,
} from './nvidiaModels'

describe('nvidiaModels', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches and deduplicates NVIDIA catalog models', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        object: 'list',
        data: [
          { id: 'minimaxai/minimax-m3', object: 'model', owned_by: 'minimaxai' },
          { id: 'minimaxai/minimax-m3', object: 'model', owned_by: 'minimaxai' },
          { id: 'nvidia/llama-chat', object: 'model', owned_by: 'nvidia' },
        ],
      }),
    } as Response)

    const models = await fetchNvidiaModels('nvapi-key')

    expect(fetchMock).toHaveBeenCalledWith('https://integrate.api.nvidia.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer nvapi-key',
        'Content-Type': 'application/json',
      },
    })
    expect(models.map((model) => model.id)).toEqual([
      'minimaxai/minimax-m3',
      'nvidia/llama-chat',
    ])
  })

  it('maps MiniMax M3 to configured model capabilities', () => {
    expect(
      mapNvidiaModelToConfiguredModel({
        id: 'minimaxai/minimax-m3',
        object: 'model',
        owned_by: 'minimaxai',
      })
    ).toEqual(
      expect.objectContaining({
        code: 'minimaxai/minimax-m3',
        displayName: 'MiniMax M3',
        maxContext: 1048576,
        modelType: 'reasoning',
        supportsToolCall: true,
        supportsVision: true,
        supportsDeepThinking: true,
        supportsVideoRecognition: true,
      })
    )
  })

  it('filters NVIDIA catalog models by id and owner', () => {
    const models: NvidiaModel[] = [
      { id: 'minimaxai/minimax-m3', owned_by: 'minimaxai' },
      { id: 'nvidia/llama-chat', owned_by: 'nvidia' },
    ]

    expect(searchNvidiaModels(models, 'minimax')).toEqual([models[0]])
    expect(searchNvidiaModels(models, 'llama nvidia')).toEqual([models[1]])
  })

  it('requires an API key', async () => {
    await expect(fetchNvidiaModels('')).rejects.toThrow('NVIDIA API key is required')
  })
})
