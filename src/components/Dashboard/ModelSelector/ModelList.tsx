/**
 * ModelList component - renders the list of models
 * 
 * @module ModelSelector/ModelList
 * Requirements: 3.2
 */

import React, { useState } from 'react'
import { Check, Star, Search, MessageSquare } from 'lucide-react'
import { getModelAttributes } from '../../../utils/modelUtils'
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
      gap: '2px',
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
 * ModelItem component - renders a single model item
 */
function ModelItem({
  model,
  isActive,
  isFavorite,
  onSelect,
  onToggleFavorite
}: ModelItemProps): React.ReactElement {
  const { color } = getModelAttributes(model)

  return (
    <div
      onClick={(e) => onSelect(model, e)}
      onMouseDown={(e) => e.stopPropagation()}
      className={`compact-model-item ${isActive ? 'compact-model-item-active' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 12px',
        borderRadius: '10px',
        background: isActive ? 'var(--theme-surface-hover)' : 'transparent',
        border: isActive ? '1px solid var(--theme-border)' : '1px solid transparent',
        cursor: 'pointer',
        minWidth: 0,
        flexShrink: 0,
        transition: 'all 0.15s ease'
      }}
      onMouseEnter={e => {
        if (!isActive) e.currentTarget.style.background = 'var(--theme-surface-hover)'
        const starBtn = e.currentTarget.querySelector('.star-btn') as HTMLElement
        if (starBtn) starBtn.style.opacity = '1'
      }}
      onMouseLeave={e => {
        if (!isActive) e.currentTarget.style.background = 'transparent'
        const starBtn = e.currentTarget.querySelector('.star-btn') as HTMLElement
        if (starBtn && !isFavorite) starBtn.style.opacity = '0'
      }}
    >
      {/* Provider Logo/Icon */}
      <div style={{ 
        width: '32px', 
        height: '32px', 
        borderRadius: '8px', 
        background: `linear-gradient(145deg, ${color}25, transparent)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden'
      }}>
        <ModelIcon model={model} color={color} size={24} />
      </div>
      
      {/* Model Info */}
      <div style={{ 
        flex: 1, 
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px'
      }}>
        <span style={{ 
          fontSize: '0.85rem', 
          color: isActive ? 'var(--theme-text-primary)' : 'var(--theme-text-secondary)',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {removeEmojis(model.displayName)}
        </span>
        <span style={{ 
          fontSize: '0.7rem', 
          color: 'var(--theme-text-muted)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          opacity: 0.7
        }}>
          {model.provider.charAt(0).toUpperCase() + model.provider.slice(1)} model
        </span>
      </div>
      
      {/* Active indicator or Favorite */}
      {isActive ? (
        <Check size={14} color="var(--theme-accent)" />
      ) : (
        <button
          className={`star-btn ${isFavorite ? 'favorited' : ''}`}
          onClick={(e) => onToggleFavorite(model.code, e)}
          style={{
            opacity: isFavorite ? 1 : 0,
            padding: '4px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFD700'
          }}
        >
          <Star size={14} fill={isFavorite ? '#FFD700' : 'none'} />
        </button>
      )}
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

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: color
    }}>
      <MessageSquare size={size === 24 ? 20 : 14} />
    </div>
  )
}

export default ModelList
