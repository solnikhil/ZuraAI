/**
 * ModelSelectorDropdown component - renders the dropdown overlay
 * 
 * @module ModelSelector/ModelSelectorDropdown
 * Requirements: 3.1
 */

import React, { useEffect } from 'react'
import { Star, Sparkles, Zap, Globe, Database, Cloud } from 'lucide-react'
import type { ModelWithProvider, ViewMode, GroupedModels } from './types'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ModelIcon } from './ModelIcon'
import { getModelAttributes } from '../../../utils/modelUtils'
import { removeEmojis } from '../../../utils/textUtils'

/**
 * Provider configuration for sidebar
 */
const PROVIDERS = [
  { key: 'gemini', title: 'Gemini', icon: Sparkles, color: '#4dabf7', logo: true },
  { key: 'openrouter', title: 'OpenRouter', icon: Cloud, color: '#a855f7', logo: true },
  { key: 'perplexity', title: 'Perplexity', icon: Globe, color: '#22c55e', logo: true },
  { key: 'groq', title: 'Groq', icon: Zap, color: '#f97316', logo: true },
  { key: 'minimax', title: 'MiniMax', icon: Sparkles, color: '#6366f1', logo: true },
  { key: 'ollama', title: 'Ollama', icon: Database, color: '#339af0', logo: true },
] as const

/**
 * Props for ModelSelectorDropdown
 */
export interface ModelSelectorDropdownProps {
  /** Reference for the search input */
  searchInputRef: React.RefObject<HTMLInputElement | null>
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
  searchInputRef,
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
  // Focus search input when dropdown opens
  useEffect(() => {
    const timer = setTimeout(() => {
      // CommandInput doesn't forward refs, so we find it via querySelector
      const input = document.querySelector('[data-slot="command-input"]') as HTMLInputElement
      if (input) {
        input.focus()
        // Store ref for external access if needed
        if (searchInputRef && 'current' in searchInputRef) {
          (searchInputRef as React.MutableRefObject<HTMLInputElement | null>).current = input
        }
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex h-[484px] flex-col overflow-hidden">
      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <ProviderSidebar
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          selectedProvider={selectedProvider}
          onProviderSelect={onProviderSelect}
        />

        {/* Right Side: Command-based search/list */}
        <Command className="flex-1 rounded-none border-0" shouldFilter={false}>
          <CommandInput
            placeholder="Search models..."
            value={searchQuery}
            onValueChange={onSearchChange}
            className="h-12"
          />
          <CommandList className="max-h-[calc(484px-48px)]">
            <CommandEmpty>
              <div className="py-6 text-center text-sm text-muted-foreground">
                No models found
              </div>
            </CommandEmpty>
            <CommandGroup heading={viewMode === 'favorites' ? 'Favorites' : PROVIDERS.find(p => p.key === selectedProvider)?.title || 'Models'}>
              {currentModels.map(model => {
                const isActive = selectedModelCode === model.code && selectedModelProvider === model.provider
                const isFavorite = favoriteModels.includes(model.code)
                const { color } = getModelAttributes(model)
                
                return (
                  <CommandItem
                    key={`${model.provider}-${model.code}`}
                    value={`${model.code} ${model.displayName}`}
                    onSelect={() => onModelSelect(model)}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                      <ModelIcon
                        model={model}
                        icon={getModelAttributes(model).icon}
                        color={color}
                        size={22}
                      />
                    </div>
                    <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-sm">
                          {removeEmojis(model.displayName)}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground truncate">
                        {getModelDescription(model)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          onToggleFavorite(model.code, e as unknown as React.MouseEvent)
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="p-1 hover:bg-muted rounded transition-colors"
                        style={{
                          color: isFavorite ? '#FFD700' : 'var(--muted-foreground)',
                          opacity: isFavorite ? 1 : 0.4
                        }}
                      >
                        <Star size={12} fill={isFavorite ? '#FFD700' : 'none'} />
                      </button>
                      {isActive && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </div>
  )
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
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          onViewModeChange('favorites')
        }}
        onPointerDown={(e) => e.stopPropagation()}
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
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onProviderSelect(provider.key)
              onViewModeChange('all')
            }}
            onPointerDown={(e) => e.stopPropagation()}
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
                }}
                style={{ 
                  width: '18px', 
                  height: '18px', 
                  objectFit: 'contain',
                  borderRadius: '4px'
                }} 
              />
            ) : (
              React.createElement(provider.icon, { size: 16 })
            )}
          </button>
        ))}
      </div>
    </div>
  )
}


export default ModelSelectorDropdown
