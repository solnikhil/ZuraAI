import { ChatMessage, ToolDefinition, parseErrorResponse, extractErrorMessage } from './types'
import { parseSSEStream } from './streamUtils'
import { getProviderEndpoint } from '../providers'
import { listProviderModelsThroughMain } from './providerCatalogBridge'
import { getOpencodeModelMetadata, type OpencodeProtocol } from '../providers/opencodeModelCatalog'

interface OpencodeTextResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}

const OPENCODE_GO_BASE_URL =
  getProviderEndpoint('opencode', 'baseUrl') ?? 'https://opencode.ai/zen/go/v1'

const OPENCODE_GO_CHAT_COMPLETIONS_URL =
  getProviderEndpoint('opencode', 'chatCompletionsUrl') ??
  'https://opencode.ai/zen/go/v1/chat/completions'
const OPENCODE_GO_MESSAGES_URL = `${OPENCODE_GO_BASE_URL}/messages`

export type { OpencodeProtocol } from '../providers/opencodeModelCatalog'

export function getOpencodeProtocol(model: string): OpencodeProtocol {
  return getOpencodeModelMetadata(model)?.protocol ?? 'openai-chat-completions'
}

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

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: AnthropicContentBlock[]
}

interface AnthropicRequestBody {
  model: string
  max_tokens: number
  messages: AnthropicMessage[]
  system?: string
  stream?: boolean
  temperature?: number
  tools?: Array<{
    name: string
    description?: string
    input_schema: Record<string, unknown>
  }>
  tool_choice?: { type: 'auto' } | { type: 'tool'; name: string }
}

interface AnthropicResponse {
  id: string
  model: string
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'thinking'; thinking: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >
  stop_reason?: string | null
  usage?: { input_tokens?: number; output_tokens?: number }
}

interface AnthropicStreamEvent {
  type: string
  message?: AnthropicResponse
  index?: number
  content_block?: AnthropicResponse['content'][number]
  delta?: {
    type?: string
    text?: string
    thinking?: string
    partial_json?: string
    stop_reason?: string | null
  }
  usage?: { input_tokens?: number; output_tokens?: number }
}

function contentToText(message: ChatMessage): string {
  if (typeof message.content === 'string') return message.content
  const unsupported = message.content.find((part) => part.type !== 'text')
  if (unsupported) {
    throw new Error('This OpenCode Messages model does not support image content in ZuraAI.')
  }
  return message.content.map((part) => part.text ?? '').join('')
}

function parseAssistantToolInput(name: string, raw: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Assistant tool call ${name} contained invalid JSON arguments.`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Assistant tool call ${name} arguments must be a JSON object.`)
  }
  return parsed as Record<string, unknown>
}

function convertToAnthropicMessages(messages: ChatMessage[]): {
  system?: string
  messages: AnthropicMessage[]
} {
  const systemParts: string[] = []
  const converted: AnthropicMessage[] = []

  const append = (role: AnthropicMessage['role'], blocks: AnthropicContentBlock[]) => {
    if (blocks.length === 0) return
    const previous = converted.at(-1)
    if (previous?.role === role) previous.content.push(...blocks)
    else converted.push({ role, content: blocks })
  }

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(contentToText(message))
      continue
    }
    if (message.role === 'tool') {
      if (!message.tool_call_id) {
        throw new Error('OpenCode Messages tool results require a tool_call_id.')
      }
      append('user', [
        {
          type: 'tool_result',
          tool_use_id: message.tool_call_id,
          content: contentToText(message),
        },
      ])
      continue
    }

    const blocks: AnthropicContentBlock[] = []
    const text = contentToText(message)
    if (text) blocks.push({ type: 'text', text })
    if (message.role === 'assistant') {
      const toolCalls = (
        message as ChatMessage & {
          tool_calls?: Array<{
            id: string
            function: { name: string; arguments: string }
          }>
        }
      ).tool_calls
      for (const toolCall of toolCalls ?? []) {
        blocks.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: parseAssistantToolInput(toolCall.function.name, toolCall.function.arguments),
        })
      }
    }
    append(message.role === 'assistant' ? 'assistant' : 'user', blocks)
  }

  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    messages: converted,
  }
}

