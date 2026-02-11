/**
 * Centralized model utilities for Zura AI
 * Consolidates duplicate model-related functions from Settings.tsx and ModelSelector.tsx
 * 
 * @module modelUtils
 * Requirements: 4.1
 */

import React from 'react'
import {
  MessageSquare,
  Sparkles,
  Box,
  Cpu,
  Zap,
  Brain,
  Globe,
  Wrench,
  Eye,
  Image as ImageIcon,
  Video,
} from 'lucide-react'

/**
 * Model information interface
 */
export interface ModelInfo {
  code: string
  displayName: string
  provider: 'ollama' | 'perplexity' | 'openrouter' | 'gemini' | 'groq' | 'minimax'
}

/**
 * Model attributes returned by getModelAttributes
 */
export interface ModelAttributes {
  icon: React.ReactNode
  color: string
  badge?: React.ReactNode
}

/**
 * Model capability types
 */
export type ModelCapability =
  | 'vision'
  | 'code'
  | 'reasoning'
  | 'fast'
  | 'online'
  | 'deep-research'
  | 'tool-call'
  | 'deep-thinking'
  | 'web-search'
  | 'image-gen'
  | 'video-rec'

/**
 * Model with capability fields (from ConfiguredModel)
 */
export interface ModelWithCapabilities {
  supportsToolCall?: boolean
  supportsVision?: boolean
  supportsDeepThinking?: boolean
  supportsWebSearch?: boolean
  supportsImageGeneration?: boolean
  supportsVideoRecognition?: boolean
}

/**
 * Capability badge configuration
 */
export interface CapabilityBadge {
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  key: keyof ModelWithCapabilities
}

/**
 * Capability badge definitions
 */
export const CAPABILITY_BADGES: Record<string, CapabilityBadge> = {
  toolCall: { label: 'Tool Calling', icon: Wrench, key: 'supportsToolCall' },
  vision: { label: 'Vision', icon: Eye, key: 'supportsVision' },
  deepThinking: {
    label: 'Deep Thinking',
    icon: Brain,
    key: 'supportsDeepThinking',
  },
  webSearch: { label: 'Web Search', icon: Globe, key: 'supportsWebSearch' },
  imageGen: {
    label: 'Image Gen',
    icon: ImageIcon,
    key: 'supportsImageGeneration',
  },
  videoRec: {
    label: 'Video',
    icon: Video,
    key: 'supportsVideoRecognition',
  },
}

/**
 * Get capabilities from model. Prefers explicit ConfiguredModel fields over heuristics.
 *
 * @param model - Model with optional capability fields
 * @returns Array of capability keys that are enabled
 */
export function getCapabilitiesFromModel(
  model: ModelWithCapabilities & { code?: string; displayName?: string }
): string[] {
  const capabilities: string[] = []

  if (model.supportsToolCall) capabilities.push('toolCall')
  if (model.supportsVision) capabilities.push('vision')
  if (model.supportsDeepThinking) capabilities.push('deepThinking')
  if (model.supportsWebSearch) capabilities.push('webSearch')
  if (model.supportsImageGeneration) capabilities.push('imageGen')
  if (model.supportsVideoRecognition) capabilities.push('videoRec')

  if (
    capabilities.length === 0 &&
    model.code != null &&
    model.displayName != null
  ) {
    const heuristicCaps = detectModelCapabilities(
      model.code + ' ' + model.displayName
    )
    if (heuristicCaps.includes('vision')) capabilities.push('vision')
    if (heuristicCaps.includes('code')) capabilities.push('toolCall')
    if (heuristicCaps.includes('reasoning')) capabilities.push('deepThinking')
    if (heuristicCaps.includes('online')) capabilities.push('webSearch')
  }

  return capabilities
}

/**
 * Model family detection patterns
 */
const MODEL_FAMILIES = {
  gemini: { color: '#4dabf7', icon: Sparkles },
  claude: { color: '#da7756', icon: Box },
  gpt: { color: '#10a37f', icon: Cpu },
  openai: { color: '#10a37f', icon: Cpu },
  mistral: { color: '#fcc419', icon: Zap },
  llama: { color: '#339af0', icon: Brain },
  minimax: { color: '#6366f1', icon: Brain },
} as const

/**
 * Badge type patterns
 */
const BADGE_PATTERNS = {
  fast: ['flash', 'turbo', 'instant'],
  pro: ['pro', 'plus', 'opus'],
  reasoning: ['reasoning'],
} as const

/**
 * Detect model family from model code or name
 * @param modelCode - The model code
 * @param modelName - The model display name
 * @returns The detected model family key or null
 */
function detectModelFamily(modelCode: string, modelName: string): keyof typeof MODEL_FAMILIES | null {
  const code = modelCode.toLowerCase()
  const name = modelName.toLowerCase()

  for (const family of Object.keys(MODEL_FAMILIES) as (keyof typeof MODEL_FAMILIES)[]) {
    if (code.includes(family) || name.includes(family)) {
      return family
    }
  }
  return null
}

