import { createParser } from 'eventsource-parser'

const MAX_SSE_BUFFER_CHARS = 16 * 1024 * 1024

/** Parse standards-compliant SSE without repairing, concatenating, or dropping malformed events. */
export async function* parseSSEStream<T>(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  options?: {
    onChunk?: (chunk: T) => void
    onParsed?: (parsed: unknown) => T | null
    providerName?: string
  }
): AsyncGenerator<T, void, unknown> {
  const decoder = new TextDecoder()
  const pending: T[] = []
  let done = false
  let parserFailure: Error | undefined
  const providerName = options?.providerName ?? 'SSE'

  const parser = createParser({
    maxBufferSize: MAX_SSE_BUFFER_CHARS,
    onEvent(event) {
      if (event.data.trim() === '[DONE]') {
        done = true
        return
      }
      try {
        const parsed = JSON.parse(event.data) as unknown
        const chunk = options?.onParsed ? options.onParsed(parsed) : (parsed as T)
        if (chunk !== null) pending.push(chunk)
      } catch (error) {
        parserFailure =
          error instanceof Error
            ? error
            : new Error(`${providerName} returned an invalid SSE event.`)
      }
    },
    onError(error) {
      parserFailure = new Error(`${providerName} returned malformed SSE: ${error.message}`, {
        cause: error,
      })
    },
  })

  const flush = function* (): Generator<T> {
    while (pending.length > 0) {
      const chunk = pending.shift()!
      options?.onChunk?.(chunk)
      yield chunk
    }
  }

  try {
    while (!done) {
      const { done: streamDone, value } = await reader.read()
      if (streamDone) {
        const finalText = decoder.decode()
        if (finalText) parser.feed(finalText)
        // Dispatch a standards-valid final event even when the transport closes
        // without the optional trailing blank line.
        parser.feed('\n\n')
        parser.reset()
        if (parserFailure) throw parserFailure
        yield* flush()
        return
      }

      parser.feed(decoder.decode(value, { stream: true }))
      if (parserFailure) throw parserFailure
      yield* flush()
    }
  } finally {
    reader.releaseLock()
  }
}

/** Parse newline-delimited JSON and fail visibly on a malformed record. */
export async function* parseNDJSONStream<T>(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  options?: {
    onChunk?: (chunk: T) => void
    isDone?: (chunk: T) => boolean
  }
): AsyncGenerator<T, void, unknown> {
  const decoder = new TextDecoder()
  let buffer = ''
  const isDone =
    options?.isDone ??
    ((chunk: T) =>
      Boolean(
        chunk &&
        typeof chunk === 'object' &&
        'done' in (chunk as Record<string, unknown>) &&
        (chunk as Record<string, unknown>).done
      ))

  const parseLine = (line: string): T | null => {
    if (!line.trim()) return null
    try {
      return JSON.parse(line) as T
    } catch (error) {
      throw new Error('Provider returned a malformed NDJSON record.', { cause: error })
    }
  }

  const emit = function* (line: string): Generator<T> {
    const chunk = parseLine(line)
    if (chunk === null) return
    options?.onChunk?.(chunk)
    yield chunk
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        buffer += decoder.decode()
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        for (const chunk of emit(line)) {
          yield chunk
          if (isDone(chunk)) return
        }
      }
    }

    for (const chunk of emit(buffer)) yield chunk
  } finally {
    reader.releaseLock()
  }
}
