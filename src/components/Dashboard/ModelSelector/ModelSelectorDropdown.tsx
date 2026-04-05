/**
 * ModelSelectorDropdown component - renders the dropdown overlay
 *
 */

import React, { memo, useEffect } from 'react'
import { Star } from 'lucide-react'
import type { ModelWithProvider, ViewMode, GroupedModels, ModelSelectorCompactMode } from './types'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import {
  getModelAttributes,
  getModelDescription,
  getCapabilitiesForModelPicker,
  CAPABILITY_BADGE_STYLES,
} from '../../../utils/modelUtils'
import { removeEmojis } from '../../../utils/textUtils'
import { ProviderLogo } from '@/components/shared'
import { useSettings } from '../../../contexts/SettingsContext'
import { useAppShell } from '../../../contexts/AppShellContext'
import type { ModelSelectorSettings } from '../../../contexts/SettingsUIContext'
import { cn } from '@/lib/utils'

/**
 * Provider configuration
 */
const PROVIDERS = [
  { key: 'openrouter', title: 'OpenRouter' },
  { key: 'perplexity', title: 'Perplexity' },
  { key: 'groq', title: 'Groq' },
  { key: 'fireworks', title: 'Fireworks' },
  { key: 'alibaba', title: 'Alibaba Cloud' },
  { key: 'ollama', title: 'Ollama' },
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
  /** Keyboard-focused model index */
  focusedIndex: number
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
  /** Handler for focused index changes */
  onFocusedIndexChange: (index: number) => void
  /** Auto-compact mode based on available window width */
  compactMode?: ModelSelectorCompactMode
}

/**
 * Get density padding classes
 */
function getDensityClasses(density: 'compact' | 'comfortable' | 'spacious'): string {
  switch (density) {
    case 'compact':
      return 'py-1.5'
    case 'spacious':
      return 'py-3.5'
    default:
      return 'py-2.5'
  }
}

function getResponsiveDensity(
  density: 'compact' | 'comfortable' | 'spacious',
  compactMode: ModelSelectorCompactMode
): 'compact' | 'comfortable' | 'spacious' {
  if (compactMode === 'tight') return 'compact'
  if (compactMode === 'compact' && density === 'spacious') return 'comfortable'
  return density
}

