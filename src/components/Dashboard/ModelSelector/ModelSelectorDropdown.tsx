/**
 * ModelSelectorDropdown component - renders the dropdown overlay
 * 
 * @module ModelSelector/ModelSelectorDropdown
 * Requirements: 3.1
 */

import React from 'react'
import ReactDOM from 'react-dom'
import { Search, Star, Sparkles, Zap, Globe, Database, Cloud } from 'lucide-react'
import { ModelList } from './ModelList'
import type { ModelWithProvider, ViewMode, GroupedModels } from './types'
import { ScrollArea } from '@/components/ui/scroll-area'

/**
 * Provider configuration for sidebar
 */
const PROVIDERS = [
  { key: 'gemini', title: 'Gemini', icon: <Sparkles />, color: '#4dabf7', logo: true },
  { key: 'openrouter', title: 'OpenRouter', icon: <Cloud />, color: '#a855f7', logo: true },
  { key: 'perplexity', title: 'Perplexity', icon: <Globe />, color: '#22c55e', logo: true },
  { key: 'groq', title: 'Groq', icon: <Zap />, color: '#f97316', logo: true },
  { key: 'minimax', title: 'MiniMax', icon: <Sparkles />, color: '#6366f1', logo: true },
  { key: 'ollama', title: 'Ollama', icon: <Database />, color: '#339af0', logo: true },
] as const

/**
 * Props for ModelSelectorDropdown
 */
export interface ModelSelectorDropdownProps {
  /** Reference for the portal container */
  portalRef: React.RefObject<HTMLDivElement | null>
  /** Reference for the search input */
  searchInputRef: React.RefObject<HTMLInputElement | null>
  /** Dropdown position */
  dropdownPos: { top: number; left: number; showAbove: boolean }
  /** Current search query */
  searchQuery: string
  /** Handler for search query changes */
  onSearchChange: (query: string) => void
  /** Current view mode */
  viewMode: ViewMode
  /** Handler for view mode changes */
  onViewModeChange: (mode: ViewMode) => void
  /** Currently selected provider */
  selectedProvider: string
  /** Handler for provider selection */
  onProviderSelect: (provider: string) => void
  /** Models to display */
  currentModels: ModelWithProvider[]
  /** Grouped models by provider */
  groupedModels: GroupedModels
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
 * ModelSelectorDropdown component
 * Renders the dropdown overlay with search, provider sidebar, and model list
 */
export function ModelSelectorDropdown({
  portalRef,
  searchInputRef,
  dropdownPos,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  selectedProvider,
  onProviderSelect,
  currentModels,
  groupedModels,
  selectedModelCode,
  selectedModelProvider,
  favoriteModels,
  onModelSelect,
  onToggleFavorite
}: ModelSelectorDropdownProps): React.ReactElement {
  return ReactDOM.createPortal(
    <div
      ref={portalRef}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: dropdownPos.top,
        left: dropdownPos.left,
        transform: dropdownPos.showAbove ? 'translateY(-100%)' : 'translateY(0)',
        width: '460px',
        height: '484px',
        backgroundColor: 'var(--theme-surface)',
        border: '1px solid var(--theme-border)',
        borderRadius: '16px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        animation: dropdownPos.showAbove 
          ? 'dropdown-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          : 'dropdown-slide-down 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 99999,
        overflow: 'hidden'
      }}
    >
      {/* Search Bar */}
      <div style={{ padding: '8px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Search size={14} color="#666" />
          <input
            ref={searchInputRef}
            className="search-input"
            type="text"
            placeholder="Search models..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              padding: '6px 0',
              color: '#fff',
              fontSize: '0.85rem',
              outline: 'none'
            }}
          />
        </div>
        <div style={{
          height: '1px',
          background: 'rgba(255,255,255,0.06)',
          marginTop: '8px'
        }} />
      </div>

      {/* Two-column layout */}
      <div style={{ 
        display: 'flex', 
        flex: 1, 
        overflow: 'hidden',
        padding: '8px 16px 16px',
        position: 'relative'
      }}>
        {/* Left Sidebar */}
        <ProviderSidebar
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          selectedProvider={selectedProvider}
          onProviderSelect={onProviderSelect}
        />

