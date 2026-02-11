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
  provider: 'ollama' | 'perplexity' | 'openrouter' | 'gemini' | 'groq' | 'minimax'
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
export type ProviderKey = 'ollama' | 'perplexity' | 'openrouter' | 'gemini' | 'groq' | 'minimax'

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
  gemini: ModelWithProvider[]
  groq: ModelWithProvider[]
  minimax: ModelWithProvider[]
}

/**
 * Dropdown position state
 */
export interface DropdownPositionState {
  top: number
  left: number
  showAbove: boolean
}
