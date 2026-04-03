/**
 * ModelSelectorDropdown component - renders the model picker dialog body.
 */

import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, Check, Search } from 'lucide-react'
import type { ModelWithProvider, ViewMode, GroupedModels, ModelSelectorCompactMode } from './types'
import { Button } from '@/components/ui/button'
import { ModelIcon } from './ModelIcon'
import {
  getModelAttributes,
  getModelDescription,
  getCapabilitiesForModelPicker,
  CAPABILITY_BADGE_STYLES,
  formatContextLength,
  getModelContextLength,
} from '../../../utils/modelUtils'
import { removeEmojis } from '../../../utils/textUtils'
import { ProviderLogo } from '@/components/shared'
import { useSettings } from '../../../contexts/SettingsContext'
import { useAppShell } from '../../../contexts/AppShellContext'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ModelSelectorSettings } from '../../../contexts/SettingsUIContext'
import { cn } from '@/lib/utils'

const PROVIDERS = [
  { key: 'openrouter', title: 'OpenRouter' },
  { key: 'perplexity', title: 'Perplexity' },
  { key: 'groq', title: 'Groq' },
  { key: 'fireworks', title: 'Fireworks' },
  { key: 'alibaba', title: 'Alibaba Cloud' },
  { key: 'ollama', title: 'Ollama' },
] as const

export interface ModelSelectorDropdownProps {
  searchInputRef: React.RefObject<HTMLInputElement | null>
  searchQuery: string
  onSearchChange: (query: string) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  selectedProvider: string
  onProviderSelect: (provider: string) => void
  currentModels: ModelWithProvider[]
  groupedModels: GroupedModels
  selectedModelCode: string
  selectedModelProvider: string
  favoriteModels: string[]
  onModelSelect: (model: ModelWithProvider, e?: React.MouseEvent) => void
  onToggleFavorite: (modelCode: string, e: React.MouseEvent) => void
  compactMode?: ModelSelectorCompactMode
  focusedIndex?: number
  onFocusedIndexChange?: (index: number) => void
}

function KeyHint({
  keys,
  label,
}: {
  keys: string[]
  label: string
}): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
      {keys.map((key) => (
        <kbd
          key={key}
          className="inline-flex min-w-5 items-center justify-center rounded border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          {key}
        </kbd>
      ))}
      <span>{label}</span>
    </span>
  )
}

function getProviderTitle(key: string): string {
  if (key === 'favorites') return 'Favorites'
  const provider = PROVIDERS.find((entry) => entry.key === key)
  return provider?.title ?? key
}

function getStaggerDelay(speed: 'fast' | 'normal' | 'slow'): number {
  switch (speed) {
    case 'fast':
      return 0.02
    case 'slow':
      return 0.05
    default:
      return 0.03
  }
}

