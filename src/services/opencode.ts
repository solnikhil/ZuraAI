import { ChatMessage, ToolDefinition, parseErrorResponse, extractErrorMessage } from './types'
import { parseSSEStream } from './streamUtils'
import { getProviderEndpoint } from '../providers'
import type { ProviderProxyFetchResponse } from '../electron/types'

const OPENCODE_GO_BASE_URL =
  getProviderEndpoint('opencode', 'baseUrl') ?? 'https://opencode.ai/zen/go/v1'

const OPENCODE_GO_CHAT_COMPLETIONS_URL =
  getProviderEndpoint('opencode', 'chatCompletionsUrl') ??
  'https://opencode.ai/zen/go/v1/chat/completions'

export interface OpencodeResponse {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    message: {
      role: string
      content: string | null
      reasoning?: string | null
      reasoning_content?: string | null
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: {
          name: string
          arguments: string
        }
      }>
    }
    finish_reason: string | null
  }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: {
      cached_tokens?: number
    }
    completion_tokens_details?: {
      reasoning_tokens?: number
    }
  }
}

export interface OpencodeStreamChunk {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta?: {
      content?: string | null
      role?: string
      reasoning?: string | null
      reasoning_content?: string | null
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
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: {
      cached_tokens?: number
    }
    completion_tokens_details?: {
      reasoning_tokens?: number
    }
  }
}

interface OpencodeRequestBody {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  max_completion_tokens?: number
  tools?: ToolDefinition[]
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
}

function shouldUseOpencodeProxy(): boolean {
  return typeof window !== 'undefined' && Boolean(window.providerProxy?.fetchOpencode)
}

function textToReader(text: string): ReadableStreamDefaultReader<Uint8Array> {
  const encoded = new TextEncoder().encode(text)
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded)
      controller.close()
    },
  }).getReader()
}

function normalizeHeaderRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries())
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, value]))
  }
  return { ...headers }
}

async function readResponseBody(response: Response): Promise<string> {
  if (typeof response.text === 'function') {
    return response.text()
  }

  if (typeof response.json === 'function') {
    return JSON.stringify(await response.json())
  }

  const reader = response.body?.getReader()
  if (!reader) return ''

  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }

  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const merged = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder().decode(merged)
}

async function fetchOpencodeText(
  url: string,
  init: RequestInit
): Promise<ProviderProxyFetchResponse> {
  if (shouldUseOpencodeProxy()) {
    return window.providerProxy.fetchOpencode({
      url,
      method: init.method === 'POST' ? 'POST' : 'GET',
      headers: normalizeHeaderRecord(init.headers),
      body: typeof init.body === 'string' ? init.body : undefined,
    })
  }

  const response = await fetch(url, init)
  const headers: Record<string, string> = {}
  response.headers?.forEach((value, key) => {
    headers[key] = value
  })

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers,
    body: await readResponseBody(response),
  }
}

function throwOpencodeError(
  response: Pick<ProviderProxyFetchResponse, 'status' | 'statusText' | 'body'>
): never {
  const errorData = parseErrorResponse(response.body)
  const errorMessage = extractErrorMessage(
    errorData,
    response.body,
    response.status,
    response.statusText
  )
  throw new Error(errorMessage)
}

async function postOpencodeCompletion(
  apiKey: string,
  requestBody: OpencodeRequestBody,
  signal?: AbortSignal
): Promise<ProviderProxyFetchResponse> {
  if (!apiKey) {
    throw new Error('OpenCode Go API Key is missing')
  }

  const response = await fetchOpencodeText(OPENCODE_GO_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal,
  })

  if (!response.ok) {
    throwOpencodeError(response)
  }

  return response
}

export async function* streamOpencodeCompletion(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  options?: {
    temperature?: number
    max_tokens?: number
    tools?: ToolDefinition[]
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
    onChunk?: (chunk: OpencodeStreamChunk) => void
    signal?: AbortSignal
  }
): AsyncGenerator<OpencodeStreamChunk, void, unknown> {
  const requestBody: OpencodeRequestBody = {
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

  const response = await postOpencodeCompletion(apiKey, requestBody, options?.signal)
  const reader = textToReader(response.body)

  yield* parseSSEStream<OpencodeStreamChunk>(reader, {
    onChunk: options?.onChunk,
    providerName: 'OpenCode Go',
  })
}

export async function generateOpencodeCompletion(
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
): Promise<OpencodeResponse> {
  const requestBody: OpencodeRequestBody = {
    model,
    messages,
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

  const response = await postOpencodeCompletion(apiKey, requestBody, options?.signal)
  return JSON.parse(response.body) as OpencodeResponse
}

export interface OpencodeModel {
  id: string
  object: string
  created?: number
  owned_by: string
}

interface OpencodeModelListResponse {
  object?: string
  data?: OpencodeModel[]
  models?: OpencodeModel[]
}

function parseOpencodeModelList(body: string): OpencodeModel[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new Error('OpenCode Go catalog returned an invalid response.')
  }

  const payload = parsed as OpencodeModelListResponse | OpencodeModel[]
  const models = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.models)
        ? payload.models
        : []

  return models.filter((model): model is OpencodeModel => {
    return Boolean(
      model &&
        typeof model === 'object' &&
        typeof model.id === 'string' &&
        model.id.trim().length > 0
    )
  })
}

