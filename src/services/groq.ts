import { ChatMessage, ToolDefinition, parseErrorResponse, extractErrorMessage } from './types'
import { parseSSEStream } from './streamUtils'
import { getProviderEndpoint } from '../providers'
import { ProviderError, parseRetryAfterMs, providerErrorCodeForStatus } from '@zura/provider-core'
import { createProviderHttpError, missingResponseBodyError } from './providerHttpError'

/**
 * Groq API Service
 * Uses OpenAI-compatible API at https://api.groq.com/openai/v1/chat/completions
 */

const GROQ_CHAT_COMPLETIONS_URL =
  getProviderEndpoint('groq', 'chatCompletionsUrl') ??
  'https://api.groq.com/openai/v1/chat/completions'

export interface GroqResponse {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    message: {
      role: string
      content: string
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: {
          name: string
          arguments: string
        }
      }>
    }
    finish_reason: string
  }[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    prompt_tokens_details?: {
      cached_tokens?: number
    }
  }
}

export interface GroqStreamChunk {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta?: {
      content?: string
      role?: string
      tool_calls?: Array<{
        index?: number
        id?: string
        type?: 'function'
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    prompt_tokens_details?: {
      cached_tokens?: number
    }
  }
}

interface GroqRequestBody {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  max_completion_tokens?: number
  tools?: ToolDefinition[]
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
}

export async function* streamGroqCompletion(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  options?: {
    temperature?: number
    max_tokens?: number
    tools?: ToolDefinition[]
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
    onChunk?: (chunk: GroqStreamChunk) => void
    signal?: AbortSignal
  }
): AsyncGenerator<GroqStreamChunk, void, unknown> {
  if (!apiKey) {
    throw new Error('Groq API Key is missing')
  }

  const requestBody: GroqRequestBody = {
    model,
    messages,
    stream: true,
  }

  if (options?.temperature !== undefined) {
    requestBody.temperature = options.temperature
  }
  if (options?.max_tokens !== undefined) {
    requestBody.max_completion_tokens = options.max_tokens
  }
  if (options?.tools && options.tools.length > 0) {
    requestBody.tools = options.tools
    requestBody.tool_choice = options.toolChoice || 'auto'
  }

  const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: options?.signal,
  })

  if (!response.ok) {
    throw await createProviderHttpError('groq', response, 'Groq request failed')
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw missingResponseBodyError('groq')
  }

  yield* parseSSEStream<GroqStreamChunk>(reader, {
    onChunk: options?.onChunk,
    providerName: 'Groq',
  })
}

export const generateGroqCompletion = async (
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  options?: {
    temperature?: number
    max_tokens?: number
    tools?: ToolDefinition[]
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
    signal?: AbortSignal
  }
): Promise<GroqResponse> => {
  if (!apiKey) {
    throw new Error('Groq API Key is missing')
  }

  const requestBody: GroqRequestBody = {
    model: model,
    messages: messages,
  }

  if (options?.temperature !== undefined) {
    requestBody.temperature = options.temperature
  }
  if (options?.max_tokens !== undefined) {
    requestBody.max_completion_tokens = options.max_tokens
  }
  if (options?.tools && options.tools.length > 0) {
    requestBody.tools = options.tools
    requestBody.tool_choice = options.toolChoice || 'auto'
  }

  const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: options?.signal,
  })

  if (!response.ok) {
    const errorText = await response.text()
    const errorData = parseErrorResponse(errorText)
    const errorMessage = extractErrorMessage(
      errorData,
      errorText,
      response.status,
      response.statusText
    )
    throw new ProviderError({
      provider: 'groq',
      code:
        errorData.error?.code === 'tool_use_failed'
          ? 'invalid_tool_call'
          : providerErrorCodeForStatus(response.status),
      message: errorMessage,
      status: response.status,
      requestId: response.headers.get('x-request-id') ?? undefined,
      retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after')),
      retryable: response.status === 429 || response.status >= 500,
      metadata:
        errorData.error?.code === 'tool_use_failed'
          ? { providerCode: 'tool_use_failed' }
          : undefined,
    })
  }

  const result = (await response.json()) as GroqResponse

  // Check for Groq-specific error fields in successful response (shouldn't happen but handle it)
  const resultWithError = result as GroqResponse & {
    error?: { message?: string }
    failed_generation?: { message?: string }
  }
  if (resultWithError.error || resultWithError.failed_generation) {
    const errorMsg =
      resultWithError.error?.message ||
      resultWithError.failed_generation?.message ||
      'Failed to call a function. Please adjust your prompt.'
    throw new Error(errorMsg)
  }

  return result
}
