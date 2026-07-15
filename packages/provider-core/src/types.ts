export type ProviderRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ProviderTextPart {
  type: 'text'
  text: string
  cacheControl?: { type: 'ephemeral' }
}

export interface ProviderImagePart {
  type: 'image'
  url: string
  mediaType?: string
  cacheControl?: { type: 'ephemeral' }
}

export type ProviderContent = string | Array<ProviderTextPart | ProviderImagePart>

export interface ProviderToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ProviderMessage {
  role: ProviderRole
  content: ProviderContent | null
  name?: string
  toolCallId?: string
  toolCalls?: ProviderToolCall[]
  reasoning?: string
  reasoningDetails?: ProviderReasoningDetail[]
}

export interface ProviderReasoningDetail {
  id: string | null
  format: string
  index?: number
  type?:
    | 'summary'
    | 'encrypted'
    | 'text'
    | 'reasoning.summary'
    | 'reasoning.encrypted'
    | 'reasoning.text'
  text?: string
  summary?: string
  content?: string
  [key: string]: unknown
}

export interface ProviderToolDefinition {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
  strict?: boolean
}

export interface ProviderUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  thinkingTokens?: number
  cachedInputTokens?: number
  cachedOutputTokens?: number
  cacheMissInputTokens?: number
  cacheWriteInputTokens?: number
  cost?: number
  imageTokens?: number
  audioTokens?: number
  requestCount?: number
  estimated?: boolean
}

export interface ProviderToolCallDelta {
  index?: number
  id?: string
  type?: 'function'
  function?: {
    name?: string
    arguments?: string
  }
}

export interface ProviderFile {
  id: string
  name: string
  type: string
  size: number
  mimeType: string
  data: string
}

export type ProviderStreamEvent =
  | {
      type: 'text-delta'
      delta: string
      smoothing?: { sourceLength: number; pieceIndex: number; pieceCount: number }
    }
  | { type: 'reasoning-delta'; delta: string }
  | { type: 'reasoning-details'; details: ProviderReasoningDetail[] }
  | { type: 'tool-call-delta'; delta: ProviderToolCallDelta[] }
  | { type: 'file-delta'; files: ProviderFile[] }
  | { type: 'usage'; usage: ProviderUsage; rawUsage?: Record<string, unknown> }
  | { type: 'citation'; citations: string[] }
  | { type: 'finish'; finishReason?: string | null }
  | { type: 'error'; error: Error }

export interface ProviderGenerateRequest {
  model: string
  messages: ProviderMessage[]
  temperature?: number
  maxOutputTokens?: number
  tools?: ProviderToolDefinition[]
  toolChoice?: 'auto' | 'none' | 'required' | { name: string }
  signal?: AbortSignal
  metadata?: Record<string, unknown>
}

export interface ProviderGenerateResult {
  message: ProviderMessage
  usage: ProviderUsage
  finishReason?: string | null
  rawMetadata?: Record<string, unknown>
}

export interface ProviderModelCapabilities {
  streaming: boolean
  tools: boolean
  toolStreaming: boolean
  vision: boolean
  reasoning: boolean
  imageGeneration: boolean
  structuredOutput: boolean
}

export interface ProviderModel {
  id: string
  displayName: string
  contextWindow?: number
  capabilities: ProviderModelCapabilities
  metadata?: Record<string, unknown>
}

export interface ProviderAdapterContext {
  apiKey?: string
  baseUrl?: string
  fetch: typeof globalThis.fetch
  requestTimeoutMs: number
  headers?: Record<string, string>
}

export interface ProviderAdapter {
  readonly id: string
  listModels(context: ProviderAdapterContext, signal?: AbortSignal): Promise<ProviderModel[]>
  capabilities(model: ProviderModel): ProviderModelCapabilities
  generate(
    context: ProviderAdapterContext,
    request: ProviderGenerateRequest
  ): Promise<ProviderGenerateResult>
  stream(
    context: ProviderAdapterContext,
    request: ProviderGenerateRequest
  ): AsyncIterable<ProviderStreamEvent>
}
