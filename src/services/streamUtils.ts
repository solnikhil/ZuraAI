/**
 * Shared SSE (Server-Sent Events) and NDJSON stream parsing utilities.
 * 
 * These eliminate ~40 duplicated lines across groq.ts, alibaba.ts,
 * openrouter.ts, perplexity.ts, and ollama.ts.
 */

/**
 * Parse an SSE stream (data: prefix, [DONE] sentinel) into typed chunks.
 * Used by OpenRouter, Groq, Alibaba, and Perplexity providers.
 * 
 * @param reader - ReadableStream reader from fetch response.body
 * @param options.onChunk - Optional callback invoked for each parsed chunk
 * @param options.onParsed - Optional hook for post-parse validation/transformation.
 *   Throw to abort the stream. Return null to skip the chunk. Return the chunk to yield it.
 * @param options.providerName - Provider name for console.warn messages (default: 'SSE')
 */
export async function* parseSSEStream<T>(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    options?: {
        onChunk?: (chunk: T) => void
        onParsed?: (parsed: unknown) => T | null
        providerName?: string
    }
): AsyncGenerator<T, void, unknown> {
    const decoder = new TextDecoder()
    let buffer = ''
    const providerName = options?.providerName || 'SSE'

    const parseLine = (line: string): { chunk?: T; done?: true } | null => {
        if (line.trim() === '') return null
        if (!line.startsWith('data: ')) return null

        const data = line.slice(6)
        if (data.trim() === '[DONE]') {
            return { done: true }
        }

        try {
            const parsed = JSON.parse(data)
            const chunk = options?.onParsed ? options.onParsed(parsed) : parsed as T
            if (chunk === null) return null
            return { chunk }
        } catch (e) {
            if (e instanceof Error && options?.onParsed && !(e instanceof SyntaxError)) {
                throw e
            }
            console.warn(`Failed to parse ${providerName} chunk:`, data)
            return null
        }
    }

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) {
                buffer += decoder.decode()
                break
            }

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer

            for (const line of lines) {
                const result = parseLine(line)
                if (!result) continue
                if (result.done) {
                    return
                }
                if (result.chunk !== undefined) {
                    if (options?.onChunk) {
                        options.onChunk(result.chunk)
                    }
                    yield result.chunk
                }
            }
        }

        const finalLine = buffer.trim()
        if (finalLine) {
            const result = parseLine(finalLine)
            if (result?.chunk !== undefined) {
                if (options?.onChunk) {
                    options.onChunk(result.chunk)
                }
                yield result.chunk
            }
        }
    } finally {
        reader.releaseLock()
    }
}

/**
 * Parse an NDJSON stream (newline-delimited JSON, no prefix, chunk.done sentinel).
 * Used by Ollama.
 * 
 * @param reader - ReadableStream reader from fetch response.body
 * @param options.onChunk - Optional callback invoked for each parsed chunk
 * @param options.isDone - Predicate to detect the terminal chunk (default: chunk => chunk.done)
 */
export async function* parseNDJSONStream<T>(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    options?: {
        onChunk?: (chunk: T) => void
        isDone?: (chunk: T) => boolean
    }
): AsyncGenerator<T, void, unknown> {
    const decoder = new TextDecoder()
    let buffer = ''
    const isDone = options?.isDone ?? ((chunk: any) => chunk.done)

    const parseLine = (line: string): T | null => {
        if (line.trim() === '') return null

        try {
            return JSON.parse(line) as T
        } catch (e) {
            console.warn('Failed to parse NDJSON chunk:', line)
            return null
        }
    }

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) {
                buffer += decoder.decode()
                break
            }

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer

            for (const line of lines) {
                const chunk = parseLine(line)
                if (chunk === null) continue

                if (options?.onChunk) {
                    options.onChunk(chunk)
                }
                yield chunk
                if (isDone(chunk)) {
                    return
                }
            }
        }

        const finalLine = buffer.trim()
        if (finalLine) {
            const chunk = parseLine(finalLine)
            if (chunk !== null) {
                if (options?.onChunk) {
                    options.onChunk(chunk)
                }
                yield chunk
            }
        }
    } finally {
        reader.releaseLock()
    }
}
