/**
 * ModelGroupRenderer component - renders grouped models by provider
 * 
 * @module ModelSelector/ModelGroupRenderer
 * Requirements: 3.2
 */

import React, { useState } from 'react'
import { ChevronDown, Check, Star, MessageSquare } from 'lucide-react'
import { ProviderLogo } from '../../shared'
import { getModelAttributes } from '../../../utils/modelUtils'
import { removeEmojis } from '../../../utils/textUtils'
import type { ModelWithProvider } from './types'

/**
 * Props for ModelGroupRenderer component
 */
export interface ModelGroupRendererProps {
  /** Provider key */
  provider: string
  /** Provider display title */
  title: string
  /** Models in this group */
  models: ModelWithProvider[]
  /** Whether the group is collapsed */
  isCollapsed: boolean
  /** Handler for toggling collapse state */
  onToggleCollapse: (provider: string) => void
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
 * ModelGroupRenderer component
 * Renders a collapsible group of models for a specific provider
 */
export function ModelGroupRenderer({
  provider,
  title,
  models,
  isCollapsed,
  onToggleCollapse,
  selectedModelCode,
  selectedModelProvider,
  favoriteModels,
  onModelSelect,
  onToggleFavorite
}: ModelGroupRendererProps): React.ReactElement | null {
  if (models.length === 0) return null

  return (
    <div style={{ marginBottom: '8px' }}>
      {/* Group Header */}
      <div
        className="group-header"
        onClick={(e) => {
          e.stopPropagation()
          onToggleCollapse(provider)
        }}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 4px',
          cursor: 'pointer',
          color: '#b0b0b0',
          fontSize: '0.8rem',
          fontWeight: 600,
          userSelect: 'none'
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#e0e0e0'}
        onMouseLeave={e => e.currentTarget.style.color = '#b0b0b0'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ProviderLogo provider={provider} size={14} />
          <span>{title}</span>
          <span style={{ 
            fontSize: '0.7rem', 
            opacity: 0.6, 
            background: 'rgba(255,255,255,0.05)', 
            padding: '2px 6px', 
            borderRadius: '10px' 
          }}>
            {models.length}
          </span>
        </div>
        <ChevronDown 
          size={14} 
          style={{ 
            transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', 
            transition: 'transform 0.2s' 
          }} 
        />
      </div>

      {/* Model Items */}
      {!isCollapsed && (
        <div 
          className="model-group" 
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '2px', 
            paddingLeft: '8px' 
          }}
        >
          {models.map(model => {
            const isActive = selectedModelCode === model.code && selectedModelProvider === model.provider
            return (
              <GroupModelItem
                key={model.code}
                model={model}
                isActive={isActive}
                isFavorite={favoriteModels.includes(model.code)}
                onSelect={onModelSelect}
                onToggleFavorite={onToggleFavorite}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Props for GroupModelItem component
 */
interface GroupModelItemProps {
  model: ModelWithProvider
  isActive: boolean
  isFavorite: boolean
  onSelect: (model: ModelWithProvider, e?: React.MouseEvent) => void
  onToggleFavorite: (modelCode: string, e: React.MouseEvent) => void
}

/**
 * GroupModelItem component - renders a model item within a group
 */
function GroupModelItem({
  model,
  isActive,
  isFavorite,
  onSelect,
  onToggleFavorite
}: GroupModelItemProps): React.ReactElement {
  const { icon: attrIcon, color, badge } = getModelAttributes(model)

  return (
    <div
      onClick={(e) => onSelect(model, e)}
      onMouseDown={(e) => e.stopPropagation()}
      className={`model-item ${isActive ? 'model-item-active' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '12px',
        borderRadius: '10px',
        background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
        cursor: 'pointer',
        position: 'relative'
      }}
      onMouseEnter={e => {
        if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
        const starBtn = e.currentTarget.querySelector('.star-btn') as HTMLElement
        if (starBtn) starBtn.style.opacity = '1'
      }}
      onMouseLeave={e => {
        if (!isActive) e.currentTarget.style.background = 'transparent'
        const starBtn = e.currentTarget.querySelector('.star-btn') as HTMLElement
        if (starBtn && !isFavorite) starBtn.style.opacity = '0'
      }}
    >
      <GroupModelIcon model={model} icon={attrIcon} color={color} size={24} />
      
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ 
          color: '#ddd', 
          fontSize: '0.9rem', 
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {removeEmojis(model.displayName)}
        </div>
        <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '2px' }}>
          {model.provider}
        </div>
      </div>
      
      {badge}
      
      {/* Star button */}
      <button
        className={`star-btn ${isFavorite ? 'favorited' : ''}`}
        onClick={(e) => onToggleFavorite(model.code, e)}
        style={{
          opacity: isFavorite ? 1 : 0,
          padding: '4px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onMouseEnter={e => {
          e.stopPropagation()
          e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
        }}
        onMouseLeave={e => {
          e.stopPropagation()
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <Star size={14} fill={isFavorite ? '#FFD700' : 'none'} color={isFavorite ? '#FFD700' : '#666'} />
      </button>

      {isActive && <Check size={16} color="#fff" />}
    </div>
  )
}

/**
 * GroupModelIcon component - renders model icon with fallback
 */
function GroupModelIcon({ 
  model, 
  icon, 
  color, 
  size = 24 
}: { 
  model: ModelWithProvider
  icon: React.ReactNode
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
      padding: '10px',
      borderRadius: '10px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: `linear-gradient(145deg, ${color}22, transparent)`,
      color: color
    }}>
      {React.isValidElement(icon)
        ? React.cloneElement(icon as React.ReactElement<{ size?: number }>, { size: 20 })
        : <MessageSquare size={20} />
      }
    </div>
  )
}

export default ModelGroupRenderer
