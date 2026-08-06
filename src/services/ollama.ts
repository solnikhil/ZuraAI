import { parseNDJSONStream } from './streamUtils'
import type { ChatMessage, ToolDefinition } from './types'
import { listProviderModelsThroughMain } from './providerCatalogBridge'

export interface OllamaModel {
  name: string
  modified_at: string
  size: number
  digest: string
  details: {
    format: string
    family: string
    families: string[]
    parameter_size: string
    quantization_level: string
  }
}

export interface OllamaResponse {
  model: string
  created_at: string
  message: {
    role: string
    content: string
    thinking?: string
    images?: string[]
    tool_calls?: Array<{
      id?: string
      type?: 'function'
      function: { name: string; arguments: Record<string, unknown> }
    }>
  }
  done: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

/**
 * Maximum simultaneous `/api/show` requests while enriching a catalog.
 *
 * Ollama is a single local process; firing one request per model at once (a
 * large catalog can be hundreds) buries it and holds that many sockets open.
 */
const OLLAMA_SHOW_CONCURRENCY = 4

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('Aborted', 'AbortError')
  }
}

/**
 * Maps `items` through `worker` with at most `limit` in flight, preserving
 * input order in the result. Aborts stop new work from starting.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      // Fail fast on cancellation rather than draining the remaining queue.
      throwIfAborted(signal)
      results[index] = await worker(items[index], index)
    }
  })

  await Promise.all(runners)
  return results
}

export const checkOllamaStatus = async (
  baseUrl: string,
  signal?: AbortSignal
): Promise<boolean> => {
  if (typeof window !== 'undefined' && window.providerRuntime) {
    try {
      await listProviderModelsThroughMain<OllamaModel>('ollama', signal, { ollamaUrl: baseUrl })
      return true
    } catch (error) {
      // Cancellation is not an "Ollama is down" answer.
      if (signal?.aborted) throw error
      return false
    }
  }
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { method: 'HEAD', signal })
    return response.ok
  } catch (error) {
    if (signal?.aborted) throw error
    return false
  }
}

export const listOllamaModels = async (
  baseUrl: string,
  signal?: AbortSignal
): Promise<OllamaModel[]> => {
  const bridged = await listProviderModelsThroughMain<OllamaModel>('ollama', signal, {
    ollamaUrl: baseUrl,
  })
  if (bridged) return bridged
  const response = await fetch(`${baseUrl}/api/tags`, { signal })
  if (!response.ok) {
    throw new Error(`Failed to fetch Ollama models: ${response.status} ${response.statusText}`)
  }
  const data = (await response.json()) as { models?: OllamaModel[] }
  if (!Array.isArray(data.models)) {
    throw new Error('Ollama returned an invalid model catalog response.')
  }
  return data.models
}

const getOllamaModelContextLength = async (
  baseUrl: string,
  modelName: string,
  signal?: AbortSignal
): Promise<number> => {
  const response = await fetch(`${baseUrl}/api/show`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName }),
    signal,
  })
  if (!response.ok) {
    throw new Error(
      `Failed to inspect Ollama model ${modelName}: ${response.status} ${response.statusText}`
    )
  }
  const data = (await response.json()) as { model_info?: Record<string, unknown> }
  const modelInfo = data.model_info
  if (modelInfo && typeof modelInfo === 'object') {
    for (const [key, value] of Object.entries(modelInfo)) {
      if (key.endsWith('.context_length') && typeof value === 'number' && value > 0) {
        return value
      }
    }
  }
  throw new Error(`Ollama did not report a context length for ${modelName}.`)
}

/**
 * Enrich an array of basic Ollama model entries with context lengths.
 *
 * Requests run through a small bounded pool and honour `signal`, so a cancelled
 * or timed-out catalog request stops issuing work and releases its runtime
 * capacity instead of leaving hung `/api/show` calls behind.
 */
export const enrichOllamaModelsWithContext = async (
  baseUrl: string,
  models: Array<{ code: string; displayName: string; [key: string]: unknown }>,
  signal?: AbortSignal
): Promise<
  Array<{ code: string; displayName: string; maxContext: number; [key: string]: unknown }>
> => {
  if (models.every((model) => typeof model.maxContext === 'number' && model.maxContext > 0)) {
    return models as Array<{
      code: string
      displayName: string
      maxContext: number
      [key: string]: unknown
    }>
  }

  throwIfAborted(signal)

  const results = await mapWithConcurrency(
    models,
    OLLAMA_SHOW_CONCURRENCY,
    (model) => getOllamaModelContextLength(baseUrl, model.code, signal),
    signal
  )

  return models.map((model, index) => ({
    ...model,
    maxContext: results[index],
  }))
}

export interface OllamaStreamChunk {
  model: string
  created_at: string
  message?: {
    role: string
    content: string
    thinking?: string
    tool_calls?: Array<{
      id?: string
      type?: 'function'
      function?: {
        name?: string
        arguments?: Record<string, unknown>
      }
    }>
  }
  done: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

export async function* streamOllamaCompletion(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  options?: {
    temperature?: number
    num_ctx?: number
    num_predict?: number
    think?: boolean | string
    tools?: ToolDefinition[]
    onChunk?: (chunk: OllamaStreamChunk) => void
    signal?: AbortSignal
  }
): AsyncGenerator<OllamaStreamChunk, void, unknown> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...(options?.think !== undefined ? { think: options.think } : {}),
      tools: options?.tools && options.tools.length > 0 ? options.tools : undefined,
      options: {
        temperature: options?.temperature,
        num_ctx: options?.num_ctx,
        num_predict: options?.num_predict,
      },
    }),
    signal: options?.signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Ollama API Error: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Failed to get response reader')
  }

  yield* parseNDJSONStream<OllamaStreamChunk>(reader, {
    onChunk: options?.onChunk,
  })
}

export const generateOllamaCompletion = async (
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  options?: {
    temperature?: number
    num_ctx?: number // Context window size
    num_predict?: number // Maximum number of output tokens
    think?: boolean | string
    tools?: ToolDefinition[]
    signal?: AbortSignal
  }
): Promise<OllamaResponse> => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      ...(options?.think !== undefined ? { think: options.think } : {}),
      tools:
        options?.tools && Array.isArray(options.tools) && options.tools.length > 0
          ? options.tools
          : undefined,
      options: {
        temperature: options?.temperature,
        num_ctx: options?.num_ctx,
        num_predict: options?.num_predict,
      },
    }),
    signal: options?.signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Ollama API Error: ${response.status} ${response.statusText} - ${errorText}`)
  }

  return await response.json()
}
