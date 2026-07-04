import { ChatMessage, ToolDefinition, parseErrorResponse, extractErrorMessage } from './types'
import { parseSSEStream } from './streamUtils'
import { getProviderEndpoint } from '../providers'

const NVIDIA_CHAT_COMPLETIONS_URL =
  getProviderEndpoint('nvidia', 'chatCompletionsUrl') ??
  'https://integrate.api.nvidia.com/v1/chat/completions'

export interface NvidiaResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
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
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    completion_tokens_details?: {
      reasoning_tokens?: number
      image_tokens?: number
      audio_tokens?: number
    }
  }
}

export interface NvidiaStreamChunk {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta?: {
      role?: string
      content?: string | null
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
  usage?: NvidiaResponse['usage']
}

interface NvidiaRequestBody {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  stream_options?: { include_usage?: boolean }
  temperature?: number
  max_tokens?: number
  tools?: ToolDefinition[]
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
  chat_template_kwargs?: {
    thinking_mode?: 'enabled' | 'disabled' | 'adaptive'
  }
}

function buildNvidiaRequestBody(
  model: string,
  messages: ChatMessage[],
  options?: {
    temperature?: number
    max_tokens?: number
    tools?: ToolDefinition[]
    toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
    enableThinking?: boolean
    stream?: boolean
  }
): NvidiaRequestBody {
  const requestBody: NvidiaRequestBody = {
    model,
    messages,
  }

  if (options?.stream) {
    requestBody.stream = true
    requestBody.stream_options = { include_usage: true }
  }
  if (options?.temperature !== undefined) {
    requestBody.temperature = options.temperature
  }
  if (options?.max_tokens !== undefined) {
    requestBody.max_tokens = options.max_tokens
  }
  if (options?.tools && options.tools.length > 0) {
    requestBody.tools = options.tools
    requestBody.tool_choice = options.toolChoice ?? 'auto'
  }
  requestBody.chat_template_kwargs = {
    thinking_mode: options?.enableThinking === true ? 'adaptive' : 'disabled',
  }

  return requestBody
}

async function postNvidiaCompletion(
  apiKey: string,
  requestBody: NvidiaRequestBody,
  signal?: AbortSignal
): Promise<Response> {
  if (!apiKey) {
    throw new Error('NVIDIA API Key is missing')
  }

  const response = await fetch(NVIDIA_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal,
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

    if (response.status === 429) {
      throw new Error(
        `Rate limited by NVIDIA NIM (429). Please try again in a moment. ${errorMessage}`
      )
    }

    throw new Error(errorMessage)
  }

  return response
}

export async function* streamNvidiaCompletion(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  options?: {
    temperature?: number
    max_tokens?: number
    tools?: ToolDefinition[]
    toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
    onChunk?: (chunk: NvidiaStreamChunk) => void
    signal?: AbortSignal
    enableThinking?: boolean
  }
): AsyncGenerator<NvidiaStreamChunk, void, unknown> {
  const response = await postNvidiaCompletion(
    apiKey,
    buildNvidiaRequestBody(model, messages, { ...options, stream: true }),
    options?.signal
  )

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Failed to get response reader')
  }

  yield* parseSSEStream<NvidiaStreamChunk>(reader, {
    onChunk: options?.onChunk,
    providerName: 'NVIDIA NIM',
  })
}

export async function generateNvidiaCompletion(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  options?: {
    temperature?: number
    max_tokens?: number
    tools?: ToolDefinition[]
    toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
    signal?: AbortSignal
    enableThinking?: boolean
  }
): Promise<NvidiaResponse> {
  const response = await postNvidiaCompletion(
    apiKey,
    buildNvidiaRequestBody(model, messages, options),
    options?.signal
  )
  return response.json() as Promise<NvidiaResponse>
}
