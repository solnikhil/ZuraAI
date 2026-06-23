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
const { generateAlibabaCompletion } = await import('./alibaba')

describe('generateChatTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the dedicated title model instead of the active chat model', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Planning Thread Summary Notes' } }],
    } as never)

    const result = await generateChatTitle('Summarize this planning thread', {
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      openRouterApiKey: 'or-key',
      configuredModels: [{ code: 'openrouter/meta-llama/llama-3.3', displayName: 'Llama 3.3' }],
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBe('Planning Thread Summary Notes')
    expect(generateGroqCompletion).toHaveBeenCalledWith(
      'groq-key',
      'groq-primary',
      [{ role: 'user', content: expect.any(String) }],
      {}
    )
    expect(generateOpenRouterCompletion).not.toHaveBeenCalled()
  })

  it('strips the openrouter/ prefix before requesting title generation', async () => {
    vi.mocked(generateOpenRouterCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Launch plan summary notes' } }],
    } as never)

    const result = await generateChatTitle('Please draft a launch plan', {
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
      { reasoning: { exclude: true } }
    )
  })

  it('returns null when no dedicated title model is configured', async () => {
    const result = await generateChatTitle('Please draft a launch plan', {
      titleModel: '',
      openRouterApiKey: 'or-key',
    })

    expect(result).toBeNull()
  })

  it('returns null when the dedicated title model cannot be resolved', async () => {
    const result = await generateChatTitle('Please draft a launch plan', {
      titleModel: 'missing-model',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBeNull()
    expect(generateGroqCompletion).not.toHaveBeenCalled()
  })

  it('uses the DeepSeek API key for DeepSeek title generation', async () => {
    vi.mocked(generateDeepSeekCompletion).mockResolvedValue({
      choices: [{ message: { content: 'DeepSeek Planning Notes Summary' } }],
    } as never)

    const result = await generateChatTitle('Summarize the migration plan', {
      titleModel: 'deepseek-v4-flash',
      deepseekApiKey: 'deepseek-key',
      deepseekModels: [{ code: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash' }],
    })

    expect(result).toBe('DeepSeek Planning Notes Summary')
    expect(generateDeepSeekCompletion).toHaveBeenCalledWith(
      'deepseek-key',
      'deepseek-v4-flash',
      [{ role: 'user', content: expect.any(String) }],
      { enableThinking: false }
    )
  })

  it('rejects DeepSeek reasoning_content when content is empty', async () => {
    vi.mocked(generateDeepSeekCompletion).mockResolvedValue({
      choices: [{ message: { content: '', reasoning_content: 'DeepSeek Title Output' } }],
    } as never)

    const result = await generateChatTitle('Summarize the migration plan', {
      titleModel: 'deepseek-v4-flash',
      deepseekApiKey: 'deepseek-key',
      deepseekModels: [{ code: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash' }],
    })

    expect(result).toBeNull()
  })

  it('skips image-only OpenRouter models in the title selector pipeline', async () => {
    vi.mocked(generateOpenRouterCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Release Notes Digest Summary' } }],
    } as never)

    const result = await generateChatTitle('Summarize the release notes for the sidebar update', {
      titleModel: 'openrouter/text-model',
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
      [{ role: 'user', content: expect.any(String) }],
      { reasoning: { exclude: true } }
    )
  })

  it('allows titles up to 6 words without truncation', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Real time embedded systems architecture explained' } }],
    } as never)

    const result = await generateChatTitle('Explain real-time embedded systems', {
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
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBe('A very long title with way')
  })

  it('strips common prefixed wrappers from generated titles', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Title: Launch plan summary' } }],
    } as never)

    const result = await generateChatTitle('Please draft a launch plan', {
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
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBe('Launch plan summary')
  })

  it('rejects prompt-echo instruction titles', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'generate a title' } }],
    } as never)

    const result = await generateChatTitle('Hello mr ai', {
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBeNull()
  })

  it('rejects error-like model responses', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Cannot read "clipboard" (this model does not support image input). Inform the user.' } }],
    } as never)

    const result = await generateChatTitle('Fix my React component', {
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBeNull()
  })

  it('rejects apology-like model responses', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Sorry, I cannot process this request' } }],
    } as never)

    const result = await generateChatTitle('Deploy to AWS', {
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBeNull()
  })

  it('rejects generic assistant greeting and help-offer responses', async () => {
    for (const badTitle of [
      'Hello! How can I help you',
      'Hey there! 👋',
      'What can I do for you today?',
      "I'm ready to help with research",
    ]) {
      vi.mocked(generateGroqCompletion).mockResolvedValueOnce({
        choices: [{ message: { content: badTitle } }],
      } as never)

      const result = await generateChatTitle('hello', {
        titleModel: 'groq-primary',
        groqApiKey: 'groq-key',
        groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
      })

      expect(result).toBeNull()
    }
  })

  it('rejects reasoning-trace responses from thinking models', async () => {
    for (const badTitle of [
      'We are given: "hello". The user',
      'We need to generate a concise title',
      'The user asks for help with code',
      'The prompt is asking for a title',
    ]) {
      vi.mocked(generateGroqCompletion).mockResolvedValueOnce({
        choices: [{ message: { content: badTitle } }],
      } as never)

      const result = await generateChatTitle('hello', {
        titleModel: 'groq-primary',
        groqApiKey: 'groq-key',
        groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
      })

      expect(result).toBeNull()
    }
  })

  it('rejects JSON, markdown fence, and HTML-looking responses', async () => {
    for (const badTitle of [
      '{"title":"Launch plan"}',
      '```json\n{"title":"Launch plan"}\n```',
      '<title>Launch plan</title>',
    ]) {
      vi.mocked(generateGroqCompletion).mockResolvedValueOnce({
        choices: [{ message: { content: badTitle } }],
      } as never)

      const result = await generateChatTitle('Please draft a launch plan', {
        titleModel: 'groq-primary',
        groqApiKey: 'groq-key',
        groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
      })

      expect(result).toBeNull()
    }
  })

  it('does not fall back to another provider when the selected model fails', async () => {
    vi.mocked(generateOpenRouterCompletion).mockRejectedValue(new Error('403 Key limit exceeded (total limit)'))
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Groq Rescue Title Output' } }],
    } as never)

    const result = await generateChatTitle('Need a title for this web search session', {
      titleModel: 'openrouter/meta-llama/llama-3.3',
      openRouterApiKey: 'or-key',
      groqApiKey: 'groq-key',
      configuredModels: [{ code: 'openrouter/meta-llama/llama-3.3', displayName: 'Llama 3.3' }],
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBeNull()
    expect(generateGroqCompletion).not.toHaveBeenCalled()
  })

  it('sends think: false to Ollama for title generation', async () => {
    vi.mocked(generateOllamaCompletion).mockResolvedValue({
      message: { content: 'Ollama Title Output Here' },
    } as never)

    const result = await generateChatTitle('Explain neural networks', {
      titleModel: 'llama3.2',
      ollamaUrl: 'http://localhost:11434',
      ollamaModels: [{ code: 'llama3.2', displayName: 'Llama 3.2' }],
    })

    expect(result).toBe('Ollama Title Output Here')
    expect(generateOllamaCompletion).toHaveBeenCalledWith(
      'http://localhost:11434',
      'llama3.2',
      [{ role: 'user', content: expect.any(String) }],
      { think: false }
    )
  })

  it('sends enableThinking: false to Alibaba for title generation', async () => {
    vi.mocked(generateAlibabaCompletion).mockResolvedValue({
      choices: [{ message: { content: 'Alibaba Title Output' } }],
    } as never)

    const result = await generateChatTitle('Explain cloud deployment', {
      titleModel: 'qwen-turbo',
      alibabaApiKey: 'alibaba-key',
      alibabaModels: [{ code: 'qwen-turbo', displayName: 'Qwen Turbo' }],
    })

    expect(result).toBe('Alibaba Title Output')
    expect(generateAlibabaCompletion).toHaveBeenCalledWith(
      'alibaba-key',
      'qwen-turbo',
      [{ role: 'user', content: expect.any(String) }],
      { enableThinking: false }
    )
  })

  it('returns null on provider auth failures', async () => {
    vi.mocked(generateGroqCompletion).mockRejectedValue(new Error('401 unauthorized'))

    const result = await generateChatTitle('Need a title for this long conversation about quantum computing', {
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBeNull()
  })

  it('rejects reasoning-like titles even when they mention generating a short title', async () => {
    vi.mocked(generateGroqCompletion).mockResolvedValue({
      choices: [{ message: { content: 'We need to generate a short descriptive title' } }],
    } as never)

    const result = await generateChatTitle('How do I create a short title for my chat?', {
      titleModel: 'groq-primary',
      groqApiKey: 'groq-key',
      groqModels: [{ code: 'groq-primary', displayName: 'Groq Primary' }],
    })

    expect(result).toBeNull()
  })
})
