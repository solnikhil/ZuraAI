/**
 * Type definitions for ModelSelector components
 *
 */

import React from 'react'
import type { ActiveProviderId } from '../../../providers'

/**
 * Model with provider information
 */
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

/**
 * View mode for the model selector
 */
export type ViewMode = 'favorites' | 'all'

/**
 * Responsive compact mode for model selector UI
 */
export type ModelSelectorCompactMode = 'none' | 'compact' | 'tight'

/**
 * Provider key type union
 */
export type ProviderKey =
  ActiveProviderId

/**
 * Provider configuration
 */
export interface ProviderConfig {
  key: string
  title: string
  icon: React.ReactNode
  color: string
  logo: boolean
}

/**
 * Grouped models by provider
 */
export type GroupedModels = Record<string, ModelWithProvider[]>

/**
 * Dropdown position state
 */
export interface DropdownPositionState {
  top: number
  left: number
  showAbove: boolean
}
