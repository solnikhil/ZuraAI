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
  provider: 'ollama' | 'perplexity' | 'openrouter' | 'gemini' | 'groq'
}

/**
 * View mode for the model selector
 */
export type ViewMode = 'favorites' | 'all'

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
}

/**
 * Dropdown position state
 */
export interface DropdownPositionState {
  top: number
  left: number
  showAbove: boolean
}
