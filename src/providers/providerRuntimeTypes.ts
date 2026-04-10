import type { MessageContent, ReasoningDetail, ToolDefinition } from '../services/types'
import type { ActiveProviderId } from './providerTypes'

export interface ProviderRuntimeFileAttachment {
  id: string
  name: string
  type: string
  size: number
  data: string
  mimeType: string
}

export interface NormalizedUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  thinkingTokens?: number
  cachedInputTokens?: number
  cachedOutputTokens?: number
}

export interface NormalizedToolCallDelta {
  index?: number
  id?: string
  type?: 'function'
  function?: {
    name?: string
    arguments?: string
  }
}

export type NormalizedStreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'reasoning-delta'; delta: string }
  | { type: 'reasoning-details'; details: ReasoningDetail[] }
  | { type: 'tool-call-delta'; delta: NormalizedToolCallDelta[] }
  | { type: 'file-delta'; files: ProviderRuntimeFileAttachment[] }
  | { type: 'usage'; usage: NormalizedUsage }
  | { type: 'citation'; citations: string[] }
  | { type: 'finish'; finishReason?: string | null }
  | { type: 'error'; error: Error }

export interface ProviderRuntimeStreamRequest {
  provider: ActiveProviderId
  model: string
  messages: Array<{
    role: string
    content: string | MessageContent[]
    images?: string[]
    tool_calls?: unknown[]
    thinking?: string
    reasoning?: string
    reasoning_details?: ReasoningDetail[]
  }>
  temperature?: number
  maxTokens?: number
  streamResponses?: boolean
  tools?: ToolDefinition[] | null
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  modalities?: Array<'text' | 'image'>
  reasoning?: {
    max_tokens?: number
    effort?: 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none'
    exclude?: boolean
    enabled?: boolean
  }
  imageConfig?: {
    aspect_ratio?: string
    image_size?: string
  }
  signal?: AbortSignal
}

export interface ProviderRuntimeSettings {
  temperature: number
  maxTokens: number
  streamResponses: boolean
  alibabaApiKey?: string
  fireworksApiKey?: string
  groqApiKey?: string
  ollamaUrl?: string
  openRouterDebug?: boolean
  openRouterApiKey?: string
  perplexityApiKey?: string
}
