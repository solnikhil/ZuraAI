import { ChatMessage, ToolDefinition, parseErrorResponse, extractErrorMessage } from './types'
import { parseSSEStream } from './streamUtils'
import { getProviderEndpoint } from '../providers'

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

export interface OpencodeStreamChunk {
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

interface OpencodeRequestBody {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  max_completion_tokens?: number
  tools?: ToolDefinition[]
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
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
  if (!apiKey) {
    throw new Error('OpenCode Go API Key is missing')
  }

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

  const response = await fetch(OPENCODE_GO_CHAT_COMPLETIONS_URL, {
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
    const errorMessage = extractErrorMessage(errorData, errorText, response.status, response.statusText)
    throw new Error(errorMessage)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Failed to get response reader')
  }

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
  if (!apiKey) {
    throw new Error('OpenCode Go API Key is missing')
  }

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

  const response = await fetch(OPENCODE_GO_CHAT_COMPLETIONS_URL, {
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
    const errorMessage = extractErrorMessage(errorData, errorText, response.status, response.statusText)
    throw new Error(errorMessage)
  }

  return (await response.json()) as OpencodeResponse
}

export interface OpencodeModel {
  id: string
  object: string
  created?: number
  owned_by: string
}

interface OpencodeModelListResponse {
  object: string
  data: OpencodeModel[]
}

export async function fetchOpencodeModels(apiKey: string): Promise<OpencodeModel[]> {
  if (!apiKey?.trim()) {
    throw new Error('Add an OpenCode Go API key before loading the catalog.')
  }

  const response = await fetch(`${OPENCODE_GO_BASE_URL}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to fetch OpenCode Go models: ${response.status} ${errorText}`)
  }

  const data = (await response.json()) as OpencodeModelListResponse
  return data.data || []
}

const OPENCODE_MODEL_DISPLAY_NAMES: Record<string, string> = {
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
  'deepseek-v4-flash': 'DeepSeek V4 Flash',
  'kimi-k2.7': 'Kimi K2.7 Code',
  'kimi-k2.6': 'Kimi K2.6',
  'glm-5.2': 'GLM 5.2',
  'glm-5.1': 'GLM 5.1',
  'qwen3.7-plus': 'Qwen3.7 Plus',
  'qwen3.7-max': 'Qwen3.7 Max',
  'qwen3.6-plus': 'Qwen3.6 Plus',
  'minimax-m3': 'MiniMax M3',
  'minimax-m2.7': 'MiniMax M2.7',
  'mimo-v2.5': 'MiMo-V2.5',
  'mimo-v2.5-pro': 'MiMo-V2.5-Pro',
}

export function mapOpencodeModelToConfiguredModel(
  model: OpencodeModel
): import('../contexts/SettingsConfigContext').ConfiguredModel {
  const displayName =
    OPENCODE_MODEL_DISPLAY_NAMES[model.id] ??
    model.id
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())

  return {
    code: model.id,
    displayName,
    enabled: true,
    supportsToolCall: true,
    maxContext: 1048576,
    modelType: 'chat',
  }
}