        {/* Right Side: Model List */}
        <ScrollArea
          className="custom-scrollbar"
          style={{
            flex: 1,
            position: 'relative'
          }}
          viewportStyle={{ paddingLeft: '12px' }}
        >
          {/* Right fade gradient */}
          <div style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: '30px',
            background: 'linear-gradient(to left, var(--theme-surface) 0%, transparent 100%)',
            pointerEvents: 'none',
            zIndex: 1
          }} />

          {/* Header */}
          <ModelListHeader 
            viewMode={viewMode} 
            selectedProvider={selectedProvider} 
          />

          {/* Models List */}
          <ModelList
            models={currentModels}
            selectedModelCode={selectedModelCode}
            selectedModelProvider={selectedModelProvider}
            favoriteModels={favoriteModels}
            onModelSelect={onModelSelect}
            onToggleFavorite={onToggleFavorite}
          />
        </ScrollArea>
      </div>
    </div>,
    document.body
  )
}

/**
 * Provider sidebar component
 */
function ProviderSidebar({
  viewMode,
  onViewModeChange,
  selectedProvider,
  onProviderSelect
}: {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  selectedProvider: string
  onProviderSelect: (provider: string) => void
}): React.ReactElement {
  return (
    <div style={{
      width: '48px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingRight: '10px',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      position: 'relative',
      zIndex: 2
    }}>
      {/* Left fade gradient */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '20px',
        background: 'linear-gradient(to right, var(--theme-surface) 0%, transparent 100%)',
        pointerEvents: 'none'
      }} />

      {/* Favorites Button */}
      <button
        onClick={() => onViewModeChange('favorites')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          border: 'none',
          background: viewMode === 'favorites' ? 'rgba(255,215,0,0.15)' : 'transparent',
          color: viewMode === 'favorites' ? '#FFD700' : '#666',
          cursor: 'pointer',
          marginBottom: '10px',
          position: 'relative',
          zIndex: 3
        }}
        onMouseEnter={e => {
          if (viewMode !== 'favorites') {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            e.currentTarget.style.color = '#888'
          }
        }}
        onMouseLeave={e => {
          if (viewMode !== 'favorites') {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = '#666'
          }
        }}
      >
        <Star size={16} fill={viewMode === 'favorites' ? '#FFD700' : 'none'} />
      </button>

      {/* Separator */}
      <div style={{
        width: '20px',
        height: '1px',
        background: 'rgba(255,255,255,0.1)',
        marginBottom: '10px',
        position: 'relative',
        zIndex: 3
      }} />

      {/* Provider Buttons */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        flex: 1,
        position: 'relative',
        zIndex: 2
      }}>
        {PROVIDERS.map(provider => (
          <button
            key={provider.key}
            onClick={() => {
              onProviderSelect(provider.key)
              onViewModeChange('all')
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: 'none',
              background: selectedProvider === provider.key 
                ? 'rgba(255,255,255,0.1)' 
                : 'transparent',
              color: selectedProvider === provider.key 
                ? '#fff' 
                : '#666',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              flexShrink: 0,
              position: 'relative',
              zIndex: 3
            }}
            onMouseEnter={e => {
              if (selectedProvider !== provider.key) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                e.currentTarget.style.color = '#888'
              }
            }}
            onMouseLeave={e => {
              if (selectedProvider !== provider.key) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#666'
              }
            }}
            title={provider.title}
          >
            {provider.logo ? (
              <img 
                src={`/provider-logos/${provider.key}.png`}
                alt={provider.title}
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                  target.parentElement!.innerHTML = `<span style="font-size:14px">${provider.icon}</span>`
                }}
                style={{ 
                  width: '18px', 
                  height: '18px', 
                  objectFit: 'contain',
                  borderRadius: '4px'
                }} 
              />
            ) : (
              React.cloneElement(provider.icon as React.ReactElement<{ size?: number }>, { size: 16 })
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Model list header component
 */
function ModelListHeader({
  viewMode,
  selectedProvider
}: {
  viewMode: ViewMode
  selectedProvider: string
}): React.ReactElement {
  const provider = PROVIDERS.find(p => p.key === selectedProvider)
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '10px',
      position: 'relative',
      zIndex: 2
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        color: '#fff',
        fontSize: '0.8rem',
        fontWeight: 600
      }}>
        {viewMode === 'favorites' ? (
          <>
            <Star size={12} fill="#FFD700" color="#FFD700" />
            Favorites
          </>
        ) : provider ? (
          <>
            {provider.logo ? (
              <img 
                src={`/provider-logos/${selectedProvider}.png`}
                alt={provider.title}
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                }}
                style={{ 
                  width: '14px', 
                  height: '14px', 
                  objectFit: 'contain',
                  borderRadius: '3px'
                }} 
              />
            ) : (
              React.cloneElement(provider.icon as React.ReactElement<{ size?: number }>, { size: 12 })
            )}
            {provider.title}
          </>
        ) : null}
      </div>
    </div>
  )
}

export default ModelSelectorDropdown
