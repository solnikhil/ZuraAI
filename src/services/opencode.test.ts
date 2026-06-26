import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  fetchOpencodeModels,
  generateOpencodeCompletion,
  mapOpencodeModelToConfiguredModel,
  streamOpencodeCompletion,
} from './opencode'
import { getProviderDefinition, getProviderSettingsDefinition, getProviderSecretFields } from '../providers'

describe('opencode service', () => {
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
        modelType: 'chat',
      })
    )
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('posts chat completions to the documented endpoint', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 1,
        model: 'glm-5.2',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello from Go' },
          finish_reason: 'stop',
        }],
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
        tools: [{
          type: 'function',
          function: {
            name: 'web_search',
            description: 'Search',
            parameters: { type: 'object', properties: { query: { type: 'string' } } },
          },
        }],
        toolChoice: 'auto',
      }
    )) {
      chunks.push(chunk)
    }

    const fetchBody = JSON.parse(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.body))
    expect(fetchBody.stream).toBe(true)
    expect(fetchBody.tools).toHaveLength(1)
    expect(chunks[0].choices?.[0]?.delta?.content).toBe('Hi')
    expect(chunks[1].choices?.[0]?.delta?.tool_calls?.[0]?.function?.name).toBe('web_search')
    expect(chunks[2].choices?.[0]?.finish_reason).toBe('tool_calls')
    expect(chunks[2].usage?.total_tokens).toBe(12)
  })

  it('fetches models from the documented catalog endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        object: 'list',
        data: [{ id: 'glm-5.2', object: 'model', owned_by: 'opencode' }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const models = await fetchOpencodeModels('test-key')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://opencode.ai/zen/go/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-key' },
      })
    )
    expect(models).toHaveLength(1)
    expect(models[0].id).toBe('glm-5.2')
  })
})

describe('opencode credential resolution', () => {
  it('resolves opencodeGoApiKey through the provider key map without leaking placeholders', async () => {
    const { resolveProviderApiKeysForSettings, SECURE_API_KEY_PRESENT_VALUE } = await import(
      '../utils/secureApiKeys'
    )

    const fetchKey = vi.fn().mockResolvedValue('resolved-go-key')
    ;(global as unknown as { window: { secureStorage: { get: typeof fetchKey } } }).window = {
      secureStorage: { get: fetchKey },
    }

    const resolved = await resolveProviderApiKeysForSettings(
      { opencodeGoApiKey: SECURE_API_KEY_PRESENT_VALUE },
      'opencode'
    )

    expect(fetchKey).toHaveBeenCalledWith('opencodeGoApiKey')
    expect(resolved.opencodeGoApiKey).toBe('resolved-go-key')
    expect(resolved.opencodeGoApiKey).not.toContain('__zura_secure')
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