import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateNvidiaCompletion, streamNvidiaCompletion } from './nvidia'

function sseResponse(events: string[]): Response {
  const encoder = new TextEncoder()
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(events.join('\n\n')))
        controller.close()
      },
    }),
  } as Response
}

describe('nvidia service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sends OpenAI-compatible chat completions with adaptive thinking', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'chatcmpl-nv',
        object: 'chat.completion',
        created: 1,
        model: 'minimaxai/minimax-m3',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }),
    } as Response)

    await generateNvidiaCompletion(
      'nvapi-key',
      'minimaxai/minimax-m3',
      [{ role: 'user', content: 'hello' }],
      {
        temperature: 0.3,
        max_tokens: 1024,
        enableThinking: true,
        tools: [{ type: 'function', function: { name: 'web_search', parameters: {} } }],
      }
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer nvapi-key',
          'Content-Type': 'application/json',
        },
      })
    )
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      model: 'minimaxai/minimax-m3',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.3,
      max_tokens: 1024,
      tools: [{ type: 'function', function: { name: 'web_search', parameters: {} } }],
      tool_choice: 'auto',
      chat_template_kwargs: { thinking_mode: 'adaptive' },
    })
  })

  it('parses streaming SSE chunks including tool calls, usage, and finish reason', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      sseResponse([
        'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"minimaxai/minimax-m3","choices":[{"index":0,"delta":{"content":"Hi","tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"web_search","arguments":"{}"}}]}}]}',
        'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"minimaxai/minimax-m3","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}',
        'data: [DONE]',
      ])
    )

    const chunks = []
    for await (const chunk of streamNvidiaCompletion('nvapi-key', 'minimaxai/minimax-m3', [
      { role: 'user', content: 'hello' },
    ])) {
      chunks.push(chunk)
    }

    expect(chunks).toHaveLength(2)
    expect(chunks[0].choices[0].delta?.content).toBe('Hi')
    expect(chunks[0].choices[0].delta?.tool_calls?.[0].function?.name).toBe('web_search')
    expect(chunks[1].usage?.total_tokens).toBe(5)
    expect(chunks[1].choices[0].finish_reason).toBe('stop')
  })

  it('sends thinking_mode disabled when enableThinking is false', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'chatcmpl-nv',
        object: 'chat.completion',
        created: 1,
        model: 'meta/llama-3.1-8b-instruct',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }),
    } as Response)

    await generateNvidiaCompletion(
      'nvapi-key',
      'meta/llama-3.1-8b-instruct',
      [{ role: 'user', content: 'hello' }],
      {
        temperature: 0.5,
        max_tokens: 512,
        enableThinking: false,
      }
    )

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      model: 'meta/llama-3.1-8b-instruct',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.5,
      max_tokens: 512,
      chat_template_kwargs: { thinking_mode: 'disabled' },
    })
  })

  it('sends thinking_mode disabled by default when enableThinking is undefined', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'chatcmpl-nv',
        object: 'chat.completion',
        created: 1,
        model: 'meta/llama-3.1-8b-instruct',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }),
    } as Response)

    await generateNvidiaCompletion(
      'nvapi-key',
      'meta/llama-3.1-8b-instruct',
      [{ role: 'user', content: 'hello' }],
      {
        temperature: 0.5,
        max_tokens: 512,
      }
    )

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      model: 'meta/llama-3.1-8b-instruct',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.5,
      max_tokens: 512,
      chat_template_kwargs: { thinking_mode: 'disabled' },
    })
  })

  it('surfaces provider errors without fallback', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => JSON.stringify({ error: { message: 'model failed' } }),
    } as Response)

    await expect(
      generateNvidiaCompletion('nvapi-key', 'minimaxai/minimax-m3', [
        { role: 'user', content: 'hello' },
      ])
    ).rejects.toThrow('500 model failed')
  })
})
