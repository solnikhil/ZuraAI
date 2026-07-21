/**
 * Type definitions for ModelSelector components
 */

import type { ActiveProviderId } from '../../../providers'
import type { DeepSeekReasoningEffort } from '../../../contexts/SettingsConfigContext'

export interface ModelWithProvider {
  code: string
  displayName: string
  provider: ActiveProviderId
  /** Max context length in tokens (from ConfiguredModel or fallback lookup) */
  maxContext?: number
  /** Capability fields from ConfiguredModel (API-derived) */
  supportsToolCall?: boolean
  supportsVision?: boolean
  supportsDeepThinking?: boolean
  supportsWebSearch?: boolean
  supportsImageGeneration?: boolean
  supportsVideoRecognition?: boolean
  openRouterReasoningDetected?: boolean
  supportedReasoningEfforts?: DeepSeekReasoningEffort[]
}

export type GroupedModels = Record<string, ModelWithProvider[]>
