import type {
  ReasoningDetail,
  ServiceAssistantMessage,
  ToolDefinition,
} from '../services/types'
import type { FileAttachment } from '../chat/types'
import type { ActiveProviderId } from './providerTypes'

export interface NormalizedUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  thinkingTokens?: number
  cachedInputTokens?: number
  cachedOutputTokens?: number
  cacheMissInputTokens?: number
  cacheWriteInputTokens?: number
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
  | { type: 'file-delta'; files: FileAttachment[] }
  | { type: 'usage'; usage: NormalizedUsage; rawUsage?: Record<string, unknown> }
  | { type: 'citation'; citations: string[] }
  | { type: 'finish'; finishReason?: string | null }
  | { type: 'error'; error: Error }

export interface ProviderRuntimeStreamRequest {
  provider: ActiveProviderId
  model: string
  messages: Array<
    ServiceAssistantMessage & {
      images?: string[]
      thinking?: string
    }
  >
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
  enableThinking?: boolean
  sessionId?: string
  signal?: AbortSignal
}

export interface ProviderRuntimeSettings {
  temperature: number
  maxTokens: number
  streamResponses: boolean
  alibabaApiKey?: string
  deepseekApiKey?: string
  fireworksApiKey?: string
  groqApiKey?: string
  ollamaUrl?: string
  openRouterDebug?: boolean
  openRouterApiKey?: string
  perplexityApiKey?: string
}

export const emptyUsage = (): NormalizedUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
})