function getDensityClasses(density: 'compact' | 'comfortable' | 'spacious'): string {
  switch (density) {
    case 'compact':
      return 'py-1.5'
    case 'spacious':
      return 'py-3'
    default:
      return 'py-2'
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
  onToggleFavorite,
  compactMode = 'none',
  focusedIndex = -1,
  onFocusedIndexChange,
}: ModelSelectorDropdownProps): React.ReactElement {
  const { settings } = useSettings()
  const { setDashboardView, setActiveSettingsSection } = useAppShell()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
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

  useEffect(() => {
    if (!modelSelector.showSearch) return
    const timer = setTimeout(() => {
      const input = inputRef.current
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
    const target = itemRefs.current[focusedIndex]
    target?.scrollIntoView({ block: 'nearest' })
  }, [focusedIndex, currentModels])

  const activeTabKey = viewMode === 'favorites' ? 'favorites' : selectedProvider
  const staggerDelay = getStaggerDelay(modelSelector.staggerSpeed)
  const responsiveDensity = getResponsiveDensity(modelSelector.itemDensity, compactMode)
  const densityClasses = getDensityClasses(responsiveDensity)
  const isTight = compactMode === 'tight'
  const sidebarShowModelCount = !isTight && modelSelector.sidebarShowModelCount
  const showDescriptions = modelSelector.showDescriptions && !isTight
  const showCapabilityBadges = modelSelector.showCapabilityBadges && !isTight
  const showContextLength = modelSelector.showContextLength !== false && !isTight
  const emptyStateHeading =
    viewMode === 'favorites' ? 'No favorite models yet' : 'No models configured'
  const listSummaryLabel =
    viewMode === 'favorites'
      ? `${currentModels.length} favorite${currentModels.length === 1 ? '' : 's'}`
      : `${currentModels.length} available model${currentModels.length === 1 ? '' : 's'}`
  const listSummaryNote =
    viewMode === 'favorites'
      ? 'Pinned for quick access'
      : searchQuery.trim()
        ? 'Matching across enabled providers'
        : getProviderTitle(selectedProvider)

  const handleOpenProviders = () => {
    setActiveSettingsSection('providers')
    setDashboardView('settings')
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 overflow-hidden',
        modelSelector.sidebarPosition === 'right' && 'flex-row-reverse'
      )}
    >
      <ProviderRail
        activeTabKey={activeTabKey}
        groupedModels={groupedModels}
        favoriteModels={favoriteModels}
        sidebarShowModelCount={sidebarShowModelCount}
        enableAnimations={modelSelector.enableAnimations}
        sidebarPosition={modelSelector.sidebarPosition}
        onTabSelect={(key) => {
          if (key === 'favorites') {
            onViewModeChange('favorites')
            onFocusedIndexChange?.(-1)
            return
          }
          onProviderSelect(key)
          onViewModeChange('all')
          onFocusedIndexChange?.(-1)
        }}
      />

      <div
        className={cn(
          'relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--theme-surface)]',
          modelSelector.sidebarPosition === 'right' ? 'border-r' : 'border-l',
          'border-border/50'
        )}
      >
        <PickerHeader
          inputRef={inputRef}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          showSearch={modelSelector.showSearch}
          compactMode={compactMode}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/85">
              {listSummaryLabel}
            </span>
            <span className="text-[11px] text-muted-foreground/70">{listSummaryNote}</span>
          </div>

          <div
            role="listbox"
            aria-label="Available models"
            className="custom-scrollbar flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-3.5"
          >
            {currentModels.length === 0 ? (
              <EmptyState
                heading={emptyStateHeading}
                viewMode={viewMode}
                onOpenProviders={handleOpenProviders}
              />
            ) : (
              <div className="flex flex-col gap-2">
                <AnimatePresence mode="wait">
                  <div className="flex flex-col gap-2" key={activeTabKey}>
                    {currentModels.map((model, index) => (
                      <ModelItem
                        key={`${model.provider}-${model.code}`}
                        ref={(element) => {
                          itemRefs.current[index] = element
                        }}
                        model={model}
                        index={index}
                        staggerDelay={staggerDelay}
                        densityClasses={densityClasses}
                        isActive={
                          selectedModelCode === model.code &&
                          selectedModelProvider === model.provider
                        }
                        isFavorite={favoriteModels.includes(model.code)}
                        isFocused={focusedIndex === index}
                        modelSelector={modelSelector}
                        compactMode={compactMode}
                        showDescriptions={showDescriptions}
                        showCapabilityBadges={showCapabilityBadges}
                        showContextLength={showContextLength}
                        animationsEnabled={modelSelector.enableAnimations}
                        onSelect={onModelSelect}
                        onToggleFavorite={onToggleFavorite}
                        onHover={() => onFocusedIndexChange?.(index)}
                      />
                    ))}
                  </div>
                </AnimatePresence>
              </div>
            )}
          </div>

          <PickerFooter />
        </div>
      </div>
    </div>
  )
}

function PickerHeader({
  inputRef,
  searchQuery,
  onSearchChange,
  showSearch,
  compactMode,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  searchQuery: string
  onSearchChange: (query: string) => void
  showSearch: boolean
  compactMode: ModelSelectorCompactMode
}): React.ReactElement | null {
  if (!showSearch) return null

  const isCompact = compactMode !== 'none'

  return (
    <div className={cn('border-b border-border/50 px-5', isCompact ? 'py-3' : 'py-3.5')}>
      <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-[color-mix(in_srgb,var(--theme-surface-elevated)_88%,black_12%)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground/80">
          <Search size={16} />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search models, providers, or capabilities"
          className={cn(
            'h-6 min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/65',
            isCompact && 'text-sm'
          )}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  )
}

function EmptyState({
  heading,
  viewMode,
  onOpenProviders,
}: {
  heading: string
  viewMode: ViewMode
  onOpenProviders: () => void
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">{heading}</div>
        <div className="max-w-xs text-sm leading-6 text-muted-foreground">
          {viewMode === 'favorites'
            ? 'Star a model after enabling a provider to pin it here for faster switching.'
            : 'Enable a provider in Settings, add your API key or local model, then come back to select it.'}
        </div>
      </div>
      <Button type="button" size="sm" onClick={onOpenProviders}>
        Open Provider Settings
      </Button>
    </div>
  )
}

function PickerFooter(): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/50 px-5 py-3">
      <span className="text-[11px] text-muted-foreground/65">
        Enter applies the highlighted model to this chat
      </span>
      <div className="flex items-center gap-3">
        <KeyHint keys={['Up/Down']} label="Navigate" />
        <KeyHint keys={['Enter']} label="Select" />
        <KeyHint keys={['Esc']} label="Close" />
      </div>
    </div>
  )
}