/**
 * ModelSelectorDropdown component
 * Renders the dropdown overlay with vertical provider sidebar and model list
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
  focusedIndex,
  selectedModelCode,
  selectedModelProvider,
  favoriteModels,
  onModelSelect,
  onToggleFavorite,
  onFocusedIndexChange,
  compactMode = 'none',
}: ModelSelectorDropdownProps): React.ReactElement {
  const { settings } = useSettings()
  const { setDashboardView, setActiveSettingsSection } = useAppShell()
  const modelSelector = settings.modelSelector || {
    sidebarPosition: 'left',
    sidebarShowLabels: true,
    sidebarShowModelCount: true,
    dropdownWidth: 'default',
    showDescriptions: true,
    showCapabilityBadges: true,
    capabilityBadgeDisplay: 'both',
    showProviderLogos: true,
    showFavoriteStars: true,
    showContextLength: true,
    showInfoTooltips: true,
    activeIndicatorStyle: 'dot',
    itemDensity: 'comfortable',
    defaultView: 'lastUsed',
    autoCloseOnSelect: true,
    rememberProvider: true,
    showSearch: true,
    enableAnimations: true,
    staggerSpeed: 'normal',
  }

  // Focus search input when dropdown opens
  useEffect(() => {
    if (!modelSelector.showSearch) return
    const timer = setTimeout(() => {
      const input = document.querySelector('[data-slot="command-input"]') as HTMLInputElement
      if (input) {
        input.focus()
        if (searchInputRef && 'current' in searchInputRef) {
          ;(searchInputRef as React.MutableRefObject<HTMLInputElement | null>).current = input
        }
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [modelSelector.showSearch, searchInputRef])

  useEffect(() => {
    if (focusedIndex < 0) return
    const focusedItem = document.querySelector(
      `[data-model-index="${focusedIndex}"]`
    ) as HTMLElement | null
    focusedItem?.scrollIntoView({ block: 'nearest' })
  }, [focusedIndex])

  // Determine active tab key (favorites or provider)
  // Clear sidebar highlight when searching across all providers
  const activeTabKey = searchQuery.trim() ? '' : viewMode === 'favorites' ? 'favorites' : selectedProvider

  const responsiveDensity = getResponsiveDensity(modelSelector.itemDensity, compactMode)
  const densityClasses = getDensityClasses(responsiveDensity)
  const isCompact = compactMode !== 'none'
  const isTight = compactMode === 'tight'

  const showDescriptions = modelSelector.showDescriptions && !isTight
  const showCapabilityBadges = modelSelector.showCapabilityBadges && !isTight
  const emptyStateHeading =
    viewMode === 'favorites' ? 'No favorite models yet' : 'No models configured'

  const handleOpenProviders = () => {
    setActiveSettingsSection('providers')
    setDashboardView('settings')
  }

  return (
    <div
      className={`flex h-full overflow-hidden ${modelSelector.sidebarPosition === 'right' ? 'flex-row-reverse' : ''}`}
    >
      <ProviderSidebar
        activeTabKey={activeTabKey}
        groupedModels={groupedModels}
        sidebarPosition={modelSelector.sidebarPosition}
        onTabSelect={(key) => {
          if (key === 'favorites') {
            onViewModeChange('favorites')
          } else {
            onProviderSelect(key)
            onViewModeChange('all')
          }
        }}
      />

      <div
        className={`flex-1 flex flex-col overflow-hidden ${modelSelector.sidebarPosition === 'right' ? 'border-r' : 'border-l'} border-border/50 relative`}
      >
        <Command shouldFilter={false} loop className="flex-1 flex flex-col rounded-none border-0 bg-transparent">
          {modelSelector.showSearch && (
            <div className={cn('border-b border-border/50', isTight ? 'px-2 py-1.5' : 'px-3 py-2')}>
              <CommandInput
                placeholder="Search models, providers..."
                value={searchQuery}
                onValueChange={onSearchChange}
                className={isCompact ? 'h-9 text-sm' : 'h-10'}
              />
            </div>
          )}
          <CommandList className="flex-1 max-h-full">
            {currentModels.length === 0 && (
              <CommandEmpty>
                <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-foreground">{emptyStateHeading}</div>
                    <div className="max-w-xs text-sm leading-6 text-muted-foreground">
                      {viewMode === 'favorites'
                        ? 'Star a model after enabling a provider to pin it here for quick access.'
                        : 'Enable a provider in Settings, add your API key or local model, then come back to select it.'}
                    </div>
                  </div>
                  <Button type="button" size="sm" onClick={handleOpenProviders}>
                    Open Provider Settings
                  </Button>
                </div>
              </CommandEmpty>
            )}
            {currentModels.length > 0 && (
              <CommandGroup>
                <div className="flex flex-col">
                  {currentModels.map((model, index) => (
                    <ModelItem
                      key={`${model.provider}-${model.code}`}
                      index={index}
                      model={model}
                      densityClasses={densityClasses}
                      isFocused={focusedIndex === index}
                      isActive={
                        selectedModelCode === model.code &&
                        selectedModelProvider === model.provider
                      }
                      isFavorite={favoriteModels.includes(model.code)}
                      modelSelector={modelSelector}
                      compactMode={compactMode}
                      showDescriptions={showDescriptions}
                      showCapabilityBadges={showCapabilityBadges}
                      onSelect={onModelSelect}
                      onToggleFavorite={onToggleFavorite}
                      onFocusedIndexChange={onFocusedIndexChange}
                    />
                  ))}
                </div>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </div>
    </div>
  )
}

/**
 * ProviderSidebar component - vertical sidebar with provider tabs
 */
const ProviderSidebar = memo(function ProviderSidebar({
  activeTabKey,
  groupedModels,
  sidebarPosition,
  onTabSelect,
}: {
  activeTabKey: string
  groupedModels: GroupedModels
  sidebarPosition: 'left' | 'right'
  onTabSelect: (key: string) => void
}): React.ReactElement {
  const getModelCount = (providerKey: string): number => {
    return groupedModels[providerKey as keyof GroupedModels]?.length || 0
  }

  // Count models that are actually favorited
  const sidebarWidth = 'w-[56px]'
  const borderSide = sidebarPosition === 'right' ? 'border-l' : 'border-r'

  return (
    <div
      data-sidebar
      className={`${sidebarWidth} flex flex-col overflow-y-auto ${borderSide} border-border/50 bg-muted/20 shrink-0 relative z-10`}
    >
      <SidebarItem
        key="favorites"
        isActive={activeTabKey === 'favorites'}
        onClick={() => onTabSelect('favorites')}
        icon={<Star size={18} />}
        ariaLabel="Favorites"
      />

      {/* Provider Tabs - only show providers that have models (disabled providers have empty lists) */}
      {PROVIDERS.filter((provider) => getModelCount(provider.key) > 0).map((provider) => {
        return (
          <SidebarItem
            key={provider.key}
            isActive={activeTabKey === provider.key}
            onClick={() => onTabSelect(provider.key)}
            icon={<ProviderLogo provider={provider.key} size={20} />}
            ariaLabel={provider.title}
          />
        )
      })}
    </div>
  )
})

