import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./groq', () => ({
  generateGroqCompletion: vi.fn(),
}))

vi.mock('./alibaba', () => ({
  generateAlibabaCompletion: vi.fn(),
}))

vi.mock('./ollama', () => ({
  generateOllamaCompletion: vi.fn(),
}))

vi.mock('./perplexity', () => ({
  generatePerplexityCompletion: vi.fn(),
}))

vi.mock('./openrouter', () => ({
  generateOpenRouterCompletion: vi.fn(),
}))

vi.mock('../utils/openRouterKey', () => ({
  getOpenRouterApiKey: vi.fn((value?: string) => value?.trim() || ''),
}))

const { generateChatTitle } = await import('./titleGenerator')
const { generateGroqCompletion } = await import('./groq')
const { generateOpenRouterCompletion } = await import('./openrouter')
const { generateOllamaCompletion } = await import('./ollama')

describe('generateChatTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('strips the openrouter/ prefix before requesting title generation', async () => {
    vi.mocked(generateOpenRouterCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Launch plan summary' } }],
    } as never)

    const result = await generateChatTitle('Please draft a launch plan', {
      titleModelProvider: 'openrouter',
      titleModel: 'openrouter/meta-llama/llama-3.3',
      openRouterApiKey: 'or-key',
      configuredModels: [{ code: 'openrouter/meta-llama/llama-3.3', displayName: 'Llama 3.3' }],
      titleGenerationPrompt: 'Make a title for {{userMessage}}',
    })

    expect(result).toBe('Launch plan summary')
    expect(generateOpenRouterCompletion).toHaveBeenCalledWith(
      'or-key',
      'meta-llama/llama-3.3',
      [{ role: 'user', content: 'Make a title for Please draft a launch plan' }],
      { temperature: 0.3, max_tokens: 20 },
    )
  })

  it('prefers enabled provider models when the requested title model is unavailable', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Alpha Beta Gamma Delta' } }],
    } as never)

    const result = await generateChatTitle('Write deployment notes', {
      titleModelProvider: 'groq',
      titleModel: 'disabled-model',
      aiModel: 'missing-model',
      groqApiKey: 'groq-key',
      groqModels: [
        { code: 'disabled-model', displayName: 'Disabled', enabled: false },
        { code: 'enabled-model', displayName: 'Enabled', enabled: true },
      ],
    })

    expect(result).toBe('Alpha Beta Gamma')
    expect(generateGroqCompletion).toHaveBeenCalledWith(
      'groq-key',
      'enabled-model',
      [{ role: 'user', content: expect.stringContaining('User message: "Write deployment notes"') }],
      { temperature: 0.3 },
    )
  })

  it('falls back to a clipped user-message title after a non-auth provider failure without another configured provider', async () => {
    vi.mocked(generateGroqCompletion).mockRejectedValue(new Error('Temporary upstream failure'))

    const result = await generateChatTitle('Summarize this research session', {
      titleModelProvider: 'groq',
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
      openRouterApiKey: 'or-key',
    })

    expect(result).toBe('Summarize this research...')
    expect(generateOpenRouterCompletion).not.toHaveBeenCalled()
  })

  it('falls back to a clipped user-message title after auth failures', async () => {
    vi.mocked(generateGroqCompletion).mockRejectedValue(new Error('401 unauthorized'))

    const result = await generateChatTitle('Need a title for this long conversation', {
      titleModelProvider: 'groq',
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
      openRouterApiKey: 'or-key',
    })

    expect(result).toBe('Need a title...')
    expect(generateOpenRouterCompletion).not.toHaveBeenCalled()
  })

  it('does not treat Ollama as configured for title fallback when no URL is present', async () => {
    vi.mocked(generateGroqCompletion).mockRejectedValue(new Error('Temporary upstream failure'))

    const result = await generateChatTitle('Summarize this planning thread', {
      titleModelProvider: 'groq',
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
      ollamaModels: [{ code: 'llama3.2', displayName: 'Llama 3.2' }],
      ollamaUrl: '',
    })

    expect(result).toBe('Summarize this planning...')
    expect(generateOllamaCompletion).not.toHaveBeenCalled()
  })
})
