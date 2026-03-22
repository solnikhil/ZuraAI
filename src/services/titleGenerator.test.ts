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
      { max_tokens: 20 },
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

  it('falls back to the default OpenRouter title model after a non-auth provider failure', async () => {
    vi.mocked(generateGroqCompletion).mockRejectedValue(new Error('Temporary upstream failure'))
    vi.mocked(generateOpenRouterCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Fallback summary title' } }],
    } as never)

    const result = await generateChatTitle('Summarize this research session', {
      titleModelProvider: 'groq',
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
      openRouterApiKey: 'or-key',
    })

    expect(result).toBe('Fallback summary title')
    expect(generateOpenRouterCompletion).toHaveBeenCalledWith(
      'or-key',
      'google/gemini-2.0-flash-exp:free',
      [{ role: 'user', content: expect.stringContaining('Summarize this research session') }],
      { max_tokens: 20 },
    )
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
})