/**
 * Get visual attributes for a model based on its name/code
 * Centralizes icon detection, color assignment, and capability badges
 * 
 * @param model - Model object with code and displayName
 * @param options - Optional configuration
 * @returns ModelAttributes with icon, color, and optional badge
 */
export function getModelAttributes(
  model: { code: string; displayName: string },
  options: { iconSize?: number; badgeSize?: number } = {}
): ModelAttributes {
  const { iconSize = 16, badgeSize = 10 } = options
  const code = model.code.toLowerCase()
  const name = model.displayName.toLowerCase()

  // Default values
  let icon: React.ReactNode = React.createElement(MessageSquare, { size: iconSize })
  let color = '#b0b0b0'
  let badge: React.ReactNode = null

  // Detect model family for icon and color
  const family = detectModelFamily(code, name)
  if (family) {
    const familyConfig = MODEL_FAMILIES[family]
    icon = React.createElement(familyConfig.icon, { size: iconSize })
    color = familyConfig.color
  }

  // Detect badge type
  if (BADGE_PATTERNS.fast.some(p => name.includes(p))) {
    badge = React.createElement(Zap, { size: badgeSize, color: '#fcc419', fill: 'currentColor' })
  } else if (BADGE_PATTERNS.pro.some(p => name.includes(p))) {
    badge = React.createElement(Sparkles, { size: badgeSize, color: '#da7756', fill: 'currentColor' })
  } else if (BADGE_PATTERNS.reasoning.some(p => name.includes(p) || code.includes(p))) {
    badge = React.createElement(Brain, { size: badgeSize, color: '#be4bdb', fill: 'currentColor' })
  }

  // Deep Research badge - shown for models with deep-research in name/code
  if (name.includes('deep research') || code.includes('deep-research')) {
    badge = React.createElement('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '4px',
        padding: '1px 4px',
        fontSize: '0.6rem',
        fontWeight: 600,
        color: '#fff'
      }
    },
      React.createElement(Globe, { size: 8 }),
      React.createElement('span', null, 'Deep Research')
    )
  }

  // Online/Web Search badge - shown for models with :online variant
  if (code.includes(':online')) {
    badge = React.createElement('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        borderRadius: '4px',
        padding: '1px 4px',
        fontSize: '0.6rem',
        fontWeight: 600,
        color: '#fff'
      }
    },
      React.createElement(Globe, { size: 8 }),
      React.createElement('span', null, 'Online')
    )
  }

  return { icon, color, badge }
}

/**
 * Get the appropriate icon component for a model
 * Simplified version that returns just the icon
 * 
 * @param modelName - The model name or code
 * @param size - Icon size (default: 16)
 * @returns React node with the appropriate icon
 */
export function getModelIcon(modelName: string, size: number = 16): React.ReactNode {
  const name = modelName.toLowerCase()

  const family = detectModelFamily(name, name)
  if (family) {
    return React.createElement(MODEL_FAMILIES[family].icon, { size })
  }

  return React.createElement(MessageSquare, { size })
}

/**
 * Get the color associated with a model
 * 
 * @param modelName - The model name or code
 * @returns Hex color string
 */
export function getModelColor(modelName: string): string {
  const name = modelName.toLowerCase()

  const family = detectModelFamily(name, name)
  if (family) {
    return MODEL_FAMILIES[family].color
  }

  return '#b0b0b0'
}

/**
 * Detect model capabilities from name
 * 
 * @param modelName - The model name or code
 * @returns Array of detected capabilities
 */
export function detectModelCapabilities(modelName: string): ModelCapability[] {
  const name = modelName.toLowerCase()
  const capabilities: ModelCapability[] = []

  // Vision capability - detect multimodal/image-capable models
  if (
    name.includes('vision') ||
    name.includes('4o') ||
    name.includes('pro-vision') ||
    name.includes('gemini') ||  // All Gemini models support vision
    name.includes('claude-3') || // Claude 3 models support vision
    name.includes('claude-sonnet') ||
    name.includes('claude-opus') ||
    name.includes('gpt-4') ||  // GPT-4 family generally supports vision
    name.includes('image') ||
    name.includes('multimodal')
  ) {
    capabilities.push('vision')
  }

  // Code/Function calling capability
  if (
    name.includes('code') ||
    name.includes('codestral') ||
    name.includes('coder') ||
    name.includes('gpt-4') ||
    name.includes('gpt-3.5') ||
    name.includes('claude') ||
    name.includes('gemini') ||
    name.includes('mistral') ||
    name.includes('llama-3') ||
    name.includes('minimax')
  ) {
    capabilities.push('code')
  }

  // Reasoning capability
  if (name.includes('reasoning') || name.includes('o1') || name.includes('think') || name.includes('r1') || name.includes('m2.1')) {
    capabilities.push('reasoning')
  }

  // Fast/turbo models
  if (name.includes('flash') || name.includes('turbo') || name.includes('instant') || name.includes('fast') || name.includes('lite')) {
    capabilities.push('fast')
  }

  // Online/web search capability
  if (name.includes(':online') || name.includes('online') || name.includes('sonar')) {
    capabilities.push('online')
  }

  // Deep research capability
  if (name.includes('deep-research') || name.includes('deep research')) {
    capabilities.push('deep-research')
  }

  return capabilities
}

