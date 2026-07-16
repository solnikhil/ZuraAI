import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateOllamaCompletion, streamOllamaCompletion } from './ollama'

function requestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
  return JSON.parse(String(init?.body)) as Record<string, unknown>
}

describe('Ollama request shaping', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps the output-token limit to num_predict for non-streaming chat', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'local-test-model',
          created_at: '2026-01-01T00:00:00Z',
          message: { role: 'assistant', content: 'ok' },
          done: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await generateOllamaCompletion(
      'http://127.0.0.1:11434',
      'local-test-model',
      [{ role: 'user', content: 'hello' }],
      { num_predict: 321 }
    )

    expect(requestBody(fetchMock)).toMatchObject({ options: { num_predict: 321 } })
  })

  it('maps the output-token limit to num_predict for streaming chat', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `${JSON.stringify({
          model: 'local-test-model',
          created_at: '2026-01-01T00:00:00Z',
          message: { role: 'assistant', content: 'ok' },
          done: true,
        })}\n`,
        { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    for await (const _chunk of streamOllamaCompletion(
      'http://127.0.0.1:11434',
      'local-test-model',
      [{ role: 'user', content: 'hello' }],
      { num_predict: 654 }
    )) {
      // Consume the stream so request and parser behavior are both exercised.
    }

    expect(requestBody(fetchMock)).toMatchObject({ options: { num_predict: 654 } })
  })
})
