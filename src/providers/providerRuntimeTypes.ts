import type { ServiceAssistantMessage, ToolDefinition } from '../services/types'
import type { ProviderStreamEvent, ProviderToolCallDelta, ProviderUsage } from '@zura/provider-core'
import { emptyProviderUsage } from '@zura/provider-core'
import type { ActiveProviderId } from './providerTypes'
import type { AlibabaRegion } from '../services/alibabaEndpoints'

export type NormalizedUsage = ProviderUsage
export type NormalizedToolCallDelta = ProviderToolCallDelta
export type NormalizedStreamEvent = ProviderStreamEvent

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
  /** DeepSeek reasoning effort; only applied when enableThinking is true. */
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh'
  sessionId?: string
  signal?: AbortSignal
}

export interface ProviderRuntimeSettings {
  temperature: number
  maxTokens: number
  streamResponses: boolean
  alibabaApiKey?: string
  alibabaRegion?: AlibabaRegion
  deepseekApiKey?: string
  opencodeGoApiKey?: string
  fireworksApiKey?: string
  groqApiKey?: string
  nvidiaApiKey?: string
  ollamaUrl?: string
  openRouterDebug?: boolean
  openRouterApiKey?: string
}

export const emptyUsage = emptyProviderUsage
