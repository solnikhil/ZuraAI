/**
 * ModelList component - renders the list of models
 * 
 * @module ModelSelector/ModelList
 * Requirements: 3.2 - Matches t3.chat design
 */

import React, { useState } from 'react'
import { Check, Star, Search, Eye, Code, Info, Zap, Globe, Brain, Sparkles } from 'lucide-react'
import { getModelAttributes, detectModelCapabilities } from '../../../utils/modelUtils'
import { removeEmojis } from '../../../utils/textUtils'
import type { ModelWithProvider } from './types'

/**
 * Props for ModelList component
 */
export interface ModelListProps {
  /** Models to display */
  models: ModelWithProvider[]
  /** Currently selected model code */
  selectedModelCode: string
  /** Currently selected model provider */
  selectedModelProvider: string
  /** Favorite model codes */
  favoriteModels: string[]
  /** Handler for model selection */
  onModelSelect: (model: ModelWithProvider, e?: React.MouseEvent) => void
  /** Handler for toggling favorites */
  onToggleFavorite: (modelCode: string, e: React.MouseEvent) => void
}

/**
 * Get description for a model based on its attributes
 */
function getModelDescription(model: ModelWithProvider): string {
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

  if (model.provider === 'ollama') {
    return 'Running locally on your machine'
  }

  return `${model.provider.charAt(0).toUpperCase() + model.provider.slice(1)} model`
}

/**
 * ModelList component
 * Renders a list of models with selection and favorite functionality
 */
export function ModelList({
  models,
  selectedModelCode,
  selectedModelProvider,
  favoriteModels,
  onModelSelect,
  onToggleFavorite
}: ModelListProps): React.ReactElement {
  if (models.length === 0) {
    return (
      <div style={{
        padding: '24px 16px',
        textAlign: 'center',
        color: '#666'
      }}>
        <Search size={20} style={{ opacity: 0.3, marginBottom: '8px' }} />
        <div style={{ fontSize: '0.8rem' }}>No models found</div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      animation: 'fadeIn 0.2s ease',
      position: 'relative',
      zIndex: 2
    }}>
      {models.map(model => {
        const isActive = selectedModelCode === model.code && selectedModelProvider === model.provider
        return (
          <ModelItem
            key={`${model.provider}-${model.code}`}
            model={model}
            isActive={isActive}
            isFavorite={favoriteModels.includes(model.code)}
            onSelect={onModelSelect}
            onToggleFavorite={onToggleFavorite}
          />
        )
      })}
    </div>
  )
}

/**
 * Props for ModelItem component
 */
interface ModelItemProps {
  model: ModelWithProvider
  isActive: boolean
  isFavorite: boolean
  onSelect: (model: ModelWithProvider, e?: React.MouseEvent) => void
  onToggleFavorite: (modelCode: string, e: React.MouseEvent) => void
}

/**
 * ModelItem component - renders a single model item (t3.chat style)
 */
function ModelItem({
  model,
  isActive,
  isFavorite,
  onSelect,
  onToggleFavorite
}: ModelItemProps): React.ReactElement {
  const { color, badge } = getModelAttributes(model)
  const capabilities = detectModelCapabilities(model.code + ' ' + model.displayName)
  const hasVision = capabilities.includes('vision')
  const hasCode = capabilities.includes('code')
  const description = getModelDescription(model)

  return (
    <div
      onClick={(e) => onSelect(model, e)}
      onMouseDown={(e) => e.stopPropagation()}
      className={`model-item-t3 ${isActive ? 'model-item-t3-active' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 12px',
        borderRadius: '10px',
        background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
        cursor: 'pointer',
        minWidth: 0,
        transition: 'all 0.15s ease'
      }}
      onMouseEnter={e => {
        if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
      }}
      onMouseLeave={e => {
        if (!isActive) e.currentTarget.style.background = 'transparent'
      }}
    >
      {/* Provider Logo/Icon */}
      <div style={{
        width: '32px',
        height: '32px',
        borderRadius: '8px',
        background: `linear-gradient(145deg, ${color}20, transparent)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden'
      }}>
        <ModelIcon model={model} color={color} size={22} />
      </div>

      {/* Model Info */}
      <div style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px'
      }}>
        {/* Top row: Name + Favorite Star + Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          minWidth: 0
        }}>
          <span style={{
            fontSize: '0.85rem',
            color: 'var(--theme-text-primary)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {removeEmojis(model.displayName)}
          </span>

          {/* Inline Favorite Star */}
          <button
            className={`star-btn-inline ${isFavorite ? 'favorited' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite(model.code, e)
            }}
            style={{
              padding: '2px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isFavorite ? 'var(--theme-favorite)' : 'var(--theme-text-muted)',
              opacity: isFavorite ? 1 : 0.4,
              transition: 'all 0.15s ease',
              flexShrink: 0
            }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.transform = 'scale(1.1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = isFavorite ? '1' : '0.4'
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            <Star size={12} fill={isFavorite ? '#FFD700' : 'none'} />
          </button>

          {/* Badge (if any) */}
          {badge && (
            <div style={{ flexShrink: 0 }}>
              {badge}
            </div>
          )}
        </div>

        {/* Description line */}
        <span style={{
          fontSize: '0.7rem',
          color: 'var(--theme-text-muted)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          opacity: 0.7
        }}>
          {description}
        </span>
      </div>

      {/* Feature Badges (Right side) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        flexShrink: 0
      }}>
        {/* Vision Badge */}
        {hasVision && (
          <div
            title="Supports vision/images"
            style={{
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--theme-text-muted)',
              opacity: 0.6
            }}
          >
            <Eye size={14} />
          </div>
        )}

        {/* Function Calling Badge */}
        {hasCode && (
          <div
            title="Supports function calling"
            style={{
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--theme-text-muted)',
              opacity: 0.6
            }}
          >
            <Code size={14} />
          </div>
        )}

        {/* Info Button */}
        <div
          title="Model information"
          style={{
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--theme-text-muted)',
            opacity: 0.4,
            cursor: 'pointer'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Info size={14} />
        </div>
      </div>
    </div>
  )
}

/**
 * ModelIcon component - renders provider logo with fallback
 */
function ModelIcon({
  model,
  color,
  size = 24
}: {
  model: ModelWithProvider
  color: string
  size?: number
}): React.ReactElement {
  const [imgError, setImgError] = useState(false)

  if (!imgError) {
    return (
      <img
        src={`/provider-logos/${model.provider}.png`}
        alt={model.displayName}
        onError={() => setImgError(true)}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          objectFit: 'contain',
          borderRadius: '6px'
        }}
      />
    )
  }

  // Fallback icon based on model name
  const name = model.displayName.toLowerCase()
  let FallbackIcon = Sparkles

  if (name.includes('gpt') || name.includes('openai')) FallbackIcon = Zap
  else if (name.includes('claude')) FallbackIcon = Brain
  else if (name.includes('llama')) FallbackIcon = Globe

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: color
    }}>
      <FallbackIcon size={size * 0.75} />
    </div>
  )
}

export default ModelList
