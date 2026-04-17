import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchPerplexityModels,
  mapPerplexityModelToConfiguredModel,
  searchPerplexityModels,
  type PerplexityCatalogModel,
} from './perplexityModels'

describe('perplexityModels', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches Sonar chat-completions models from the official catalog source', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () =>
        'Body application/json model enum<string> required Available options: `sonar`, `sonar-pro`, `sonar-deep-research`, `sonar-reasoning-pro` messages ChatMessage',
    } as Response)

    const models = await fetchPerplexityModels('px-key')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(models.map((model) => model.id)).toEqual([
      'sonar',
      'sonar-pro',
      'sonar-reasoning-pro',
      'sonar-deep-research',
    ])
    expect(models.every((model) => model.supportsWebSearch)).toBe(true)
  })

  it('ignores Agent API style provider-prefixed model ids', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () =>
        'Available options: `perplexity/sonar`, `anthropic/claude-sonnet-4-6`, `sonar`, `sonar-pro`',
    } as Response)

    const models = await fetchPerplexityModels('px-key')

    expect(models.map((model) => model.id)).toEqual(['sonar', 'sonar-pro'])
  })

  it('maps Perplexity catalog metadata into configured model capabilities', () => {
    const configured = mapPerplexityModelToConfiguredModel({
      id: 'sonar-reasoning-pro',
      displayName: 'Sonar Reasoning Pro',
      description: 'Reasoning-focused Sonar model with native web search.',
      maxContext: 128000,
      supportsWebSearch: true,
      supportsDeepThinking: true,
    })

    expect(configured).toEqual(
      expect.objectContaining({
        code: 'sonar-reasoning-pro',
        displayName: 'Sonar Reasoning Pro',
        maxContext: 128000,
        modelType: 'reasoning',
        supportsToolCall: false,
        supportsVision: false,
        supportsDeepThinking: true,
        supportsWebSearch: true,
      })
    )
  })

  it('filters Perplexity catalog models by id, display name, and description', () => {
    const models: PerplexityCatalogModel[] = [
      {
        id: 'sonar',
        displayName: 'Sonar',
        description: 'Search-native Sonar model for fast web-connected answers.',
        category: 'search',
        supportsWebSearch: true,
      },
      {
        id: 'sonar-deep-research',
        displayName: 'Sonar Deep Research',
        description: 'Exhaustive multi-source research model with native web search.',
        category: 'research',
        supportsWebSearch: true,
        supportsDeepThinking: true,
      },
    ]

    expect(searchPerplexityModels(models, 'deep research')).toEqual([models[1]])
    expect(searchPerplexityModels(models, 'fast web-connected')).toEqual([models[0]])
    expect(searchPerplexityModels(models, 'sonar')).toEqual(models)
  })

  it('requires an API key before fetching the Perplexity catalog', async () => {
    await expect(fetchPerplexityModels('')).rejects.toThrow(
      'Perplexity API key is required to fetch catalog models.'
    )
  })

  it('throws when the fetched source does not expose Sonar models', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => 'Available options: `perplexity/sonar`, `anthropic/claude-sonnet-4-6`',
    } as Response)

    await expect(fetchPerplexityModels('px-key')).rejects.toThrow(
      'Perplexity catalog did not expose any Sonar models in the expected format.'
    )
  })
})
