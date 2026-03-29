import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  streamOpenRouterCompletion: vi.fn(),
  generateOpenRouterCompletion: vi.fn(),
  streamGroqCompletion: vi.fn(),
  generateGroqCompletion: vi.fn(),
  streamAlibabaCompletion: vi.fn(),
  generateAlibabaCompletion: vi.fn(),
  streamFireworksCompletion: vi.fn(),
  generateFireworksCompletion: vi.fn(),
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

vi.mock('../../../../../services/fireworks', () => ({
  streamFireworksCompletion: mocks.streamFireworksCompletion,
  generateFireworksCompletion: mocks.generateFireworksCompletion,
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
  })

  it('normalizes OpenRouter streaming events into provider-neutral deltas', async () => {
    mocks.streamOpenRouterCompletion.mockImplementation(async function* () {
      yield {
        choices: [{
          delta: {
            content: 'Hi',
            reasoning: 'Think',
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
          completion_tokens_details: { reasoning_tokens: 2 },
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
        },
      },
      { type: 'finish', finishReason: 'tool_calls' },
    ])
  })

  it('falls back to non-streaming Ollama completion and forwards abort signals', async () => {
    const signal = new AbortController().signal
    mocks.streamOllamaCompletion.mockImplementation(async function* () {
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
      { type: 'usage', usage: { inputTokens: 7, outputTokens: 5, totalTokens: 12 } },
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
      { type: 'usage', usage: { inputTokens: 9, outputTokens: 5, totalTokens: 14 } },
      { type: 'finish', finishReason: 'tool_calls' },
    ])
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
      { type: 'usage', usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } },
      { type: 'citation', citations: ['https://example.com/source'] },
      { type: 'finish', finishReason: 'stop' },
    ])
  })
})
