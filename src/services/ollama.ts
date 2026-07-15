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

export const checkOllamaStatus = async (baseUrl: string): Promise<boolean> => {
  if (typeof window !== 'undefined' && window.providerRuntime) {
    try {
      await listProviderModelsThroughMain<OllamaModel>('ollama', undefined, { ollamaUrl: baseUrl })
      return true
    } catch {
      return false
    }
  }
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}

export const listOllamaModels = async (baseUrl: string): Promise<OllamaModel[]> => {
  const bridged = await listProviderModelsThroughMain<OllamaModel>('ollama', undefined, {
    ollamaUrl: baseUrl,
  })
  if (bridged) return bridged
  const response = await fetch(`${baseUrl}/api/tags`)
  if (!response.ok) {
    throw new Error(`Failed to fetch Ollama models: ${response.status} ${response.statusText}`)
  }
  const data = (await response.json()) as { models?: OllamaModel[] }
  if (!Array.isArray(data.models)) {
    throw new Error('Ollama returned an invalid model catalog response.')
  }
  return data.models
}

const getOllamaModelContextLength = async (baseUrl: string, modelName: string): Promise<number> => {
  const response = await fetch(`${baseUrl}/api/show`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName }),
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
 * Enrich an array of basic Ollama model entries with context lengths fetched in parallel.
 */
export const enrichOllamaModelsWithContext = async (
  baseUrl: string,
  models: Array<{ code: string; displayName: string; [key: string]: unknown }>
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
  const results = await Promise.all(models.map((m) => getOllamaModelContextLength(baseUrl, m.code)))
  return models.map((m, i) => ({
    ...m,
    maxContext: results[i],
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
