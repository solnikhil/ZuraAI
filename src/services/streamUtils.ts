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

    const parsePayload = (data: string): T | null => {
        try {
            const parsed = JSON.parse(data)
            const chunk = options?.onParsed ? options.onParsed(parsed) : parsed as T
            return chunk === null ? null : chunk
        } catch (e) {
            if (e instanceof Error && options?.onParsed && !(e instanceof SyntaxError)) {
                throw e
            }
            throw e
        }
    }

    const parseSingleLineEvent = (line: string): { chunks?: T[]; done?: true } | null | 'incomplete' => {
        if (line === '' || line.startsWith(':')) return null

        const separatorIndex = line.indexOf(':')
        const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line
        let value = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : ''
        if (value.startsWith(' ')) {
            value = value.slice(1)
        }

        if (field !== 'data') {
            return 'incomplete'
        }

        if (value.trim() === '[DONE]') {
            return { done: true }
        }

        try {
            const chunk = parsePayload(value)
            if (chunk === null) return null
            return { chunks: [chunk] }
        } catch (e) {
            if (e instanceof SyntaxError) {
                return 'incomplete'
            }
            throw e
        }
    }

    const parseEvent = (eventBlock: string): { chunks?: T[]; done?: true } | null => {
        if (eventBlock.trim() === '') return null

        const dataLines: string[] = []
        for (const rawLine of eventBlock.split(/\r?\n/)) {
            if (rawLine === '' || rawLine.startsWith(':')) continue

            const separatorIndex = rawLine.indexOf(':')
            const field = separatorIndex >= 0 ? rawLine.slice(0, separatorIndex) : rawLine
            let value = separatorIndex >= 0 ? rawLine.slice(separatorIndex + 1) : ''
            if (value.startsWith(' ')) {
                value = value.slice(1)
            }

            if (field === 'data') {
                dataLines.push(value)
            }
        }

        const data = dataLines.join('\n')
        if (!data) return null
        if (data.trim() === '[DONE]') {
            return { done: true }
        }

        try {
            const chunk = parsePayload(data)
            if (chunk === null) return null
            return { chunks: [chunk] }
        } catch (e) {
            // Propagate application-level errors from onParsed (e.g. OpenRouter in-stream
            // error objects) instead of silently swallowing them as parse failures.
            if (e instanceof Error && options?.onParsed && !(e instanceof SyntaxError)) {
                throw e
            }
            if (dataLines.length > 1) {
                const chunks: T[] = []
                for (const line of dataLines) {
                    if (line.trim() === '[DONE]') {
                        return { done: true }
                    }
                    try {
                        const chunk = parsePayload(line)
                        if (chunk !== null) {
                            chunks.push(chunk)
                        }
                    } catch (lineError) {
                        if (
                            lineError instanceof Error &&
                            options?.onParsed &&
                            !(lineError instanceof SyntaxError)
                        ) {
                            throw lineError
                        }
                        console.warn(`Failed to parse ${providerName} chunk:`, line)
                        return null
                    }
                }
                return chunks.length > 0 ? { chunks } : null
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
            while (true) {
                const match = buffer.match(/\r?\n\r?\n/)
                if (!match || match.index === undefined) break

                const eventBlock = buffer.slice(0, match.index)
                buffer = buffer.slice(match.index + match[0].length)
                const result = parseEvent(eventBlock)
                if (!result) continue
                if (result.done) {
                    return
                }
                for (const chunk of result.chunks || []) {
                    if (options?.onChunk) {
                        options.onChunk(chunk)
                    }
                    yield chunk
                }
            }

            while (!buffer.match(/\r?\n\r?\n/)) {
                const newlineIndex = buffer.indexOf('\n')
                if (newlineIndex < 0) break

                const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
                const result = parseSingleLineEvent(line)
                if (result === 'incomplete') {
                    break
                }

                buffer = buffer.slice(newlineIndex + 1)
                if (!result) continue
                if (result.done) {
                    return
                }
                for (const chunk of result.chunks || []) {
                    if (options?.onChunk) {
                        options.onChunk(chunk)
                    }
                    yield chunk
                }
            }
        }

        const finalEvent = buffer.trim()
        if (finalEvent) {
            const result = parseEvent(finalEvent)
            for (const chunk of result?.chunks || []) {
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
    const defaultIsDone = (chunk: T) =>
        Boolean(
            chunk &&
            typeof chunk === 'object' &&
            'done' in (chunk as Record<string, unknown>) &&
            (chunk as Record<string, unknown>).done
        )
    const isDone = options?.isDone ?? defaultIsDone

    const parseLine = (line: string): T | null => {
        if (line.trim() === '') return null

        try {
            return JSON.parse(line) as T
        } catch {
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
            const lines = buffer.split(/\r?\n/)
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
