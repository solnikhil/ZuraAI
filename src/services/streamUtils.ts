import { createParser } from 'eventsource-parser'

const MAX_SSE_BUFFER_CHARS = 16 * 1024 * 1024

/** Parse standards-compliant SSE without repairing, concatenating, or dropping malformed events. */
export async function* parseSSEStream<T>(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  options?: {
    onChunk?: (chunk: T) => void
    onParsed?: (parsed: unknown) => T | null
    providerName?: string
    /** When true (default), throws if the stream ends without a [DONE] marker or finish_reason. */
    requireTerminalEvent?: boolean
  }
): AsyncGenerator<T, void, unknown> {
  const decoder = new TextDecoder()
  const pending: T[] = []
  let done = false
  let parserFailure: Error | undefined
  let receivedTerminalEvent = false
  let receivedContent = false
  const providerName = options?.providerName ?? 'SSE'
  const requireTerminalEvent = options?.requireTerminalEvent !== false

  const parser = createParser({
    maxBufferSize: MAX_SSE_BUFFER_CHARS,
    onEvent(event) {
      if (event.data.trim() === '[DONE]') {
        done = true
        receivedTerminalEvent = true
        return
      }
      try {
        const parsed = JSON.parse(event.data) as unknown
        if (hasFinishReason(parsed)) {
          receivedTerminalEvent = true
        }
        const chunk = options?.onParsed ? options.onParsed(parsed) : (parsed as T)
        if (chunk !== null) {
          pending.push(chunk)
          receivedContent = true
        }
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

        if (requireTerminalEvent && !receivedTerminalEvent) {
          throw new Error(
            `${providerName} stream ended without a terminal event (truncated${receivedContent ? ', partial content received' : ''})`
          )
        }
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

/** Check whether a parsed SSE payload contains a terminal signal (finish_reason or stop_reason). */
function hasFinishReason(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false
  const record = parsed as Record<string, unknown>

  // OpenAI-style: choices[].finish_reason
  const choices = record.choices
  if (Array.isArray(choices)) {
    const found = choices.some(
      (choice) =>
        choice &&
        typeof choice === 'object' &&
        'finish_reason' in (choice as Record<string, unknown>) &&
        (choice as Record<string, unknown>).finish_reason != null
    )
    if (found) return true
  }

  // Anthropic/Messages-style: type === 'message_stop' or delta.stop_reason
  if (record.type === 'message_stop') return true
  if (record.type === 'message_delta') {
    const delta = record.delta
    if (delta && typeof delta === 'object' && (delta as Record<string, unknown>).stop_reason) {
      return true
    }
  }

  return false
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
