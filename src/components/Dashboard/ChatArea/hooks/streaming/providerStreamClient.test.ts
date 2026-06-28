import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  streamOpenRouterCompletion: vi.fn(),
  generateOpenRouterCompletion: vi.fn(),
  streamGroqCompletion: vi.fn(),
  generateGroqCompletion: vi.fn(),
  streamAlibabaCompletion: vi.fn(),
  generateAlibabaCompletion: vi.fn(),
  streamDeepSeekCompletion: vi.fn(),
  generateDeepSeekCompletion: vi.fn(),
  streamFireworksCompletion: vi.fn(),
  generateFireworksCompletion: vi.fn(),
  streamNvidiaCompletion: vi.fn(),
  generateNvidiaCompletion: vi.fn(),
  streamOpencodeCompletion: vi.fn(),
  generateOpencodeCompletion: vi.fn(),
  extractOpencodeStreamReasoningDelta: vi.fn(),
  streamOllamaCompletion: vi.fn(),
  generateOllamaCompletion: vi.fn(),
  streamPerplexityCompletion: vi.fn(),
  generatePerplexityCompletion: vi.fn(),
}))

vi.mock('../../../../../services/openrouter', () => ({
  streamOpenRouterCompletion: mocks.streamOpenRouterCompletion,
  generateOpenRouterCompletion: mocks.generateOpenRouterCompletion,
}))

vi.mock('../../../../../services/groq', () => ({
  streamGroqCompletion: mocks.streamGroqCompletion,
  generateGroqCompletion: mocks.generateGroqCompletion,
}))

vi.mock('../../../../../services/alibaba', () => ({
  streamAlibabaCompletion: mocks.streamAlibabaCompletion,
  generateAlibabaCompletion: mocks.generateAlibabaCompletion,
}))

vi.mock('../../../../../services/deepseek', () => ({
  streamDeepSeekCompletion: mocks.streamDeepSeekCompletion,
  generateDeepSeekCompletion: mocks.generateDeepSeekCompletion,
}))

vi.mock('../../../../../services/fireworks', () => ({
  streamFireworksCompletion: mocks.streamFireworksCompletion,
  generateFireworksCompletion: mocks.generateFireworksCompletion,
}))

vi.mock('../../../../../services/nvidia', () => ({
  streamNvidiaCompletion: mocks.streamNvidiaCompletion,
  generateNvidiaCompletion: mocks.generateNvidiaCompletion,
}))

vi.mock('../../../../../services/opencode', () => ({
  streamOpencodeCompletion: mocks.streamOpencodeCompletion,
  generateOpencodeCompletion: mocks.generateOpencodeCompletion,
  extractOpencodeStreamReasoningDelta: mocks.extractOpencodeStreamReasoningDelta,
}))

vi.mock('../../../../../services/ollama', () => ({
  streamOllamaCompletion: mocks.streamOllamaCompletion,
  generateOllamaCompletion: mocks.generateOllamaCompletion,
}))

vi.mock('../../../../../services/perplexity', async () => {
  const actual = await vi.importActual<typeof import('../../../../../services/perplexity')>(
    '../../../../../services/perplexity'
  )
  return {
    ...actual,
    streamPerplexityCompletion: mocks.streamPerplexityCompletion,
    generatePerplexityCompletion: mocks.generatePerplexityCompletion,
  }
})

vi.mock('../../../../../utils/openRouterKey', () => ({
  getOpenRouterApiKey: (value?: string) => value?.trim() || '',
}))