function buildAnthropicRequestBody(
  model: string,
  messages: ChatMessage[],
  options: {
    temperature?: number
    max_tokens?: number
    tools?: ToolDefinition[]
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
    stream?: boolean
  }
): AnthropicRequestBody {
  const converted = convertToAnthropicMessages(messages)
  const toolsEnabled = options.toolChoice !== 'none' && Boolean(options.tools?.length)
  return {
    model,
    max_tokens: options.max_tokens ?? 4096,
    messages: converted.messages,
    system: converted.system,
    stream: options.stream,
    temperature: options.temperature,
    tools: toolsEnabled
      ? options.tools!.map((tool) => ({
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters ?? { type: 'object', properties: {} },
        }))
      : undefined,
    tool_choice:
      toolsEnabled && typeof options.toolChoice === 'object'
        ? { type: 'tool', name: options.toolChoice.function.name }
        : toolsEnabled
          ? { type: 'auto' }
          : undefined,
  }
}

function mapAnthropicFinishReason(reason: string | null | undefined): string | null {
  if (!reason) return null
  if (reason === 'tool_use') return 'tool_calls'
  if (reason === 'max_tokens') return 'length'
  if (reason === 'end_turn' || reason === 'stop_sequence') return 'stop'
  return reason
}

function mapAnthropicResponse(response: AnthropicResponse): OpencodeResponse {
  const text = response.content
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('')
  const reasoning = response.content
    .filter(
      (block): block is Extract<typeof block, { type: 'thinking' }> => block.type === 'thinking'
    )
    .map((block) => block.thinking)
    .join('')
  const toolCalls = response.content
    .filter(
      (block): block is Extract<typeof block, { type: 'tool_use' }> => block.type === 'tool_use'
    )
    .map((block) => ({
      id: block.id,
      type: 'function' as const,
      function: { name: block.name, arguments: JSON.stringify(block.input) },
    }))
  const inputTokens = response.usage?.input_tokens ?? 0
  const outputTokens = response.usage?.output_tokens ?? 0

  return {
    id: response.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: response.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text,
          reasoning_content: reasoning || undefined,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        finish_reason: mapAnthropicFinishReason(response.stop_reason),
      },
    ],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  }
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

async function fetchOpencodeText(url: string, init: RequestInit): Promise<OpencodeTextResponse> {
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
  response: Pick<OpencodeTextResponse, 'status' | 'statusText' | 'body'>
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
): Promise<OpencodeTextResponse> {
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

async function openOpencodeStream(
  apiKey: string,
  url: string,
  requestBody: OpencodeRequestBody | AnthropicRequestBody,
  signal?: AbortSignal
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  if (!apiKey) throw new Error('OpenCode Go API Key is missing')

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(requestBody),
    signal,
  })
  if (!response.ok) {
    const body = await response.text()
    throwOpencodeError({ status: response.status, statusText: response.statusText, body })
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('OpenCode Go streaming response did not include a body.')
  return reader
}

