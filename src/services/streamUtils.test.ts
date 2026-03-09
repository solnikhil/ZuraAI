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
  it('parses the final SSE event without a trailing newline', async () => {
    const reader = createReader([
      'data: {"id":"1","choices":[{"delta":{"content":"Hel"}}]}\n',
      'data: {"id":"2","choices":[{"delta":{"content":"lo"}}]}'
    ])

    const chunks = await collect(parseSSEStream<{
      id: string
      choices: Array<{ delta: { content: string } }>
    }>(reader))

    expect(chunks).toHaveLength(2)
    expect(chunks.map(chunk => chunk.choices[0].delta.content).join('')).toBe('Hello')
  })

  it('parses the final NDJSON chunk without a trailing newline', async () => {
    const reader = createReader([
      '{"message":{"content":"Hel"},"done":false}\n',
      '{"message":{"content":"lo"},"done":true}'
    ])

    const chunks = await collect(parseNDJSONStream<{
      message: { content: string }
      done: boolean
    }>(reader))

    expect(chunks).toHaveLength(2)
    expect(chunks.map(chunk => chunk.message.content).join('')).toBe('Hello')
    expect(chunks.at(-1)?.done).toBe(true)
  })
})
