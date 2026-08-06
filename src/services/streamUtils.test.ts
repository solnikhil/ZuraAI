import { describe, expect, it } from 'vitest'
import { parseNDJSONStream, parseSSEStream } from './streamUtils'

function createReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  }).getReader()
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const chunks: T[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

describe('streamUtils', () => {
  it('parses standards-compliant SSE events across transport chunks', async () => {
    const reader = createReader([
      'data: {"id":"1","choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"id":"2","choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: [DONE]\n\n',
    ])

    const chunks = await collect(
      parseSSEStream<{
        id: string
        choices: Array<{ delta: { content: string } }>
      }>(reader)
    )

    expect(chunks).toHaveLength(2)
    expect(chunks.map((chunk) => chunk.choices[0].delta.content).join('')).toBe('Hello')
  })

  it('parses the final SSE event without a trailing newline', async () => {
    const reader = createReader([
      'data: {"id":"1","choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"id":"2","choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}',
    ])

    const chunks = await collect(
      parseSSEStream<{
        id: string
        choices: Array<{ delta: { content: string }; finish_reason?: string }>
      }>(reader)
    )

    expect(chunks).toHaveLength(2)
    expect(chunks.map((chunk) => chunk.choices[0].delta.content).join('')).toBe('Hello')
  })

  it('surfaces malformed SSE JSON instead of silently dropping it', async () => {
    const reader = createReader(['data: {not-json}\n\n'])
    await expect(collect(parseSSEStream(reader))).rejects.toThrow('JSON')
  })

  it('parses the final NDJSON chunk without a trailing newline', async () => {
    const reader = createReader([
      '{"message":{"content":"Hel"},"done":false}\n',
      '{"message":{"content":"lo"},"done":true}',
    ])

    const chunks = await collect(
      parseNDJSONStream<{
        message: { content: string }
        done: boolean
      }>(reader)
    )

    expect(chunks).toHaveLength(2)
    expect(chunks.map((chunk) => chunk.message.content).join('')).toBe('Hello')
    expect(chunks.at(-1)?.done).toBe(true)
  })

  it('surfaces malformed NDJSON instead of silently dropping it', async () => {
    const reader = createReader(['{"done":false}\n', '{not-json}\n'])
    await expect(collect(parseNDJSONStream(reader))).rejects.toThrow('malformed NDJSON')
  })

  describe('terminal event detection', () => {
    it('throws truncation error when stream has delta content + EOF without [DONE]', async () => {
      const reader = createReader([
        'data: {"id":"1","choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"id":"2","choices":[{"delta":{"content":"lo"}}]}\n\n',
      ])

      await expect(
        collect(parseSSEStream(reader, { providerName: 'TestProvider' }))
      ).rejects.toThrow(
        'TestProvider stream ended without a terminal event (truncated, partial content received)'
      )
    })

    it('succeeds when [DONE] marker is present before EOF', async () => {
      const reader = createReader([
        'data: {"id":"1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: [DONE]\n\n',
      ])

      const chunks = await collect(
        parseSSEStream<{ id: string; choices: Array<{ delta: { content: string } }> }>(reader)
      )

      expect(chunks).toHaveLength(1)
      expect(chunks[0].choices[0].delta.content).toBe('Hello')
    })

    it('succeeds when chunk contains finish_reason before EOF (no [DONE])', async () => {
      const reader = createReader([
        'data: {"id":"1","choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n',
        'data: {"id":"2","choices":[{"delta":{"content":""},"finish_reason":"stop"}]}\n\n',
      ])

      const chunks = await collect(
        parseSSEStream<{
          id: string
          choices: Array<{ delta: { content: string }; finish_reason: string | null }>
        }>(reader)
      )

      expect(chunks).toHaveLength(2)
    })

    it('throws truncation error when EOF occurs before any output', async () => {
      const reader = createReader([])

      await expect(
        collect(parseSSEStream(reader, { providerName: 'EmptyProvider' }))
      ).rejects.toThrow('EmptyProvider stream ended without a terminal event (truncated)')
    })

    it('does not throw when requireTerminalEvent is false and EOF without [DONE]', async () => {
      const reader = createReader([
        'data: {"id":"1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
      ])

      const chunks = await collect(
        parseSSEStream<{ id: string; choices: Array<{ delta: { content: string } }> }>(reader, {
          requireTerminalEvent: false,
        })
      )

      expect(chunks).toHaveLength(1)
      expect(chunks[0].choices[0].delta.content).toBe('Hello')
    })
  })
})
