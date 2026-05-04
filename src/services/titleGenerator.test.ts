import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./groq', () => ({
  generateGroqCompletion: vi.fn(),
}))

vi.mock('./alibaba', () => ({
  generateAlibabaCompletion: vi.fn(),
}))

vi.mock('./deepseek', () => ({
  generateDeepSeekCompletion: vi.fn(),
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

vi.mock('./fireworks', () => ({
  generateFireworksCompletion: vi.fn(),
}))

vi.mock('../utils/openRouterKey', () => ({
  getOpenRouterApiKey: vi.fn((value?: string) => value?.trim() || ''),
}))

const { generateChatTitle } = await import('./titleGenerator')
const { generateDeepSeekCompletion } = await import('./deepseek')
const { generateGroqCompletion } = await import('./groq')
const { generateOpenRouterCompletion } = await import('./openrouter')
const { generateOllamaCompletion } = await import('./ollama')
const { generateFireworksCompletion } = await import('./fireworks')
const { generateAlibabaCompletion } = await import('./alibaba')

describe('generateChatTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('strips the openrouter/ prefix before requesting title generation', async () => {
    vi.mocked(generateOpenRouterCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Launch plan summary notes' } }],
    } as never)

    const result = await generateChatTitle('Please draft a launch plan', {
      titleModelProvider: 'openrouter',
      titleModel: 'openrouter/meta-llama/llama-3.3',
      openRouterApiKey: 'or-key',
      configuredModels: [{ code: 'openrouter/meta-llama/llama-3.3', displayName: 'Llama 3.3' }],
      titleGenerationPrompt: 'Make a title for {{userMessage}}',
    })

    expect(result).toBe('Launch plan summary notes')
    expect(generateOpenRouterCompletion).toHaveBeenCalledWith(
      'or-key',
      'meta-llama/llama-3.3',
      [{ role: 'user', content: 'Make a title for Please draft a launch plan' }],
      { temperature: 0.3, max_tokens: 40, reasoning: { exclude: true } },
    )
  })

  it('allows titles up to 6 words without truncation', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Real time embedded systems architecture explained' } }],
    } as never)

    const result = await generateChatTitle('Explain real-time embedded systems', {
      titleModelProvider: 'groq',
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBe('Real time embedded systems architecture explained')
  })

  it('truncates titles that exceed 6 words', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'A very long title with way too many words for display' } }],
    } as never)

    const result = await generateChatTitle('Tell me about distributed systems', {
      titleModelProvider: 'groq',
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBe('A very long title with way')
  })

  it('prefers enabled provider models when the requested title model is unavailable', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Alpha Beta Gamma Delta Epsilon Zeta' } }],
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

    expect(result).toBe('Alpha Beta Gamma Delta Epsilon Zeta')
    expect(generateGroqCompletion).toHaveBeenCalledWith(
      'groq-key',
      'enabled-model',
      [{ role: 'user', content: expect.any(String) }],
      { temperature: 0.3, max_tokens: 40 },
    )
  })

  it('uses the DeepSeek API key for DeepSeek title generation', async () => {
    vi.mocked(generateDeepSeekCompletion).mockResolvedValue({
      choices: [{ message: { content: 'DeepSeek Planning Notes Summary' } }],
    } as never)

    const result = await generateChatTitle('Summarize the migration plan', {
      titleModelProvider: 'deepseek',
      titleModel: 'deepseek-v4-flash',
      deepseekApiKey: 'deepseek-key',
      deepseekModels: [{ code: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash' }],
    })

    expect(result).toBe('DeepSeek Planning Notes Summary')
    expect(generateDeepSeekCompletion).toHaveBeenCalledWith(
      'deepseek-key',
      'deepseek-v4-flash',
      [
        {
          role: 'user',
          content: expect.any(String),
        },
      ],
      { temperature: 0.3, max_tokens: 40, enableThinking: false },
    )
  })

  it('accepts DeepSeek reasoning_content as a title when content is empty', async () => {
    vi.mocked(generateDeepSeekCompletion).mockResolvedValue({
      choices: [{ message: { content: '', reasoning_content: 'DeepSeek Title Output' } }],
    } as never)

    const result = await generateChatTitle('Summarize the migration plan', {
      titleModelProvider: 'deepseek',
      titleModel: 'deepseek-v4-flash',
      deepseekApiKey: 'deepseek-key',
      deepseekModels: [{ code: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash' }],
    })

    expect(result).toBe('DeepSeek Title Output')
  })

  it('skips image-only OpenRouter models when resolving a fallback title model', async () => {
    vi.mocked(generateOpenRouterCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Release Notes Digest Summary' } }],
    } as never)

    const result = await generateChatTitle('Summarize the release notes for the sidebar update', {
      titleModelProvider: 'openrouter',
      openRouterApiKey: 'or-key',
      configuredModels: [
        {
          code: 'openrouter/image-only-model',
          displayName: 'Image Only',
          outputModalities: ['image'],
          modelType: 'image',
          enabled: true,
        },
        {
          code: 'openrouter/text-model',
          displayName: 'Text Model',
          outputModalities: ['text'],
          enabled: true,
        },
      ],
    })

    expect(result).toBe('Release Notes Digest Summary')
    expect(generateOpenRouterCompletion).toHaveBeenCalledWith(
      'or-key',
      'text-model',
      [
        {
          role: 'user',
          content: expect.any(String),
        },
      ],
      { temperature: 0.3, max_tokens: 40, reasoning: { exclude: true } },
    )
  })

  it('uses the active chat provider when no explicit title model is configured', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Planning Thread Summary Notes' } }],
    } as never)

    const result = await generateChatTitle('Summarize this planning thread', {
      titleModelProvider: 'openrouter',
      titleModel: '',
      modelProvider: 'groq',
      aiModel: 'groq-primary',
      groqApiKey: 'groq-key',
      configuredModels: [{ code: 'openrouter/meta-llama/llama-3.3', displayName: 'Llama 3.3' }],
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBe('Planning Thread Summary Notes')
    expect(generateGroqCompletion).toHaveBeenCalledWith(
      'groq-key',
      'groq-primary',
      [
        {
          role: 'user',
          content: expect.any(String),
        },
      ],
      { temperature: 0.3, max_tokens: 40 },
    )
    expect(generateOpenRouterCompletion).not.toHaveBeenCalled()
  })

  it('falls back to a clipped user-message title after a non-auth provider failure without another configured provider', async () => {
    vi.mocked(generateGroqCompletion).mockRejectedValue(new Error('Temporary upstream failure'))

    const result = await generateChatTitle('Summarize this research session about distributed databases', {
      titleModelProvider: 'groq',
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
      openRouterApiKey: 'or-key',
    })

    expect(result).toBe('Summarize this research session about distributed...')
    expect(generateOpenRouterCompletion).not.toHaveBeenCalled()
  })

  it('falls back to a clipped user-message title after auth failures', async () => {
    vi.mocked(generateGroqCompletion).mockRejectedValue(new Error('401 unauthorized'))

    const result = await generateChatTitle('Need a title for this long conversation about quantum computing', {
      titleModelProvider: 'groq',
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
      openRouterApiKey: 'or-key',
    })

    expect(result).toBe('Need a title for this long...')
    expect(generateOpenRouterCompletion).not.toHaveBeenCalled()
  })

  it('does not treat Ollama as configured for title fallback when no URL is present', async () => {
    vi.mocked(generateGroqCompletion).mockRejectedValue(new Error('Temporary upstream failure'))

    const result = await generateChatTitle('Summarize this planning thread about microservices architecture', {
      titleModelProvider: 'groq',
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
      ollamaModels: [{ code: 'llama3.2', displayName: 'Llama 3.2' }],
      ollamaUrl: '',
    })

    expect(result).toBe('Summarize this planning thread about microservices...')
    expect(generateOllamaCompletion).not.toHaveBeenCalled()
  })

  it('strips common prefixed wrappers from generated titles', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Title: Launch plan summary' } }],
    } as never)

    const result = await generateChatTitle('Please draft a launch plan', {
      titleModelProvider: 'groq',
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBe('Launch plan summary')
  })

  it('keeps scanning lines when the first line is only a wrapper', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Title:\nLaunch plan summary' } }],
    } as never)

    const result = await generateChatTitle('Please draft a launch plan', {
      titleModelProvider: 'groq',
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBe('Launch plan summary')
  })

  it('strips common prefixed wrappers from fallback titles', async () => {
    vi.mocked(generateGroqCompletion).mockRejectedValue(new Error('Temporary upstream failure'))

    const result = await generateChatTitle('Title: Summarize this planning thread about microservices', {
      titleModelProvider: 'groq',
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
      openRouterApiKey: 'or-key',
    })

    expect(result).toBe('Summarize this planning thread about microservices')
  })

  it('rejects prompt-echo instruction titles like "generate a title"', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'generate a title' } }],
    } as never)

    const result = await generateChatTitle('Hello mr ai', {
      titleModelProvider: 'groq',
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBe('Hello mr ai')
  })

  it('rejects error-like model responses and falls back to user message', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Cannot read "clipboard" (this model does not support image input). Inform the user.' } }],
    } as never)

    const result = await generateChatTitle('Fix my React component', {
      titleModelProvider: 'groq',
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBe('Fix my React component')
  })

  it('rejects apology-like model responses and falls back', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Sorry, I cannot process this request' } }],
    } as never)

    const result = await generateChatTitle('Deploy to AWS', {
      titleModelProvider: 'groq',
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBe('Deploy to AWS')
  })

  it('falls back to another configured provider when the selected title provider fails', async () => {
    vi.mocked(generateOpenRouterCompletion).mockRejectedValue(
      new Error('403 Key limit exceeded (total limit)')
    )
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Groq Rescue Title Output' } }],
    } as never)

    const result = await generateChatTitle('Need a title for this web search session', {
      titleModelProvider: 'openrouter',
      titleModel: 'openrouter/meta-llama/llama-3.3',
      modelProvider: 'groq',
      aiModel: 'groq-primary',
      openRouterApiKey: 'or-key',
      groqApiKey: 'groq-key',
      configuredModels: [{ code: 'openrouter/meta-llama/llama-3.3', displayName: 'Llama 3.3' }],
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBe('Groq Rescue Title Output')
    expect(generateGroqCompletion).toHaveBeenCalledWith(
      'groq-key',
      'groq-primary',
      [
        {
          role: 'user',
          content: expect.any(String),
        },
      ],
      { temperature: 0.3, max_tokens: 40 },
    )
  })

  it('sends think: false to Ollama for title generation', async () => {
    vi.mocked(generateOllamaCompletion).mockResolvedValue({
      message: { content: 'Ollama Title Output Here' },
    } as never)

    const result = await generateChatTitle('Explain neural networks', {
      titleModelProvider: 'ollama',
      titleModel: 'llama3.2',
      ollamaUrl: 'http://localhost:11434',
      ollamaModels: [{ code: 'llama3.2', displayName: 'Llama 3.2' }],
    })

    expect(result).toBe('Ollama Title Output Here')
    expect(generateOllamaCompletion).toHaveBeenCalledWith(
      'http://localhost:11434',
      'llama3.2',
      [{ role: 'user', content: expect.any(String) }],
      { temperature: 0.3, think: false },
    )
  })

  it('sends enableThinking: false to Alibaba for title generation', async () => {
    vi.mocked(generateAlibabaCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Alibaba Title Output' } }],
    } as never)

    const result = await generateChatTitle('Explain cloud deployment', {
      titleModelProvider: 'alibaba',
      titleModel: 'qwen-turbo',
      alibabaApiKey: 'alibaba-key',
      alibabaModels: [{ code: 'qwen-turbo', displayName: 'Qwen Turbo' }],
    })

    expect(result).toBe('Alibaba Title Output')
    expect(generateAlibabaCompletion).toHaveBeenCalledWith(
      'alibaba-key',
      'qwen-turbo',
      [{ role: 'user', content: expect.any(String) }],
      { temperature: 0.3, max_tokens: 40, enableThinking: false },
    )
  })

  it('builds a 6-word fallback title from the user message', async () => {
    vi.mocked(generateGroqCompletion).mockRejectedValue(new Error('Temporary upstream failure'))

    const result = await generateChatTitle('One two three four five six seven eight', {
      titleModelProvider: 'groq',
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBe('One two three four five six...')
  })
})