export async function fetchOpencodeModels(apiKey = ''): Promise<OpencodeModel[]> {
  const headers: Record<string, string> = {}
  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }

  const response = await fetchOpencodeText(`${OPENCODE_GO_BASE_URL}/models`, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch OpenCode Go models: ${response.status} ${response.body}`)
  }

  const models = parseOpencodeModelList(response.body)
  if (models.length === 0) {
    throw new Error('OpenCode Go catalog did not return any models.')
  }
  return models
}

const OPENCODE_MODEL_DISPLAY_NAMES: Record<string, string> = {
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
  'deepseek-v4-flash': 'DeepSeek V4 Flash',
  'kimi-k2.7-code': 'Kimi K2.7 Code',
  'kimi-k2.6': 'Kimi K2.6',
  'kimi-k2.5': 'Kimi K2.5',
  'glm-5.2': 'GLM 5.2',
  'glm-5.1': 'GLM 5.1',
  'glm-5': 'GLM 5',
  'qwen3.7-plus': 'Qwen3.7 Plus',
  'qwen3.7-max': 'Qwen3.7 Max',
  'qwen3.6-plus': 'Qwen3.6 Plus',
  'qwen3.5-plus': 'Qwen3.5 Plus',
  'minimax-m3': 'MiniMax M3',
  'minimax-m2.7': 'MiniMax M2.7',
  'minimax-m2.5': 'MiniMax M2.5',
  'mimo-v2-pro': 'MiMo-V2-Pro',
  'mimo-v2-omni': 'MiMo-V2-Omni',
  'mimo-v2.5': 'MiMo-V2.5',
  'mimo-v2.5-pro': 'MiMo-V2.5-Pro',
  'hy3-preview': 'HY3 Preview',
}

const OPENCODE_REASONING_MODEL_IDS = new Set<string>([
  'glm-5.2',
  'glm-5.1',
  'glm-5',
  'deepseek-v4-pro',
  'deepseek-v4-flash',
  'kimi-k2.7-code',
  'kimi-k2.6',
  'kimi-k2.5',
  'qwen3.7-plus',
  'qwen3.7-max',
  'qwen3.6-plus',
  'qwen3.5-plus',
  'minimax-m3',
  'minimax-m2.7',
  'minimax-m2.5',
  'hy3-preview',
])

function isOpencodeReasoningModel(modelId: string): boolean {
  if (OPENCODE_REASONING_MODEL_IDS.has(modelId)) return true
  const lower = modelId.toLowerCase()
  return (
    lower.includes('reasoner') ||
    lower.includes('reasoning') ||
    lower.includes('-r1') ||
    lower.includes('thinking') ||
    lower.includes('pro') ||
    lower.includes('max') ||
    lower.includes('plus') ||
    lower.startsWith('kimi-') ||
    lower.startsWith('glm-') ||
    lower.startsWith('deepseek-') ||
    lower.startsWith('qwen3') ||
    lower.startsWith('minimax-') ||
    lower.startsWith('mimo-v2') ||
    lower.startsWith('hy3')
  )
}

/**
 * Normalize a single OpenCode stream delta into reasoning text, skipping stray
 * duplicate prefixes some GLM-family models echo through the legacy `reasoning`
 * field after `reasoning_content` has already finished.
 */
export function extractOpencodeStreamReasoningDelta(
  delta: OpencodeStreamChunk['choices'][number]['delta'] | undefined,
  emittedReasoning: string
): { delta: string; nextEmitted: string } | null {
  if (!delta) return null

  const reasoningContent =
    typeof delta.reasoning_content === 'string' ? delta.reasoning_content : ''
  const reasoningOnly = typeof delta.reasoning === 'string' ? delta.reasoning : ''
  const raw = reasoningContent || reasoningOnly
  if (!raw) return null

  if (
    emittedReasoning.length > 0 &&
    (raw === emittedReasoning ||
      (raw.length < emittedReasoning.length && emittedReasoning.startsWith(raw)))
  ) {
    return null
  }

  return { delta: raw, nextEmitted: emittedReasoning + raw }
}

export function mapOpencodeModelToConfiguredModel(
  model: OpencodeModel
): import('../contexts/SettingsConfigContext').ConfiguredModel {
  const displayName =
    OPENCODE_MODEL_DISPLAY_NAMES[model.id] ??
    model.id
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())

  const isReasoning = isOpencodeReasoningModel(model.id)

  return {
    code: model.id,
    displayName,
    enabled: true,
    supportsToolCall: true,
    supportsDeepThinking: isReasoning || undefined,
    maxContext: 1048576,
    modelType: isReasoning ? 'reasoning' : 'chat',
  }
}