/**
 * SidebarItem component
 */
const SidebarItem = memo(function SidebarItem({
  isActive,
  onClick,
  icon,
  ariaLabel,
}: {
  isActive: boolean
  onClick: () => void
  icon: React.ReactNode
  ariaLabel: string
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onClick()
      }}
      onMouseDown={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      className={`
        theme-hover-surface relative flex items-center justify-center rounded-[10px] px-3 py-3.5 text-sm font-medium transition-colors cursor-pointer
        w-full
        ${
          isActive
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }
      `}
      data-active={isActive ? 'true' : undefined}
    >
      {icon}
      {isActive && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r" />
      )}
    </button>
  )
})

/**
 * ModelItem component
 */
/**
 * CapabilityBadge - styled pill badge with icon and/or text
 * Supports icon-only, text-only, or both based on capabilityBadgeDisplay setting
 */
function CapabilityBadge({
  capKey,
  showTooltip,
}: {
  capKey: string
  showTooltip: boolean
  display?: 'icon' | 'text' | 'both'
}): React.ReactElement | null {
  const style = CAPABILITY_BADGE_STYLES[capKey]
  if (!style) return null
  const Icon = style.icon

  // Extract the primary vibrant color from the gradient for the icon
  const primaryColor = style.gradient.match(/#[0-9a-f]{6}/i)?.[0] || style.iconColor

  return (
    <div
      className="inline-flex items-center justify-center shrink-0 rounded-full transition-opacity hover:opacity-80"
      style={{
        background: `${primaryColor}18`,
        color: primaryColor,
        width: 22,
        height: 22,
      }}
      title={showTooltip ? style.tooltip : undefined}
      aria-label={style.tooltip}
    >
      <Icon size={13} className="shrink-0" />
    </div>
  )
}

const ModelItem = memo(function ModelItem({
  index,
  model,
  densityClasses,
  isFocused,
  isActive,
  isFavorite,
  modelSelector,
  compactMode,
  showDescriptions,
  showCapabilityBadges,
  onSelect,
  onToggleFavorite,
  onFocusedIndexChange,
}: {
  index: number
  model: ModelWithProvider
  densityClasses: string
  isFocused: boolean
  isActive: boolean
  isFavorite: boolean
  modelSelector: ModelSelectorSettings
  compactMode: ModelSelectorCompactMode
  showDescriptions: boolean
  showCapabilityBadges: boolean
  onSelect: (model: ModelWithProvider, e?: React.MouseEvent) => void
  onToggleFavorite: (modelCode: string, e: React.MouseEvent) => void
  onFocusedIndexChange: (index: number) => void
}): React.ReactElement {
  const { badge } = getModelAttributes(model)
  const capabilities = getCapabilitiesForModelPicker(model)
  const isTight = compactMode === 'tight'

  return (
    <div
      role="option"
      data-model-index={index}
      onClick={(e) => onSelect(model, e)}
      onMouseEnter={() => onFocusedIndexChange(index)}
      className={cn(
        'theme-hover-surface flex w-full items-center relative rounded-[10px] text-left outline-hidden',
        'gap-3 px-4',
        densityClasses,
        isActive || isFocused ? 'text-foreground' : 'hover:text-foreground'
      )}
      aria-current={isActive ? 'true' : undefined}
      aria-selected={isFocused}
      data-active={isActive ? 'true' : undefined}
      tabIndex={-1}
    >
      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn('truncate font-semibold', isTight ? 'text-[13px]' : 'text-sm')}>
            {removeEmojis(model.displayName)}
          </span>
          {badge}
          {modelSelector.showFavoriteStars && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                onToggleFavorite(model.code, e as unknown as React.MouseEvent)
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-0.5 hover:bg-muted rounded transition-colors shrink-0"
              style={{
                color: isFavorite ? 'var(--theme-favorite)' : 'var(--theme-text-muted)',
                opacity: isFavorite ? 1 : 0.4,
              }}
            >
              <Star size={12} fill={isFavorite ? 'var(--theme-favorite)' : 'none'} />
            </button>
          )}
        </div>
        {showDescriptions && (
          <span className="text-xs text-muted-foreground truncate">
            {getModelDescription(model)}
          </span>
        )}
      </div>
      {showCapabilityBadges && capabilities.length > 0 && (
        <div className="flex items-center gap-1.5 shrink-0 flex-nowrap">
          {capabilities.map((capKey) => (
            <CapabilityBadge
              key={capKey}
              capKey={capKey}
              showTooltip={modelSelector.showInfoTooltips}
            />
          ))}
        </div>
      )}
    </div>
  )
})

export default ModelSelectorDropdown