/**
 * Filter models by search query
 * Searches both displayName and code
 * 
 * @param models - Array of models to filter
 * @param query - Search query string
 * @returns Filtered array of models
 */
export function filterModels<T extends { code: string; displayName: string }>(
  models: T[],
  query: string
): T[] {
  if (!query.trim()) return models

  const lowerQuery = query.toLowerCase()
  return models.filter(m =>
    m.displayName.toLowerCase().includes(lowerQuery) ||
    m.code.toLowerCase().includes(lowerQuery)
  )
}

/**
 * Group models by provider
 * 
 * @param models - Array of models with provider field
 * @returns Record of provider to models array
 */
export function groupModelsByProvider<T extends ModelInfo>(
  models: T[]
): Record<string, T[]> {
  const groups: Record<string, T[]> = {
    ollama: [],
    perplexity: [],
    openrouter: [],
    gemini: [],
    groq: [],
    minimax: []
  }

  models.forEach(model => {
    if (groups[model.provider]) {
      groups[model.provider].push(model)
    }
  })

  return groups
}

/**
 * Provider configuration with colors and icons
 */
export const PROVIDER_CONFIG = {
  gemini: { title: 'Gemini', color: '#4dabf7' },
  openrouter: { title: 'OpenRouter', color: '#a855f7' },
  perplexity: { title: 'Perplexity', color: '#22c55e' },
  groq: { title: 'Groq', color: '#f97316' },
  ollama: { title: 'Ollama', color: '#339af0' },
  minimax: { title: 'MiniMax', color: '#6366f1' },
} as const

/**
 * Get provider display title
 * 
 * @param provider - Provider key
 * @returns Display title for the provider
 */
export function getProviderTitle(provider: string): string {
  return PROVIDER_CONFIG[provider as keyof typeof PROVIDER_CONFIG]?.title || provider
}

/**
 * Get provider color
 * 
 * @param provider - Provider key
 * @returns Hex color for the provider
 */
export function getProviderColor(provider: string): string {
  return PROVIDER_CONFIG[provider as keyof typeof PROVIDER_CONFIG]?.color || '#b0b0b0'
}

/**
 * Get description for a model based on its attributes
 * Centralized function to avoid duplication across components
 * 
 * @param model - Model object with provider, code, and displayName
 * @returns Human-readable description string
 */
export function getModelDescription(model: { provider: string; code: string; displayName: string }): string {
  const name = model.displayName.toLowerCase()
  const code = model.code.toLowerCase()

  // Provider-specific descriptions
  if (model.provider === 'gemini') {
    if (name.includes('flash')) return 'Lightning-fast with surprising capability'
    if (name.includes('pro')) return "Google's newest flagship with advanced reasoning"
    return 'Google AI model with multimodal capabilities'
  }

  if (model.provider === 'openrouter') {
    if (code.includes('claude')) return "Anthropic's most advanced Sonnet yet"
    if (code.includes('gpt-4')) return "OpenAI's latest with breakthrough speed and intelligence"
    if (code.includes('gpt-5')) return "OpenAI's next-generation language model"
    if (code.includes('llama')) return 'Meta AI open source model'
    if (code.includes('mistral')) return 'Efficient European AI model'
    if (code.includes('deepseek')) return 'Advanced reasoning with deep thinking'
    if (code.includes('grok')) return 'xAI model with real-time knowledge'
    if (code.includes('kimi')) return 'Enhanced version with longer context'
    if (code.includes('qwen')) return 'Alibaba AI with strong multilingual support'
    return 'Available via OpenRouter'
  }

  if (model.provider === 'perplexity') {
    if (name.includes('deep research')) return 'In-depth research with citations'
    if (name.includes('reasoning')) return 'Advanced reasoning capabilities'
    return 'Real-time web search powered'
  }

  if (model.provider === 'groq') {
    return 'Ultra-fast inference on Groq hardware'
  }

  if (model.provider === 'minimax') {
    if (name.includes('lightning')) return 'Ultra-fast inference with M2.1 performance'
    if (name.includes('m2.1')) return 'Advanced reasoning with interleaved thinking'
    if (name.includes('m2')) return 'Powerful model with 200k context'
    return 'MiniMax AI model with advanced capabilities'
  }

  if (model.provider === 'ollama') {
    return 'Running locally on your machine'
  }

  // Fallback for any unhandled provider
  const providerName = model.provider as string
  return `${providerName.charAt(0).toUpperCase() + providerName.slice(1)} model`
}
