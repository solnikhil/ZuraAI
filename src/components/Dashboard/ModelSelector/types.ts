/**
 * Type definitions for ModelSelector components
 */

import type { ActiveProviderId } from '../../../providers'

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
}

export type GroupedModels = Record<string, ModelWithProvider[]>