import { createProviderStreamClient } from './providerStreamClient'

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const chunks: T[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

describe('createProviderStreamClient', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mockFn) => mockFn.mockReset())
    mocks.extractOpencodeStreamReasoningDelta.mockImplementation((delta, emittedReasoning) => {
      const raw = delta?.reasoning_content || delta?.reasoning || ''
      return raw ? { delta: raw, nextEmitted: emittedReasoning + raw } : null
    })
  })

  it('normalizes OpenRouter streaming events into provider-neutral deltas', async () => {
    mocks.streamOpenRouterCompletion.mockImplementation(async function* () {
      yield {
        choices: [{
          delta: {
            content: 'Hi',
            reasoning: 'Think',
            reasoning_details: [{
              id: 'r1',
              format: 'text',
              type: 'reasoning.text',
              text: 'Think',
            }],
            tool_calls: [{
              index: 0,
              id: 'call_1',
              type: 'function',
              function: {
                name: 'web_search',
                arguments: '{"query":"zura"}',
              },
            }],
            images: [{ image_url: { url: 'data:image/png;base64,abc' } }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 4,
          total_tokens: 14,
          prompt_cache_tokens: 6,
          completion_cache_tokens: 1,
          cache_creation_input_tokens: 3,
          completion_tokens_details: { reasoning_tokens: 2, image_tokens: 5 },
          cost: 0.00014,
        },
      }
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'openai/gpt-4.1',
        modelProvider: 'openrouter',
        temperature: 0.4,
        maxTokens: 2048,
        streamResponses: true,
        openRouterApiKey: 'or-key',
      },
      'openrouter'
    )

    const events = await collect(client.stream({
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.4,
      maxTokens: 2048,
      streamResponses: true,
      tools: [{
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search the web',
          parameters: { type: 'object', properties: {} },
        },
      }],
    }))

    expect(events).toEqual([
      { type: 'text-delta', delta: 'Hi' },
      { type: 'reasoning-delta', delta: 'Think' },
      {
        type: 'reasoning-details',
        details: [{
          id: 'r1',
          format: 'text',
          type: 'reasoning.text',
          text: 'Think',
        }],
      },
      {
        type: 'tool-call-delta',
        delta: [{
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'web_search', arguments: '{"query":"zura"}' },
        }],
      },
      {
        type: 'file-delta',
        files: [
          expect.objectContaining({
            type: 'image',
            mimeType: 'image/png',
            data: 'data:image/png;base64,abc',
          }),
        ],
      },
      {
        type: 'usage',
        usage: {
          inputTokens: 10,
          outputTokens: 4,
          totalTokens: 14,
          thinkingTokens: 2,
          cachedInputTokens: 6,
          cachedOutputTokens: 1,
          cacheWriteInputTokens: 3,
          cost: 0.00014,
          imageTokens: 5,
        },
        rawUsage: expect.objectContaining({
          prompt_tokens: 10,
          completion_tokens: 4,
          total_tokens: 14,
        }),
      },
      { type: 'finish', finishReason: 'tool_calls' },
    ])
  })

  it('normalizes DeepSeek cache hit, cache miss, and reasoning usage tokens', async () => {
    mocks.streamDeepSeekCompletion.mockImplementation(async function* () {
      yield {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 4,
          total_tokens: 14,
          prompt_cache_hit_tokens: 6,
          prompt_cache_miss_tokens: 4,
          cache_write_input_tokens: 3,
          completion_tokens_details: { reasoning_tokens: 2 },
        },
      }
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'deepseek-reasoner',
        modelProvider: 'deepseek',
        temperature: 0.4,
        maxTokens: 2048,
        streamResponses: true,
        deepseekApiKey: 'deepseek-key',
      },
      'deepseek'
    )

    const events = await collect(client.stream({
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.4,
      maxTokens: 2048,
      streamResponses: true,
    }))

    expect(events).toContainEqual({
      type: 'usage',
      usage: {
        inputTokens: 10,
        outputTokens: 4,
        totalTokens: 14,
        thinkingTokens: 2,
        cachedInputTokens: 6,
        cachedOutputTokens: undefined,
        cacheMissInputTokens: 4,
        cacheWriteInputTokens: 3,
      },
      rawUsage: expect.objectContaining({
        prompt_tokens: 10,
        completion_tokens: 4,
        total_tokens: 14,
      }),
    })
  })

  it('normalizes nested Groq cached token usage', async () => {
    mocks.streamGroqCompletion.mockImplementation(async function* () {
      yield {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 4,
          total_tokens: 14,
          prompt_tokens_details: { cached_tokens: 7 },
        },
      }
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'llama-3.3-70b-versatile',
        modelProvider: 'groq',
        temperature: 0.4,
        maxTokens: 2048,
        streamResponses: true,
        groqApiKey: 'groq-key',
      },
      'groq'
    )

    const events = await collect(client.stream({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'hello' }],
      streamResponses: true,
    }))

    expect(events).toContainEqual({
      type: 'usage',
      usage: {
        inputTokens: 10,
        outputTokens: 4,
        totalTokens: 14,
        thinkingTokens: undefined,
        cachedInputTokens: 7,
        cachedOutputTokens: undefined,
        cacheMissInputTokens: undefined,
        cacheWriteInputTokens: undefined,
      },
      rawUsage: expect.objectContaining({
        prompt_tokens: 10,
        completion_tokens: 4,
        total_tokens: 14,
      }),
    })
  })

  it('adds OpenRouter explicit cache markers for eligible streaming chat models', async () => {
    mocks.streamOpenRouterCompletion.mockImplementation(async function* () {
      yield { choices: [{ delta: {}, finish_reason: 'stop' }] }
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'anthropic/claude-sonnet-4.5',
        modelProvider: 'openrouter',
        temperature: 0.4,
        maxTokens: 2048,
        streamResponses: true,
        openRouterApiKey: 'or-key',
      },
      'openrouter'
    )

    await collect(client.stream({
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4.5',
      messages: [
        { role: 'system', content: 'Base system prompt' },
        { role: 'system', content: 'Dynamic research context' },
        { role: 'user', content: 'Latest question' },
      ],
      streamResponses: true,
      sessionId: 'session-1',
    }))

    expect(mocks.streamOpenRouterCompletion).toHaveBeenCalledWith(
      'or-key',
      'anthropic/claude-sonnet-4.5',
      [
        {
          role: 'system',
          content: [{ type: 'text', text: 'Base system prompt', cache_control: { type: 'ephemeral' } }],
        },
        { role: 'system', content: 'Dynamic research context' },
        { role: 'user', content: 'Latest question' },
      ],
      expect.any(Object)
    )
  })

  it('adds Alibaba explicit cache markers for streaming chat requests', async () => {
    mocks.streamAlibabaCompletion.mockImplementation(async function* () {
      yield { choices: [{ delta: {}, finish_reason: 'stop' }] }
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'qwen3-max',
        modelProvider: 'alibaba',
        temperature: 0.4,
        maxTokens: 2048,
        streamResponses: true,
        alibabaApiKey: 'alibaba-key',
      },
      'alibaba'
    )

    await collect(client.stream({
      provider: 'alibaba',
      model: 'qwen3-max',
      messages: [
        { role: 'system', content: 'Base system prompt' },
        { role: 'user', content: 'Latest question' },
      ],
      streamResponses: true,
    }))

    expect(mocks.streamAlibabaCompletion).toHaveBeenCalledWith(
      'alibaba-key',
      'qwen3-max',
      [
        {
          role: 'system',
          content: [{ type: 'text', text: 'Base system prompt', cache_control: { type: 'ephemeral' } }],
        },
        { role: 'user', content: 'Latest question' },
      ],
      expect.any(Object)
    )
  })

  it('passes Fireworks session affinity for streaming chat requests only', async () => {
    mocks.streamFireworksCompletion.mockImplementation(async function* () {
      yield { choices: [{ delta: {}, finish_reason: 'stop' }] }
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'accounts/fireworks/models/deepseek-v3p2',
        modelProvider: 'fireworks',
        temperature: 0.5,
        maxTokens: 1024,
        streamResponses: true,
        fireworksApiKey: 'fw-key',
      },
      'fireworks'
    )

    await collect(client.stream({
      provider: 'fireworks',
      model: 'accounts/fireworks/models/deepseek-v3p2',
      messages: [{ role: 'user', content: 'hello' }],
      streamResponses: true,
      sessionId: 'session-123',
    }))

    expect(mocks.streamFireworksCompletion).toHaveBeenCalledWith(
      'fw-key',
      'accounts/fireworks/models/deepseek-v3p2',
      [{ role: 'user', content: 'hello' }],
      expect.objectContaining({
        extraHeaders: { 'x-session-affinity': 'session-123' },
      })
    )
  })

  it('dispatches NVIDIA streaming requests with adaptive thinking enabled', async () => {
    mocks.streamNvidiaCompletion.mockImplementation(async function* () {
      yield {
        choices: [{ delta: { content: 'hello' }, finish_reason: 'stop' }],
      }
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'minimaxai/minimax-m3',
        modelProvider: 'nvidia',
        temperature: 0.5,
        maxTokens: 1024,
        streamResponses: true,
        nvidiaApiKey: 'nvapi-key',
      },
      'nvidia'
    )

    const events = await collect(client.stream({
      provider: 'nvidia',
      model: 'minimaxai/minimax-m3',
      messages: [{ role: 'user', content: 'hello' }],
      streamResponses: true,
      enableThinking: true,
    }))

    expect(events).toContainEqual({ type: 'text-delta', delta: 'hello' })
    expect(mocks.streamNvidiaCompletion).toHaveBeenCalledWith(
      'nvapi-key',
      'minimaxai/minimax-m3',
      [{ role: 'user', content: 'hello' }],
      expect.objectContaining({
        enableThinking: true,
      })
    )
  })

  it('normalizes OpenCode Go streaming events through the shared provider client', async () => {
    mocks.streamOpencodeCompletion.mockImplementation(async function* (
      _apiKey: string,
      model: string
    ) {
      expect(model).toBe('glm-5.2')
      yield {
        choices: [{ delta: { content: 'Hello' } }],
      }
      yield {
        choices: [{ delta: { reasoning_content: 'Thinking' } }],
      }
      yield {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'web_search', arguments: '{"query":"zura"}' },
            }],
          },
        }],
      }
      yield {
        choices: [{ finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 6, completion_tokens: 4, total_tokens: 10 },
      }
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'glm-5.2',
        modelProvider: 'opencode',
        temperature: 0.4,
        maxTokens: 2048,
        streamResponses: true,
        opencodeGoApiKey: 'go-key',
      },
      'opencode'
    )

    const events = await collect(client.stream({
      provider: 'opencode',
      model: 'opencode-go/glm-5.2',
      messages: [{ role: 'user', content: 'hello' }],
      streamResponses: true,
    }))

    expect(events.some((event) => event.type === 'text-delta')).toBe(true)
    expect(events).toContainEqual({ type: 'reasoning-delta', delta: 'Thinking' })
    expect(events).toContainEqual({
      type: 'tool-call-delta',
      delta: [{
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'web_search', arguments: '{"query":"zura"}' },
      }],
    })
    expect(events).toContainEqual({
      type: 'usage',
      usage: {
        inputTokens: 6,
        outputTokens: 4,
        totalTokens: 10,
        thinkingTokens: undefined,
        cachedInputTokens: undefined,
        cachedOutputTokens: undefined,
        cacheMissInputTokens: undefined,
        cacheWriteInputTokens: undefined,
      },
      rawUsage: expect.objectContaining({
        prompt_tokens: 6,
        completion_tokens: 4,
        total_tokens: 10,
      }),
    })
    expect(events).toContainEqual({ type: 'finish', finishReason: 'tool_calls' })
  })

  it('extracts OpenRouter reasoning summaries when text reasoning is not present', async () => {
    mocks.streamOpenRouterCompletion.mockImplementation(async function* () {
      yield {
        choices: [{
          delta: {
            reasoning_details: [{
              id: 'r2',
              format: 'anthropic-claude-v1',
              type: 'reasoning.summary',
              summary: 'Planned the answer in two steps.',
            }],
          },
          finish_reason: 'stop',
        }],
      }
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'anthropic/claude-sonnet-4.5',
        modelProvider: 'openrouter',
        temperature: 0.4,
        maxTokens: 2048,
        streamResponses: true,
        openRouterApiKey: 'or-key',
      },
      'openrouter'
    )

    const events = await collect(client.stream({
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4.5',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.4,
      maxTokens: 2048,
      streamResponses: true,
    }))

    expect(events).toEqual([
      { type: 'reasoning-delta', delta: 'Planned the answer in two steps.' },
      {
        type: 'reasoning-details',
        details: [{
          id: 'r2',
          format: 'anthropic-claude-v1',
          type: 'reasoning.summary',
          summary: 'Planned the answer in two steps.',
        }],
      },
      { type: 'finish', finishReason: 'stop' },
    ])
  })

  it('forces OpenRouter chat requests through the streaming path even when streamResponses is false', async () => {
    mocks.streamOpenRouterCompletion.mockImplementation(async function* () {
      yield {
        choices: [{
          delta: {
            content: 'Streamed anyway',
          },
          finish_reason: 'stop',
        }],
      }
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'openai/gpt-4.1',
        modelProvider: 'openrouter',
        temperature: 0.4,
        maxTokens: 2048,
        streamResponses: false,
        openRouterApiKey: 'or-key',
      },
      'openrouter'
    )

    const events = await collect(client.stream({
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      messages: [{ role: 'user', content: 'hello' }],
      streamResponses: false,
    }))

    expect(mocks.generateOpenRouterCompletion).not.toHaveBeenCalled()
    expect(mocks.streamOpenRouterCompletion).toHaveBeenCalled()
    expect(events).toEqual([
      { type: 'text-delta', delta: 'Streamed anyway' },
      { type: 'finish', finishReason: 'stop' },
    ])
  })

  it('breaks large OpenRouter text chunks into progressive deltas for smoother token streaming', async () => {
    mocks.streamOpenRouterCompletion.mockImplementation(async function* () {
      yield {
        choices: [{
          delta: {
            content: 'This response arrived as one large buffered chunk.',
          },
          finish_reason: 'stop',
        }],
      }
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'openai/gpt-4.1',
        modelProvider: 'openrouter',
        temperature: 0.4,
        maxTokens: 2048,
        streamResponses: true,
        openRouterApiKey: 'or-key',
      },
      'openrouter'
    )

    const events = await collect(client.stream({
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      messages: [{ role: 'user', content: 'hello' }],
      streamResponses: true,
    }))

    const textDeltas = events.filter((event) => event.type === 'text-delta')
    expect(textDeltas.length).toBeGreaterThan(1)
    expect(textDeltas.map((event: any) => event.delta).join('')).toBe(
      'This response arrived as one large buffered chunk.'
    )
    expect(events.at(-1)).toEqual({ type: 'finish', finishReason: 'stop' })
  })

  it('breaks large DeepSeek text chunks into progressive deltas for smoother final synthesis', async () => {
    const bufferedAnswer = 'Buffered final synthesis arrived as one large chunk.'
    mocks.streamDeepSeekCompletion.mockImplementation(async function* () {
      yield {
        choices: [{
          delta: {
            content: bufferedAnswer,
          },
          finish_reason: 'stop',
        }],
      }
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'deepseek-v4-pro',
        modelProvider: 'deepseek',
        temperature: 0.4,
        maxTokens: 2048,
        streamResponses: true,
        deepseekApiKey: 'deepseek-key',
      },
      'deepseek'
    )

    const events = await collect(client.stream({
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'synthesize the results' }],
      streamResponses: true,
    }))

    const textDeltas = events.filter((event) => event.type === 'text-delta')
    expect(textDeltas.length).toBeGreaterThan(1)
    expect(textDeltas.map((event: any) => event.delta).join('')).toBe(bufferedAnswer)
    expect(events.at(-1)).toEqual({ type: 'finish', finishReason: 'stop' })
  })

  it('breaks non-streaming OpenAI-compatible responses into progressive deltas', async () => {
    const bufferedAnswer = 'Non-stream completion arrived as one buffered answer.'
    mocks.generateGroqCompletion.mockResolvedValue({
      id: 'resp_1',
      object: 'chat.completion',
      created: 1,
      model: 'llama-3.3-70b-versatile',
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: bufferedAnswer,
        },
      }],
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'llama-3.3-70b-versatile',
        modelProvider: 'groq',
        temperature: 0.4,
        maxTokens: 2048,
        streamResponses: false,
        groqApiKey: 'groq-key',
      },
      'groq'
    )

    const events = await collect(client.stream({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'hello' }],
      streamResponses: false,
    }))

    const textDeltas = events.filter((event) => event.type === 'text-delta')
    expect(textDeltas.length).toBeGreaterThan(1)
    expect(textDeltas.map((event: any) => event.delta).join('')).toBe(bufferedAnswer)
    expect(events.at(-1)).toEqual({ type: 'finish', finishReason: 'stop' })
  })

  it('falls back to non-streaming Ollama completion and forwards abort signals', async () => {
    const signal = new AbortController().signal
    mocks.streamOllamaCompletion.mockImplementation(async function* () {
      yield* []
      throw new Error('stream failed')
    })
    mocks.generateOllamaCompletion.mockResolvedValue({
      model: 'llama3.2',
      created_at: '2026-01-01T00:00:00Z',
      message: {
        role: 'assistant',
        content: 'Fallback answer',
        thinking: 'Local chain',
      },
      done: true,
      prompt_eval_count: 7,
      eval_count: 5,
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'llama3.2',
        modelProvider: 'ollama',
        temperature: 0.2,
        maxTokens: 1024,
        streamResponses: true,
        ollamaUrl: 'http://localhost:11434',
      },
      'ollama'
    )

    const events = await collect(client.stream({
      provider: 'ollama',
      model: 'llama3.2',
      messages: [{ role: 'user', content: 'hello' }],
      signal,
    }))

    expect(mocks.generateOllamaCompletion).toHaveBeenCalledWith(
      'http://localhost:11434',
      'llama3.2',
      [{ role: 'user', content: 'hello' }],
      expect.objectContaining({ signal })
    )
    expect(events).toEqual([
      { type: 'reasoning-delta', delta: 'Local chain' },
      { type: 'text-delta', delta: 'Fallback answer' },
      {
        type: 'usage',
        usage: { inputTokens: 7, outputTokens: 5, totalTokens: 12 },
        rawUsage: { prompt_eval_count: 7, eval_count: 5 },
      },
      { type: 'finish', finishReason: 'stop' },
    ])
  })

  it('normalizes Fireworks tool-calling chunks into shared stream events', async () => {
    mocks.streamFireworksCompletion.mockImplementation(async function* () {
      yield {
        choices: [{
          delta: {
            content: 'Fireworks reply',
            tool_calls: [{
              index: 0,
              id: 'fw_call_1',
              type: 'function',
              function: {
                name: 'web_search',
                arguments: '{"query":"fireworks"}',
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: {
          prompt_tokens: 9,
          completion_tokens: 5,
          total_tokens: 14,
        },
      }
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'accounts/fireworks/models/deepseek-v3p2',
        modelProvider: 'fireworks',
        temperature: 0.5,
        maxTokens: 1024,
        streamResponses: true,
        fireworksApiKey: 'fw-key',
      },
      'fireworks'
    )

    const events = await collect(client.stream({
      provider: 'fireworks',
      model: 'accounts/fireworks/models/deepseek-v3p2',
      messages: [{ role: 'user', content: 'hello' }],
      streamResponses: true,
      tools: [{
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search the web',
          parameters: { type: 'object', properties: {} },
        },
      }],
    }))

    expect(events).toEqual([
      { type: 'text-delta', delta: 'Fireworks reply' },
      {
        type: 'tool-call-delta',
        delta: [{
          index: 0,
          id: 'fw_call_1',
          type: 'function',
          function: { name: 'web_search', arguments: '{"query":"fireworks"}' },
        }],
      },
      {
        type: 'usage',
        usage: { inputTokens: 9, outputTokens: 5, totalTokens: 14 },
        rawUsage: { prompt_tokens: 9, completion_tokens: 5, total_tokens: 14 },
      },
      { type: 'finish', finishReason: 'tool_calls' },
    ])
  })

  it('forwards DeepSeek enableThinking and reasoningEffort to the streaming call', async () => {
    mocks.streamDeepSeekCompletion.mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'hi' }, finish_reason: 'stop' }] }
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'deepseek-v4-pro',
        modelProvider: 'deepseek',
        temperature: 0.4,
        maxTokens: 2048,
        streamResponses: true,
        deepseekApiKey: 'deepseek-key',
      },
      'deepseek'
    )

    await collect(client.stream({
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'hello' }],
      streamResponses: true,
      enableThinking: true,
      reasoningEffort: 'xhigh',
    }))

    expect(mocks.streamDeepSeekCompletion).toHaveBeenCalledWith(
      'deepseek-key',
      'deepseek-v4-pro',
      [{ role: 'user', content: 'hello' }],
      expect.objectContaining({ enableThinking: true, reasoningEffort: 'xhigh' })
    )
  })

  it('emits citation events for Perplexity non-streaming responses', async () => {
    mocks.generatePerplexityCompletion.mockResolvedValue({
      id: 'resp_1',
      model: 'sonar',
      created: 1,
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: 'Answer [1]',
        },
      }],
      usage: {
        prompt_tokens: 3,
        completion_tokens: 2,
        total_tokens: 5,
      },
      citations: ['https://example.com/source'],
    })

    const client = createProviderStreamClient(
      {
        aiModel: 'sonar',
        modelProvider: 'perplexity',
        temperature: 0.3,
        maxTokens: 512,
        streamResponses: false,
        perplexityApiKey: 'px-key',
      },
      'perplexity'
    )

    const events = await collect(client.stream({
      provider: 'perplexity',
      model: 'sonar',
      messages: [{ role: 'user', content: 'hello' }],
      streamResponses: false,
    }))

    expect(events).toEqual([
      { type: 'text-delta', delta: 'Answer [1]' },
      {
        type: 'usage',
        usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
        rawUsage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      },
      { type: 'citation', citations: ['https://example.com/source'] },
      { type: 'finish', finishReason: 'stop' },
    ])
  })
})
