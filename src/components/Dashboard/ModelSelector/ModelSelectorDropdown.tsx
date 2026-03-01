/**
 * ModelSelectorDropdown component - renders the dropdown overlay
 * 
 * @module ModelSelector/ModelSelectorDropdown
 * Requirements: 3.1
 */

import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, Check } from 'lucide-react'
import type { ModelWithProvider, ViewMode, GroupedModels } from './types'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ModelIcon } from './ModelIcon'
import { getModelAttributes, getModelDescription, getCapabilitiesForModelPicker, CAPABILITY_BADGE_STYLES, formatContextLength, getModelContextLength } from '../../../utils/modelUtils'
import { removeEmojis } from '../../../utils/textUtils'
import { ProviderLogo } from '@/components/shared'
import { useSettings } from '../../../contexts/SettingsContext'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ModelSelectorSettings } from '../../../contexts/SettingsUIContext'

/**
 * Provider configuration
 */
const PROVIDERS = [
  { key: 'openrouter', title: 'OpenRouter' },
  { key: 'perplexity', title: 'Perplexity' },
  { key: 'groq', title: 'Groq' },
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
 * Get stagger delay based on speed setting
 */
function getStaggerDelay(speed: 'fast' | 'normal' | 'slow'): number {
  switch (speed) {
    case 'fast': return 0.02
    case 'slow': return 0.05
    default: return 0.03
  }
}

/**
 * Get density padding classes
 */
function getDensityClasses(density: 'compact' | 'comfortable' | 'spacious'): string {
  switch (density) {
    case 'compact': return 'py-1.5'
    case 'spacious': return 'py-3.5'
    default: return 'py-2.5'
  }
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
  selectedModelCode,
  selectedModelProvider,
  favoriteModels,
  onModelSelect,
  onToggleFavorite
}: ModelSelectorDropdownProps): React.ReactElement {
  const { settings } = useSettings()
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
          (searchInputRef as React.MutableRefObject<HTMLInputElement | null>).current = input
        }
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [modelSelector.showSearch, searchInputRef])

  // Determine active tab key (favorites or provider)
  const activeTabKey = viewMode === 'favorites' ? 'favorites' : selectedProvider

  const staggerDelay = getStaggerDelay(modelSelector.staggerSpeed)
  const densityClasses = getDensityClasses(modelSelector.itemDensity)

  return (
    <div className={`flex h-[484px] overflow-hidden ${modelSelector.sidebarPosition === 'right' ? 'flex-row-reverse' : ''}`}>
      {/* Vertical Provider Sidebar */}
      <ProviderSidebar
        activeTabKey={activeTabKey}
        groupedModels={groupedModels}
        favoriteModels={favoriteModels}
        sidebarShowLabels={modelSelector.sidebarShowLabels}
        sidebarShowModelCount={modelSelector.sidebarShowModelCount}
        enableAnimations={modelSelector.enableAnimations}
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

      {/* Main Area: Search + Model List */}
      <div className={`flex-1 flex flex-col overflow-hidden ${modelSelector.sidebarPosition === 'right' ? 'border-r' : 'border-l'} border-border/50 relative`}>
        {modelSelector.showSearch && (
          <div className="px-3 py-2 border-b border-border/50">
            <Command className="rounded-none border-0" shouldFilter={false}>
              <CommandInput
                placeholder="Search models..."
                value={searchQuery}
                onValueChange={onSearchChange}
                className="h-10"
              />
            </Command>
          </div>
        )}
        <Command className="flex-1 rounded-none border-0" shouldFilter={false}>
          <CommandList className="max-h-full">
            <CommandEmpty>
              <div className="py-6 text-center text-sm text-muted-foreground">
                No models found
              </div>
            </CommandEmpty>
            <CommandGroup heading={viewMode === 'favorites' ? 'Favorites' : PROVIDERS.find(p => p.key === selectedProvider)?.title || 'Models'}>
              <AnimatePresence mode="wait">
                {modelSelector.enableAnimations ? (
                  <motion.div
                    key={activeTabKey}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col gap-1"
                  >
                    {currentModels.map((model, index) => (
                      <ModelItem
                        key={`${model.provider}-${model.code}`}
                        model={model}
                        index={index}
                        staggerDelay={staggerDelay}
                        densityClasses={densityClasses}
                        isActive={selectedModelCode === model.code && selectedModelProvider === model.provider}
                        isFavorite={favoriteModels.includes(model.code)}
                        modelSelector={modelSelector}
                        onSelect={onModelSelect}
                        onToggleFavorite={onToggleFavorite}
                      />
                    ))}
                  </motion.div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {currentModels.map((model) => (
                      <ModelItem
                        key={`${model.provider}-${model.code}`}
                        model={model}
                        index={0}
                        staggerDelay={0}
                        densityClasses={densityClasses}
                        isActive={selectedModelCode === model.code && selectedModelProvider === model.provider}
                        isFavorite={favoriteModels.includes(model.code)}
                        modelSelector={modelSelector}
                        onSelect={onModelSelect}
                        onToggleFavorite={onToggleFavorite}
                      />
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </div>
  )
}

/**
 * ProviderSidebar component - vertical sidebar with provider tabs
 */
function ProviderSidebar({
  activeTabKey,
  groupedModels,
  favoriteModels,
  sidebarShowLabels,
  sidebarShowModelCount,
  enableAnimations,
  sidebarPosition,
  onTabSelect
}: {
  activeTabKey: string
  groupedModels: GroupedModels
  favoriteModels: string[]
  sidebarShowLabels: boolean
  sidebarShowModelCount: boolean
  enableAnimations: boolean
  sidebarPosition: 'left' | 'right'
  onTabSelect: (key: string) => void
}): React.ReactElement {
  const getModelCount = (providerKey: string): number => {
    return groupedModels[providerKey as keyof GroupedModels]?.length || 0
  }

  // Count models that are actually favorited
  const favoritesCount = favoriteModels.length

  const sidebarWidth = sidebarShowLabels ? 'w-[120px]' : 'w-[48px]'
  const borderSide = sidebarPosition === 'right' ? 'border-l' : 'border-r'
  
  return (
    <div data-sidebar className={`${sidebarWidth} flex flex-col ${borderSide} border-border/50 bg-muted/20 shrink-0 relative z-10`}>
      {/* Favorites Tab */}
      <SidebarItem
        key="favorites"
        isActive={activeTabKey === 'favorites'}
        onClick={() => onTabSelect('favorites')}
        icon={<Star size={16} />}
        label={sidebarShowLabels ? 'Favorites' : undefined}
        count={sidebarShowModelCount ? favoritesCount : undefined}
        enableAnimations={enableAnimations}
      />
      
      {/* Separator */}
      <div className="h-px bg-border/50 mx-2 my-1" />

      {/* Provider Tabs - only show providers that have models (disabled providers have empty lists) */}
      {PROVIDERS.filter(provider => getModelCount(provider.key) > 0).map(provider => {
        const count = getModelCount(provider.key)
        return (
          <SidebarItem
            key={provider.key}
            isActive={activeTabKey === provider.key}
            onClick={() => onTabSelect(provider.key)}
            icon={<ProviderLogo provider={provider.key} size={16} />}
            label={sidebarShowLabels ? provider.title : undefined}
            count={sidebarShowModelCount ? count : undefined}
            enableAnimations={enableAnimations}
          />
        )
      })}
    </div>
  )
}

/**
 * SidebarItem component
 */
function SidebarItem({
  isActive,
  onClick,
  icon,
  label,
  count,
  enableAnimations
}: {
  isActive: boolean
  onClick: () => void
  icon: React.ReactNode
  label?: string
  count?: number
  enableAnimations: boolean
}): React.ReactElement {
  const Button = enableAnimations ? motion.button : 'button'
  const buttonProps = enableAnimations ? {
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.98 },
  } : {}

  return (
    <Button
      {...buttonProps}
      type="button"
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
        relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer
        w-full
        ${label ? 'justify-start' : 'justify-center'}
        ${isActive 
          ? 'bg-primary/10 text-foreground' 
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }
      `}
    >
      {icon}
      {label && <span className="truncate">{label}</span>}
      {count !== undefined && count > 0 && (
        <span className="ml-auto text-xs opacity-60 bg-muted px-1.5 py-0.5 rounded">
          {count}
        </span>
      )}
      {isActive && enableAnimations && (
        <motion.div
          layoutId="provider-active"
          className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r"
          initial={false}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      {isActive && !enableAnimations && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r" />
      )}
    </Button>
  )
}

/**
 * ModelItem component
 */
/**
 * CapabilityBadge - styled pill badge with icon and/or text
 * Supports icon-only, text-only, or both based on capabilityBadgeDisplay setting
 */
function CapabilityBadge({
  capKey,
  display,
}: {
  capKey: string
  display: 'icon' | 'text' | 'both'
}): React.ReactElement | null {
  const style = CAPABILITY_BADGE_STYLES[capKey]
  if (!style) return null
  const Icon = style.icon

  const showIcon = display === 'icon' || display === 'both'
  const showText = display === 'text' || display === 'both'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="inline-flex items-center justify-center gap-1 shrink-0 rounded-md font-semibold transition-opacity hover:opacity-90"
          style={{
            background: style.gradient,
            color: style.iconColor,
            padding: display === 'icon' ? '4px' : '3px 6px',
            minWidth: display === 'icon' ? 20 : undefined,
            boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          {showIcon && <Icon size={display === 'icon' ? 12 : 10} className="shrink-0" />}
          {showText && <span className="text-[10px] leading-tight">{style.label}</span>}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {style.tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

function ModelItem({
  model,
  index,
  staggerDelay,
  densityClasses,
  isActive,
  isFavorite,
  modelSelector,
  onSelect,
  onToggleFavorite
}: {
  model: ModelWithProvider
  index: number
  staggerDelay: number
  densityClasses: string
  isActive: boolean
  isFavorite: boolean
  modelSelector: ModelSelectorSettings
  onSelect: (model: ModelWithProvider, e?: React.MouseEvent) => void
  onToggleFavorite: (modelCode: string, e: React.MouseEvent) => void
}): React.ReactElement {
  const { color } = getModelAttributes(model)
  const capabilities = getCapabilitiesForModelPicker(model)

  const ItemWrapper = modelSelector.enableAnimations ? motion.div : 'div'
  const wrapperProps = modelSelector.enableAnimations ? {
    initial: { opacity: 0, x: -8 },
    animate: { opacity: 1, x: 0 },
    transition: {
      delay: index * staggerDelay,
      type: "spring" as const,
      stiffness: 400,
      damping: 30
    }
  } : {}

  const activeIndicator = () => {
    switch (modelSelector.activeIndicatorStyle) {
      case 'checkmark':
        return <Check size={14} className="text-primary" />
      case 'highlight':
        return <div className="h-full w-1 bg-primary rounded-l absolute left-0 top-0 bottom-0" />
      default:
        return <div className="h-2 w-2 rounded-full bg-primary" />
    }
  }

  return (
    <ItemWrapper {...wrapperProps}>
      <CommandItem
        value={`${model.code} ${model.displayName}`}
        onSelect={() => onSelect(model)}
        className={`
          flex items-center gap-3 px-3 rounded-lg relative
          ${densityClasses}
          ${isActive && modelSelector.activeIndicatorStyle === 'highlight' ? 'bg-primary/10' : ''}
          ${!isActive ? 'hover:bg-muted/50' : ''}
          transition-colors
        `}
      >
        {modelSelector.showProviderLogos ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
            <ModelIcon
              model={model}
              icon={getModelAttributes(model).icon}
              color={color}
              size={22}
            />
          </div>
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
            {getModelAttributes(model).icon}
          </div>
        )}
        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-sm">
              {removeEmojis(model.displayName)}
            </span>
          </div>
          {modelSelector.showDescriptions && (
            <span className="text-xs text-muted-foreground truncate">
              {getModelDescription(model)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {modelSelector.showCapabilityBadges && capabilities.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap justify-end max-w-[160px]">
              {capabilities.map((capKey) => (
                <CapabilityBadge
                  key={capKey}
                  capKey={capKey}
                  display={modelSelector.capabilityBadgeDisplay ?? 'both'}
                />
              ))}
            </div>
          )}
          {modelSelector.showContextLength !== false && (() => {
            const ctx = getModelContextLength(model)
            const formatted = ctx != null ? formatContextLength(ctx) : ''
            return formatted ? (
              <span className="text-xs text-muted-foreground font-medium shrink-0">{formatted}</span>
            ) : null
          })()}
          {modelSelector.showFavoriteStars && (
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
              {modelSelector.enableAnimations ? (
                <motion.div
                  animate={isFavorite ? { scale: [1, 1.3, 1] } : {}}
                  transition={{ type: "spring", stiffness: 500, damping: 15 }}
                >
                  <Star size={12} fill={isFavorite ? '#FFD700' : 'none'} />
                </motion.div>
              ) : (
                <Star size={12} fill={isFavorite ? '#FFD700' : 'none'} />
              )}
            </button>
          )}
          {isActive && activeIndicator()}
        </div>
      </CommandItem>
    </ItemWrapper>
  )
}

export default ModelSelectorDropdown
