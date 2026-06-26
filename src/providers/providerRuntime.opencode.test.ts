import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  streamOpencodeCompletion: vi.fn(),
  generateOpencodeCompletion: vi.fn(),
}))

vi.mock('../services/opencode', () => ({
  streamOpencodeCompletion: mocks.streamOpencodeCompletion,
  generateOpencodeCompletion: mocks.generateOpencodeCompletion,
}))

import { streamProviderEvents } from './providerRuntime'
import type { NormalizedStreamEvent } from './providerRuntimeTypes'

async function collectEvents(
  settings: Parameters<typeof streamProviderEvents>[0],
  request: Parameters<typeof streamProviderEvents>[1]
): Promise<NormalizedStreamEvent[]> {
  const events: NormalizedStreamEvent[] = []
  for await (const event of streamProviderEvents(settings, request)) {
    events.push(event)
  }
  return events
}

describe('providerRuntime opencode dispatch', () => {
  beforeEach(() => {
    mocks.streamOpencodeCompletion.mockReset()
    mocks.generateOpencodeCompletion.mockReset()
  })

  it('emits text, tool-call, usage, and finish events from the opencode stream branch', async () => {
    mocks.streamOpencodeCompletion.mockImplementation(async function* (
      _apiKey: string,
      model: string
    ) {
      expect(model).toBe('glm-5.2')
      yield {
        id: 'chunk-1',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'glm-5.2',
        choices: [{ index: 0, delta: { content: 'Hello' } }],
      }
      yield {
        id: 'chunk-2',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'glm-5.2',
        choices: [{
          index: 0,
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
        id: 'chunk-3',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'glm-5.2',
        choices: [{ index: 0, finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
      }
    })

    const events = await collectEvents(
      {
        temperature: 0.7,
        maxTokens: 1024,
        streamResponses: true,
        opencodeGoApiKey: 'go-key',
      },
      {
        provider: 'opencode',
        model: 'opencode-go/glm-5.2',
        messages: [{ role: 'user', content: 'search zura' }],
        streamResponses: true,
        tools: [{
          type: 'function',
          function: {
            name: 'web_search',
            description: 'Search the web',
            parameters: { type: 'object', properties: { query: { type: 'string' } } },
          },
        }],
      }
    )

    expect(mocks.streamOpencodeCompletion).toHaveBeenCalledWith(
      'go-key',
      'glm-5.2',
      [{ role: 'user', content: 'search zura' }],
      expect.objectContaining({
        tools: expect.any(Array),
        toolChoice: undefined,
      })
    )

    expect(events.some((event) => event.type === 'text-delta' && event.delta.length > 0)).toBe(true)
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
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
        thinkingTokens: undefined,
        cachedInputTokens: undefined,
        cachedOutputTokens: undefined,
        cacheMissInputTokens: undefined,
        cacheWriteInputTokens: undefined,
      },
      rawUsage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
    })
    expect(events).toContainEqual({ type: 'finish', finishReason: 'tool_calls' })
  })

  it('emits normalized completion events from the opencode non-stream branch', async () => {
    mocks.generateOpencodeCompletion.mockResolvedValue({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1,
      model: 'deepseek-v4-pro',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Done',
          tool_calls: [{
            id: 'call_2',
            type: 'function',
            function: { name: 'web_search', arguments: '{"query":"done"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
    })

    const events = await collectEvents(
      {
        temperature: 0.7,
        maxTokens: 512,
        streamResponses: false,
        opencodeGoApiKey: 'go-key',
      },
      {
        provider: 'opencode',
        model: 'deepseek-v4-pro',
        messages: [{ role: 'user', content: 'ping' }],
        streamResponses: false,
      }
    )

    expect(mocks.generateOpencodeCompletion).toHaveBeenCalledWith(
      'go-key',
      'deepseek-v4-pro',
      [{ role: 'user', content: 'ping' }],
      expect.objectContaining({ signal: undefined })
    )
    expect(events.some((event) => event.type === 'text-delta')).toBe(true)
    expect(events).toContainEqual({ type: 'finish', finishReason: 'tool_calls' })
    expect(events).toContainEqual({
      type: 'usage',
      usage: expect.objectContaining({
        inputTokens: 3,
        outputTokens: 5,
        totalTokens: 8,
      }),
      rawUsage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
    })
  })
})