import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  extractOpencodeStreamReasoningDelta,
  fetchOpencodeModels,
  generateOpencodeCompletion,
  getOpencodeProtocol,
  mapOpencodeModelToConfiguredModel,
  streamOpencodeCompletion,
} from './opencode'
import {
  getProviderDefinition,
  getProviderSettingsDefinition,
  getProviderSecretFields,
} from '../providers'

describe('extractOpencodeStreamReasoningDelta', () => {
  it('keeps continuation deltas across reasoning_content and reasoning fields', () => {
    const first = extractOpencodeStreamReasoningDelta({ reasoning_content: 'Thinking' }, '')
    expect(first).toEqual({ delta: 'Thinking', nextEmitted: 'Thinking' })

    const second = extractOpencodeStreamReasoningDelta({ reasoning: ' more' }, first!.nextEmitted)
    expect(second).toEqual({ delta: ' more', nextEmitted: 'Thinking more' })
  })

  it('drops duplicate reasoning prefixes echoed after the main reasoning stream', () => {
    const emitted = 'The user just said hello.'
    expect(extractOpencodeStreamReasoningDelta({ reasoning: 'The' }, emitted)).toBeNull()
    expect(
      extractOpencodeStreamReasoningDelta(
        { reasoning_content: 'The user just said hello.' },
        emitted
      )
    ).toBeNull()
  })
})

