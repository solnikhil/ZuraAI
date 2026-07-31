/**
 * Shared transport for OpenAI-compatible chat-completions providers.
 *
 * Centralizes the streaming request skeleton that every OpenAI-compatible
 * provider service repeats verbatim: API-key guard, POST with Bearer auth,
 * standard error extraction, response-reader acquisition, and SSE parsing.
 *
 * Providers with a bespoke request path (OpenRouter's retry loop, DeepSeek's
 * 429 messaging) keep their own implementation intentionally.
 */

import { parseErrorResponse, extractErrorMessage } from './types'
import { parseSSEStream } from './streamUtils'

export interface OpenAICompatibleStreamRequest<TChunk> {
  /** Full chat-completions endpoint URL. */
  url: string
  /** Provider API key (guarded before the request). */
  apiKey: string
  /** Human-readable provider name, used for the SSE parser and the missing-key error. */
  providerName: string
  /** Fully-built request body (provider-specific shaping happens in the caller). */
  body: unknown
  /** Optional abort signal. */
  signal?: AbortSignal
  /** Extra headers merged over the default Authorization/Content-Type pair. */
  headers?: Record<string, string>
  /** Per-chunk callback forwarded to the SSE parser. */
  onChunk?: (chunk: TChunk) => void
}

/**
 * Issue a streaming OpenAI-compatible chat-completions request and yield parsed
 * SSE chunks. Throws with a normalized error message on non-2xx responses.
 */
export async function* streamOpenAICompatibleChat<TChunk>(
  request: OpenAICompatibleStreamRequest<TChunk>
): AsyncGenerator<TChunk, void, unknown> {
  if (!request.apiKey) {
    throw new Error(`${request.providerName} API Key is missing`)
  }

  const response = await fetch(request.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      'Content-Type': 'application/json',
      ...request.headers,
    },
    body: JSON.stringify(request.body),
    signal: request.signal,
  })

  if (!response.ok) {
    const errorText = await response.text()
    const errorData = parseErrorResponse(errorText)
    throw new Error(
      extractErrorMessage(errorData, errorText, response.status, response.statusText)
    )
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Failed to get response reader')
  }

  yield* parseSSEStream<TChunk>(reader, {
    onChunk: request.onChunk,
    providerName: request.providerName,
  })
}