function ProviderRail({
  activeTabKey,
  groupedModels,
  favoriteModels,
  sidebarShowModelCount,
  enableAnimations,
  sidebarPosition,
  onTabSelect,
}: {
  activeTabKey: string
  groupedModels: GroupedModels
  favoriteModels: string[]
  sidebarShowModelCount: boolean
  enableAnimations: boolean
  sidebarPosition: 'left' | 'right'
  onTabSelect: (key: string) => void
}): React.ReactElement {
  const getModelCount = (providerKey: string): number => {
    return groupedModels[providerKey as keyof GroupedModels]?.length || 0
  }

  const sidebarWidth = 'w-[68px]'
  const borderSide = sidebarPosition === 'right' ? 'border-l' : 'border-r'

  return (
    <div
      data-sidebar
      className={`${sidebarWidth} custom-scrollbar relative z-10 flex shrink-0 flex-col overflow-x-hidden overflow-y-auto ${borderSide} border-border/50 bg-[color-mix(in_srgb,var(--theme-surface)_91%,black_9%)]`}
    >
      <div className="px-2 py-3">
        <div className="flex flex-col gap-1.5">
          <SidebarItem
            isActive={activeTabKey === 'favorites'}
            onClick={() => onTabSelect('favorites')}
            icon={<Star size={16} />}
            label="Favorites"
            count={sidebarShowModelCount ? favoriteModels.length : undefined}
            enableAnimations={enableAnimations}
          />

          {PROVIDERS.filter((provider) => getModelCount(provider.key) > 0).map((provider) => (
            <SidebarItem
              key={provider.key}
              isActive={activeTabKey === provider.key}
              onClick={() => onTabSelect(provider.key)}
              icon={<ProviderLogo provider={provider.key} size={16} />}
              label={provider.title}
              count={sidebarShowModelCount ? getModelCount(provider.key) : undefined}
              enableAnimations={enableAnimations}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function SidebarItem({
  isActive,
  onClick,
  icon,
  label,
  count,
  enableAnimations,
}: {
  isActive: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number
  enableAnimations: boolean
}): React.ReactElement {
  const ButtonComponent = enableAnimations ? motion.button : 'button'
  const buttonProps = enableAnimations
    ? {
        whileHover: { scale: 1.02 },
        whileTap: { scale: 0.98 },
      }
    : {}

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ButtonComponent
          {...buttonProps}
          type="button"
          aria-label={count !== undefined ? `${label} (${count})` : label}
          onClick={(event) => {
            event.stopPropagation()
            event.preventDefault()
            onClick()
          }}
          onMouseDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
          }}
          onPointerDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
          }}
          className={cn(
            'relative flex h-11 w-full cursor-pointer items-center justify-center rounded-xl border text-sm font-medium transition-colors',
            isActive
              ? 'border-primary/25 bg-primary/12 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
              : 'border-transparent text-muted-foreground hover:border-border/60 hover:bg-muted/35 hover:text-foreground'
          )}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/10">
            {icon}
          </span>
          {count !== undefined && count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-surface-elevated)] px-1 text-[10px] font-semibold text-muted-foreground">
              {count}
            </span>
          )}
          {isActive && enableAnimations && (
            <motion.div
              layoutId="provider-active"
              className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary"
              initial={false}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          {isActive && !enableAnimations && (
            <div className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
          )}
        </ButtonComponent>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

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
          className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-white/15 font-semibold transition-opacity hover:opacity-90"
          style={{
            background: style.gradient,
            color: style.iconColor,
            padding: display === 'icon' ? '4px' : '3px 6px',
            minWidth: display === 'icon' ? 20 : undefined,
            boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
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

const ModelItem = React.forwardRef<
  HTMLDivElement,
  {
    model: ModelWithProvider
    index: number
    staggerDelay: number
    densityClasses: string
    isActive: boolean
    isFavorite: boolean
    isFocused: boolean
    modelSelector: ModelSelectorSettings
    compactMode: ModelSelectorCompactMode
    showDescriptions: boolean
    showCapabilityBadges: boolean
    showContextLength: boolean
    animationsEnabled: boolean
    onSelect: (model: ModelWithProvider, e?: React.MouseEvent) => void
    onToggleFavorite: (modelCode: string, e: React.MouseEvent) => void
    onHover: () => void
  }
>(function ModelItem(
  {
    model,
    index,
    staggerDelay,
    densityClasses,
    isActive,
    isFavorite,
    isFocused,
    modelSelector,
    compactMode,
    showDescriptions,
    showCapabilityBadges,
    showContextLength,
    animationsEnabled,
    onSelect,
    onToggleFavorite,
    onHover,
  },
  ref
): React.ReactElement {
  const { color } = getModelAttributes(model)
  const capabilities = getCapabilitiesForModelPicker(model)
  const isCompact = compactMode !== 'none'
  const isTight = compactMode === 'tight'
  const isHighlighted = isActive || isFocused
  const metadataColumnWidth = isTight ? 104 : isCompact ? 148 : 220
  const rowGridTemplate = `auto minmax(0,1fr) ${metadataColumnWidth}px 56px 32px 18px`

  const ItemWrapper = animationsEnabled ? motion.div : 'div'
  const wrapperProps = animationsEnabled
    ? {
        initial: { opacity: 0, x: -8 },
        animate: { opacity: 1, x: 0 },
        transition: {
          delay: index * staggerDelay,
          type: 'spring' as const,
          stiffness: 400,
          damping: 30,
        },
      }
    : {}

  return (
    <ItemWrapper {...wrapperProps}>
      <div
        ref={ref}
        role="option"
        aria-selected={isActive}
        tabIndex={0}
        onClick={() => onSelect(model)}
        onFocus={onHover}
        onMouseEnter={onHover}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect(model)
          }
        }}
        style={{ gridTemplateColumns: rowGridTemplate }}
        className={cn(
          'group relative grid w-full items-center rounded-2xl border text-left transition-colors',
          isTight ? 'gap-x-2.5 gap-y-2 px-3 py-2.5' : isCompact ? 'gap-x-3 gap-y-2 px-3.5 py-3' : 'gap-x-3.5 gap-y-2 px-4 py-3.5',
          densityClasses,
          isHighlighted
            ? 'border-primary/30 bg-[color-mix(in_srgb,var(--theme-primary)_10%,var(--theme-surface-elevated)_90%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
            : 'border-border/30 bg-[color-mix(in_srgb,var(--theme-surface-elevated)_84%,black_16%)] hover:border-border/60 hover:bg-[color-mix(in_srgb,var(--theme-surface-elevated)_88%,black_12%)]'
        )}
      >
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-xl border border-white/5 bg-black/10',
            isCompact ? 'h-9 w-9' : 'h-10 w-10'
          )}
        >
          {modelSelector.showProviderLogos ? (
            <ModelIcon
              model={model}
              icon={getModelAttributes(model).icon}
              color={color}
              size={isCompact ? 20 : 24}
            />
          ) : (
            getModelAttributes(model).icon
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {removeEmojis(model.displayName)}
          </div>
          {showDescriptions && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {getModelDescription(model)}
            </div>
          )}
        </div>

        <div className="flex min-w-0 shrink-0 items-center justify-end">
          {showCapabilityBadges && capabilities.length > 0 && (
            <div
              className={cn(
                'scrollbar-hide flex min-w-0 items-center justify-end gap-1.5 overflow-x-auto overflow-y-hidden whitespace-nowrap pr-0.5',
                isTight ? 'max-w-[104px]' : isCompact ? 'max-w-[148px]' : 'max-w-[220px]'
              )}
            >
              {capabilities.map((capKey) => (
                <CapabilityBadge
                  key={capKey}
                  capKey={capKey}
                  display={modelSelector.capabilityBadgeDisplay ?? 'both'}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex h-full shrink-0 items-center justify-end">
          {showContextLength &&
            (() => {
              const ctx = getModelContextLength(model)
              const formatted = ctx != null ? formatContextLength(ctx) : ''
              return formatted ? (
                <span className="w-14 shrink-0 text-right text-xs font-medium text-muted-foreground">
                  {formatted}
                </span>
              ) : null
            })()}
        </div>

        <div className="flex h-full shrink-0 items-center justify-end">
          {modelSelector.showFavoriteStars && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                event.preventDefault()
                onToggleFavorite(model.code, event as unknown as React.MouseEvent)
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="rounded-lg p-1 transition-colors hover:bg-muted"
              style={{
                color: isFavorite ? 'var(--theme-favorite)' : 'var(--theme-text-muted)',
                opacity: isFavorite ? 1 : 0.45,
              }}
            >
              {animationsEnabled ? (
                <motion.div
                  animate={isFavorite ? { scale: [1, 1.3, 1] } : {}}
                  transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                >
                  <Star size={12} fill={isFavorite ? 'var(--theme-favorite)' : 'none'} />
                </motion.div>
              ) : (
                <Star size={12} fill={isFavorite ? 'var(--theme-favorite)' : 'none'} />
              )}
            </button>
          )}
        </div>

        <div className="flex h-full shrink-0 items-center justify-center">
          {isActive ? (
            modelSelector.activeIndicatorStyle === 'checkmark' ? (
              <Check size={14} className="text-primary" />
            ) : (
              <div className="h-2 w-2 rounded-full bg-primary" />
            )
          ) : null}
        </div>
      </div>
    </ItemWrapper>
  )
})

export default ModelSelectorDropdown