describe('opencode service', () => {
  it('routes each documented model family to its required protocol', () => {
    expect(getOpencodeProtocol('glm-5.2')).toBe('openai-chat-completions')
    expect(getOpencodeProtocol('minimax-m3')).toBe('anthropic-messages')
    expect(getOpencodeProtocol('qwen3.7-max')).toBe('anthropic-messages')
  })

  it('uses the explicit OpenAI-compatible behavior for unknown catalog models', () => {
    expect(getOpencodeProtocol('future-unknown-model')).toBe('openai-chat-completions')
  })

  it('maps catalog models with tool support enabled', () => {
    const configured = mapOpencodeModelToConfiguredModel({
      id: 'deepseek-v4-pro',
      object: 'model',
      owned_by: 'opencode',
    })

    expect(configured).toEqual(
      expect.objectContaining({
        code: 'deepseek-v4-pro',
        displayName: 'DeepSeek V4 Pro',
        enabled: true,
        supportsToolCall: true,
        supportsDeepThinking: true,
        modelType: 'reasoning',
      })
    )
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('posts chat completions to the documented endpoint', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 1,
        model: 'glm-5.2',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello from Go' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
      }),
    } as Response)

    const result = await generateOpencodeCompletion(
      'go-key',
      'glm-5.2',
      [{ role: 'user', content: 'hi' }],
      { temperature: 0.2, max_tokens: 32 }
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://opencode.ai/zen/go/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer go-key',
          'Content-Type': 'application/json',
        },
      })
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({
      model: 'glm-5.2',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.2,
      max_completion_tokens: 32,
    })
    expect(result.choices[0].message.content).toBe('Hello from Go')
    expect(result.usage.total_tokens).toBe(10)
  })

  it('streams SSE chunks with text, tool calls, usage, and finish reason', async () => {
    const sse = [
      'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"glm-5.2","choices":[{"index":0,"delta":{"content":"Hi"}}]}\n\n',
      'data: {"id":"2","object":"chat.completion.chunk","created":1,"model":"glm-5.2","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"web_search","arguments":"{\\"query\\":\\"zura\\"}"}}]}}]}\n\n',
      'data: {"id":"3","object":"chat.completion.chunk","created":1,"model":"glm-5.2","choices":[{"index":0,"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":5,"completion_tokens":7,"total_tokens":12}}\n\n',
      'data: [DONE]\n\n',
    ].join('')

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sse))
          controller.close()
        },
      }),
    } as Response)

    const chunks = []
    for await (const chunk of streamOpencodeCompletion(
      'go-key',
      'glm-5.2',
      [{ role: 'user', content: 'search' }],
      {
        tools: [
          {
            type: 'function',
            function: {
              name: 'web_search',
              description: 'Search',
              parameters: { type: 'object', properties: { query: { type: 'string' } } },
            },
          },
        ],
        toolChoice: 'auto',
      }
    )) {
      chunks.push(chunk)
    }

    const fetchBody = JSON.parse(
      String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.body)
    )
    expect(fetchBody.stream).toBe(true)
    expect(fetchBody.tools).toHaveLength(1)
    expect(chunks[0].choices?.[0]?.delta?.content).toBe('Hi')
    expect(chunks[1].choices?.[0]?.delta?.tool_calls?.[0]?.function?.name).toBe('web_search')
    expect(chunks[2].choices?.[0]?.finish_reason).toBe('tool_calls')
    expect(chunks[2].usage?.total_tokens).toBe(12)
  })

  it('uses the Messages protocol and maps tool calls for MiniMax models', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({
          id: 'msg_1',
          model: 'minimax-m3',
          content: [
            { type: 'text', text: 'Searching' },
            { type: 'tool_use', id: 'tool_1', name: 'web_search', input: { query: 'zura' } },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 8, output_tokens: 3 },
        }),
    } as Response)

    const result = await generateOpencodeCompletion(
      'go-key',
      'minimax-m3',
      [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'Search for Zura.' },
      ],
      {
        max_tokens: 64,
        tools: [
          {
            type: 'function',
            function: {
              name: 'web_search',
              parameters: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
              },
            },
          },
        ],
        toolChoice: { type: 'function', function: { name: 'web_search' } },
      }
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://opencode.ai/zen/go/v1/messages',
      expect.objectContaining({ method: 'POST' })
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({
      model: 'minimax-m3',
      max_tokens: 64,
      system: 'Be concise.',
      tool_choice: { type: 'tool', name: 'web_search' },
    })
    expect(body.tools[0].input_schema.required).toEqual(['query'])
    expect(result.choices[0].finish_reason).toBe('tool_calls')
    expect(result.choices[0].message.tool_calls?.[0]).toMatchObject({
      id: 'tool_1',
      function: { name: 'web_search', arguments: '{"query":"zura"}' },
    })
    expect(result.usage?.total_tokens).toBe(11)
  })

  it('streams Messages tool input incrementally without buffering the fetch response', async () => {
    const sse = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","model":"minimax-m3","content":[],"usage":{"input_tokens":5}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool_1","name":"web_search","input":{}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"query\\":\\"zura\\"}"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":4}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join('')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse.slice(0, 120)))
        controller.enqueue(new TextEncoder().encode(sse.slice(120)))
        controller.close()
      },
    })
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: stream,
      headers: new Headers(),
    } as Response)

    const chunks = []
    for await (const chunk of streamOpencodeCompletion(
      'go-key',
      'minimax-m3',
      [{ role: 'user', content: 'search' }],
      { tools: [], toolChoice: 'none' }
    )) {
      chunks.push(chunk)
    }

    expect(chunks[0].choices[0].delta?.tool_calls?.[0]).toMatchObject({
      id: 'tool_1',
      function: { name: 'web_search', arguments: '' },
    })
    expect(chunks[1].choices[0].delta?.tool_calls?.[0]?.function?.arguments).toBe(
      '{"query":"zura"}'
    )
    expect(chunks[2].choices[0].finish_reason).toBe('tool_calls')
    expect(chunks[2].usage?.total_tokens).toBe(9)
  })

  it('fetches models from the documented catalog endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          object: 'list',
          data: [{ id: 'kimi-k2.7-code', object: 'model', owned_by: 'opencode' }],
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const models = await fetchOpencodeModels()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://opencode.ai/zen/go/v1/models',
      expect.objectContaining({
        headers: {},
      })
    )
    expect(models).toHaveLength(1)
    expect(models[0].id).toBe('kimi-k2.7-code')
  })

  it('sends the OpenCode Go key for catalog requests when one is available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          object: 'list',
          data: [{ id: 'glm-5.2', object: 'model', owned_by: 'opencode' }],
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchOpencodeModels('test-key')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://opencode.ai/zen/go/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-key' },
      })
    )
  })
})

describe('opencode provider registry wiring', () => {
  it('registers endpoints, secret field, and model list key', () => {
    const definition = getProviderDefinition('opencode')
    const settings = getProviderSettingsDefinition('opencode')

    expect(definition.id).toBe('opencode')
    expect(definition.endpoints.baseUrl).toBe('https://opencode.ai/zen/go/v1')
    expect(settings?.secretKeyField).toBe('opencodeGoApiKey')
    expect(settings?.modelListField).toBe('opencodeModels')
    expect(getProviderSecretFields()).toContain('opencodeGoApiKey')
  })
})
