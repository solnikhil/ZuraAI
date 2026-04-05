import React, { useEffect } from 'react'
import { Command } from '@/components/ui/command'
import { useSettings } from '../../../contexts/SettingsContext'
import { useAppShell } from '../../../contexts/AppShellContext'
import { cn } from '@/lib/utils'
import type { ModelSelectorCompactMode, ModelWithProvider, ViewMode, GroupedModels } from './types'
import { DEFAULT_MODEL_SELECTOR_SETTINGS } from './modelSelectorDefaults'
import { ModelSelectorSearchBar } from './ModelSelectorSearchBar'
import { ModelSelectorProviderRail } from './ModelSelectorProviderRail'
import { ModelSelectorResultsPane } from './ModelSelectorResultsPane'

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
  focusedIndex: number
  selectedModelCode: string
  selectedModelProvider: string
  favoriteModels: string[]
  onModelSelect: (model: ModelWithProvider, e?: React.MouseEvent) => void
  onToggleFavorite: (modelCode: string, e: React.MouseEvent) => void
  onFocusedIndexChange: (index: number) => void
  compactMode?: ModelSelectorCompactMode
}

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
  const modelSelector = settings.modelSelector || DEFAULT_MODEL_SELECTOR_SETTINGS

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

  const activeTabKey = searchQuery.trim()
    ? ''
    : viewMode === 'favorites'
      ? 'favorites'
      : selectedProvider

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

  const sidebarWidthClass = 'w-[56px]'
  const sidebarBorderSide = modelSelector.sidebarPosition === 'right' ? 'border-l' : 'border-r'

  return (
    <Command shouldFilter={false} loop className="flex h-full flex-col rounded-none border-0 bg-transparent">
      {modelSelector.showSearch && (
        <ModelSelectorSearchBar
          compact={isCompact}
          tight={isTight}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
        />
      )}

      <div
        className={cn(
          'flex min-h-0 flex-1 overflow-hidden',
          modelSelector.sidebarPosition === 'right' && 'flex-row-reverse'
        )}
      >
        <div
          className={cn(
            sidebarWidthClass,
            sidebarBorderSide,
            'min-h-0 shrink-0 overflow-hidden bg-muted/20'
          )}
        >
          <ModelSelectorProviderRail
            activeTabKey={activeTabKey}
            groupedModels={groupedModels}
            onTabSelect={(key) => {
              if (key === 'favorites') {
                onViewModeChange('favorites')
              } else {
                onProviderSelect(key)
                onViewModeChange('all')
              }
            }}
          />
        </div>

        <div
          className={cn(
            'relative flex h-full min-h-0 flex-1 flex-col overflow-hidden',
            modelSelector.sidebarPosition === 'right' ? 'border-r' : 'border-l',
            'border-border/50'
          )}
        >
          <ModelSelectorResultsPane
            compactMode={compactMode}
            currentModels={currentModels}
            densityClasses={densityClasses}
            emptyStateHeading={emptyStateHeading}
            favoriteModels={favoriteModels}
            focusedIndex={focusedIndex}
            modelSelector={modelSelector}
            selectedModelCode={selectedModelCode}
            selectedModelProvider={selectedModelProvider}
            showCapabilityBadges={showCapabilityBadges}
            showDescriptions={showDescriptions}
            onFocusedIndexChange={onFocusedIndexChange}
            onModelSelect={onModelSelect}
            onOpenProviders={handleOpenProviders}
            onToggleFavorite={onToggleFavorite}
          />
        </div>
      </div>
    </Command>
  )
}

export default ModelSelectorDropdown
