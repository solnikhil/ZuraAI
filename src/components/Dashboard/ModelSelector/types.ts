/**
 * Type definitions for ModelSelector components
 * 
 * @module ModelSelector/types
 */

import React from 'react'

/**
 * Model with provider information
 */
export interface ModelWithProvider {
  code: string
  displayName: string
  provider: 'ollama' | 'perplexity' | 'openrouter' | 'groq' | 'alibaba'
  /** Max context length in tokens (from ConfiguredModel or fallback lookup) */
  maxContext?: number
  /** Capability fields from ConfiguredModel (API-derived) */
  supportsToolCall?: boolean
  supportsVision?: boolean
  supportsDeepThinking?: boolean
  supportsWebSearch?: boolean
  supportsImageGeneration?: boolean
  supportsVideoRecognition?: boolean
}

/**
 * View mode for the model selector
 */
export type ViewMode = 'favorites' | 'all'

/**
 * Provider key type union
 */
export type ProviderKey = 'ollama' | 'perplexity' | 'openrouter' | 'groq' | 'alibaba'

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
export interface GroupedModels {
  ollama: ModelWithProvider[]
  perplexity: ModelWithProvider[]
  openrouter: ModelWithProvider[]
  groq: ModelWithProvider[]
  alibaba: ModelWithProvider[]
}

/**
 * Dropdown position state
 */
export interface DropdownPositionState {
  top: number
  left: number
  showAbove: boolean
}
