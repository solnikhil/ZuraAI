import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchAlibabaModels,
  mapAlibabaModelToConfiguredModel,
  searchAlibabaModels,
} from './alibabaModels'

function createAlibabaCatalogHtml(): string {
  const payload = JSON.stringify([
    '$',
    '$L22',
    null,
    {
      data: {
        '0': [
          {
            modelId: 'qwen3-max',
            name: 'Qwen3-Max',
            feature: 'Qwen3,Text Generation',
            description: 'Frontier reasoning, 1M context, agentic workflow mastery',
            modelType: 'Flagship',
            launchDate: '2026-01-23',
            order: '1.000000000',
          },
          {
            modelId: 'qwen3-vl-plus',
            name: 'Qwen3-VL-Plus',
            feature: 'Qwen3,Visual Understanding',
            description: 'Native VL, spatial reasoning, 1M-context video analysis',
            modelType: 'Visual',
            launchDate: '2025-12-19',
            order: '2.000000000',
          },
          {
            modelId: 'qwen-image-2.0',
            name: 'Qwen-Image-2.0',
            feature: 'Image Generation, Image Edit',
            description: 'Professional infographics, exquisite photorealism',
            modelType: 'Visual',
            launchDate: '2026-03-03',
            order: '3.000000000',
          },
          {
            modelId: 'deepseek-v3.2',
            name: 'Deepseek-V3.2',
            feature: 'ThirdParty',
            description: 'Strong reasoning, long-context, efficient MoE architecture',
            modelType: 'ThirdParty',
            launchDate: '2026-01-27',
            order: '4.000000000',
          },
        ],
      },
    },
  ])

  const encodedPayload = payload.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  return `<html><body><script>self.__next_f.push([1,"12:${encodedPayload}"])</script></body></html>`
}

describe('alibabaModels', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches and parses Qwen models from the official catalog page payload', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => createAlibabaCatalogHtml(),
    } as Response)

    const models = await fetchAlibabaModels('ali-key')

    expect(models.map((model) => model.id)).toEqual([
      'qwen3-max',
      'qwen3-vl-plus',
      'qwen-image-2.0',
    ])
    expect(models[0]).toEqual(
      expect.objectContaining({
        id: 'qwen3-max',
        displayName: 'Qwen3-Max',
        supportsDeepThinking: true,
        supportsToolCall: false,
        maxContext: 1_000_000,
      })
    )
  })

  it('maps Alibaba catalog metadata into configured model capabilities', () => {
    const configured = mapAlibabaModelToConfiguredModel({
      id: 'qwen3-vl-plus',
      displayName: 'Qwen3-VL-Plus',
      description: 'Native VL, spatial reasoning, 1M-context video analysis',
      maxContext: 1_000_000,
      inputModalities: ['text', 'image', 'video'],
      outputModalities: ['text'],
      supportsVision: true,
      supportsVideoRecognition: true,
      supportsDeepThinking: true,
      supportsToolCall: false,
      supportsImageGeneration: false,
    })

    expect(configured).toEqual(
      expect.objectContaining({
        code: 'qwen3-vl-plus',
        displayName: 'Qwen3-VL-Plus',
        maxContext: 1_000_000,
        modelType: 'video',
        supportsVision: true,
        supportsVideoRecognition: true,
        supportsDeepThinking: true,
      })
    )
  })

  it('filters Alibaba catalog models by id, display name, and description', () => {
    const models = [
      {
        id: 'qwen3-max',
        displayName: 'Qwen3-Max',
        description: 'Frontier reasoning, agentic workflow mastery',
        category: 'Flagship',
      },
      {
        id: 'qwen-image-2.0',
        displayName: 'Qwen-Image-2.0',
        description: 'Professional infographics and photorealism',
        category: 'Visual',
      },
    ]

    expect(searchAlibabaModels(models, 'workflow')).toEqual([models[0]])
    expect(searchAlibabaModels(models, 'image 2.0')).toEqual([models[1]])
    expect(searchAlibabaModels(models, 'visual')).toEqual([models[1]])
  })

  it('requires an API key before fetching the Alibaba catalog', async () => {
    await expect(fetchAlibabaModels('')).rejects.toThrow(
      'Alibaba API key is required to fetch catalog models.'
    )
  })
})