async function* streamAnthropicOpencodeCompletion(
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
  const requestBody = buildAnthropicRequestBody(model, messages, { ...options, stream: true })
  const reader = await openOpencodeStream(
    apiKey,
    OPENCODE_GO_MESSAGES_URL,
    requestBody,
    options?.signal
  )
  let id = ''
  let responseModel = model
  let inputTokens = 0
  let outputTokens = 0
  let finishEmitted = false
  const created = Math.floor(Date.now() / 1000)

  const emit = (chunk: OpencodeStreamChunk): OpencodeStreamChunk => {
    options?.onChunk?.(chunk)
    return chunk
  }

  for await (const event of parseSSEStream<AnthropicStreamEvent>(reader, {
    providerName: 'OpenCode Go Messages',
  })) {
    if (event.type === 'message_start' && event.message) {
      id = event.message.id
      responseModel = event.message.model
      inputTokens = event.message.usage?.input_tokens ?? inputTokens
      continue
    }

    if (event.type === 'content_block_start' && event.content_block) {
      if (event.content_block.type === 'text' && event.content_block.text) {
        yield emit({
          id,
          object: 'chat.completion.chunk',
          created,
          model: responseModel,
          choices: [{ index: 0, delta: { content: event.content_block.text } }],
        })
      } else if (event.content_block.type === 'thinking' && event.content_block.thinking) {
        yield emit({
          id,
          object: 'chat.completion.chunk',
          created,
          model: responseModel,
          choices: [{ index: 0, delta: { reasoning_content: event.content_block.thinking } }],
        })
      } else if (event.content_block.type === 'tool_use') {
        const initialArguments =
          Object.keys(event.content_block.input).length > 0
            ? JSON.stringify(event.content_block.input)
            : ''
        yield emit({
          id,
          object: 'chat.completion.chunk',
          created,
          model: responseModel,
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: event.index ?? 0,
                    id: event.content_block.id,
                    type: 'function',
                    function: { name: event.content_block.name, arguments: initialArguments },
                  },
                ],
              },
            },
          ],
        })
      }
      continue
    }

    if (event.type === 'content_block_delta' && event.delta) {
      const delta = event.delta
      const normalizedDelta: OpencodeStreamChunk['choices'][number]['delta'] = {}
      if (delta.type === 'text_delta' && delta.text) normalizedDelta.content = delta.text
      if (delta.type === 'thinking_delta' && delta.thinking) {
        normalizedDelta.reasoning_content = delta.thinking
      }
      if (delta.type === 'input_json_delta' && delta.partial_json) {
        normalizedDelta.tool_calls = [
          {
            index: event.index ?? 0,
            type: 'function',
            function: { arguments: delta.partial_json },
          },
        ]
      }
      if (Object.keys(normalizedDelta).length > 0) {
        yield emit({
          id,
          object: 'chat.completion.chunk',
          created,
          model: responseModel,
          choices: [{ index: 0, delta: normalizedDelta }],
        })
      }
      continue
    }

    if (event.type === 'message_delta') {
      outputTokens = event.usage?.output_tokens ?? outputTokens
      const finishReason = mapAnthropicFinishReason(event.delta?.stop_reason)
      if (finishReason) {
        finishEmitted = true
        yield emit({
          id,
          object: 'chat.completion.chunk',
          created,
          model: responseModel,
          choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
          usage: {
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens,
          },
        })
      }
      continue
    }

    if (event.type === 'message_stop' && !finishEmitted) {
      yield emit({
        id,
        object: 'chat.completion.chunk',
        created,
        model: responseModel,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        },
      })
    }
  }
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
  if (getOpencodeProtocol(model) === 'anthropic-messages') {
    yield* streamAnthropicOpencodeCompletion(apiKey, model, messages, options)
    return
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

  const reader = await openOpencodeStream(
    apiKey,
    OPENCODE_GO_CHAT_COMPLETIONS_URL,
    requestBody,
    options?.signal
  )

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
  if (getOpencodeProtocol(model) === 'anthropic-messages') {
    if (!apiKey) throw new Error('OpenCode Go API Key is missing')
    const requestBody = buildAnthropicRequestBody(model, messages, { ...options, stream: false })
    const response = await fetchOpencodeText(OPENCODE_GO_MESSAGES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: options?.signal,
    })
    if (!response.ok) throwOpencodeError(response)
    let parsed: unknown
    try {
      parsed = JSON.parse(response.body)
    } catch {
      throw new Error('OpenCode Go Messages returned invalid JSON.')
    }
    return mapAnthropicResponse(parsed as AnthropicResponse)
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

export async function fetchOpencodeModels(
  apiKey = '',
  signal?: AbortSignal
): Promise<OpencodeModel[]> {
  const bridged = await listProviderModelsThroughMain<OpencodeModel>('opencode', signal)
  if (bridged) return bridged
  const headers: Record<string, string> = {}
  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }

  const response = await fetchOpencodeText(`${OPENCODE_GO_BASE_URL}/models`, {
    method: 'GET',
    headers,
    signal,
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
  const metadata = getOpencodeModelMetadata(model.id)
  const displayName =
    metadata?.displayName ??
    model.id.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())

  return {
    code: model.id,
    displayName,
    enabled: true,
    supportsToolCall: metadata?.supportsTools || undefined,
    supportsDeepThinking: metadata?.supportsReasoning || undefined,
    modelType: metadata?.supportsReasoning ? 'reasoning' : 'chat',
  }
}
