import React, { memo } from 'react'
import { Star } from 'lucide-react'
import { CommandEmpty, CommandGroup, CommandList } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import {
  CAPABILITY_BADGE_STYLES,
  getCapabilitiesForModelPicker,
  getModelAttributes,
  getModelDescription,
} from '../../../utils/modelUtils'
import { removeEmojis } from '../../../utils/textUtils'
import type { ModelSelectorSettings } from '../../../contexts/SettingsUIContext'
import type { ModelSelectorCompactMode, ModelWithProvider } from './types'
import { cn } from '@/lib/utils'

interface ModelSelectorResultsPaneProps {
  compactMode: ModelSelectorCompactMode
  currentModels: ModelWithProvider[]
  densityClasses: string
  emptyStateHeading: string
  favoriteModels: string[]
  focusedIndex: number
  modelSelector: ModelSelectorSettings
  selectedModelCode: string
  selectedModelProvider: string
  showCapabilityBadges: boolean
  showDescriptions: boolean
  onFocusedIndexChange: (index: number) => void
  onModelSelect: (model: ModelWithProvider, e?: React.MouseEvent) => void
  onOpenProviders: () => void
  onToggleFavorite: (modelCode: string, e: React.MouseEvent) => void
}

export function ModelSelectorResultsPane({
  compactMode,
  currentModels,
  densityClasses,
  emptyStateHeading,
  favoriteModels,
  focusedIndex,
  modelSelector,
  selectedModelCode,
  selectedModelProvider,
  showCapabilityBadges,
  showDescriptions,
  onFocusedIndexChange,
  onModelSelect,
  onOpenProviders,
  onToggleFavorite,
}: ModelSelectorResultsPaneProps): React.ReactElement {
  const emptyStateBody =
    emptyStateHeading === 'No favorite models yet'
      ? 'Star a model after enabling a provider to pin it here for quick access.'
      : 'Enable a provider in Settings, add your API key or local model, then come back to select it.'

  return (
    <CommandList className="flex-1 max-h-full">
      {currentModels.length === 0 && (
        <CommandEmpty>
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">{emptyStateHeading}</div>
              <div className="max-w-xs text-sm leading-6 text-muted-foreground">
                {emptyStateBody}
              </div>
            </div>
            <Button type="button" size="sm" onClick={onOpenProviders}>
              Open Provider Settings
            </Button>
          </div>
        </CommandEmpty>
      )}

      {currentModels.length > 0 && (
        <CommandGroup>
          <div className="flex flex-col">
            {currentModels.map((model, index) => (
              <ModelSelectorResultRow
                key={`${model.provider}-${model.code}`}
                compactMode={compactMode}
                densityClasses={densityClasses}
                index={index}
                isActive={
                  selectedModelCode === model.code && selectedModelProvider === model.provider
                }
                isFavorite={favoriteModels.includes(model.code)}
                isFocused={focusedIndex === index}
                model={model}
                modelSelector={modelSelector}
                showCapabilityBadges={showCapabilityBadges}
                showDescriptions={showDescriptions}
                onFocusedIndexChange={onFocusedIndexChange}
                onSelect={onModelSelect}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </CommandGroup>
      )}
    </CommandList>
  )
}

interface ModelSelectorResultRowProps {
  compactMode: ModelSelectorCompactMode
  densityClasses: string
  index: number
  isActive: boolean
  isFavorite: boolean
  isFocused: boolean
  model: ModelWithProvider
  modelSelector: ModelSelectorSettings
  showCapabilityBadges: boolean
  showDescriptions: boolean
  onFocusedIndexChange: (index: number) => void
  onSelect: (model: ModelWithProvider, e?: React.MouseEvent) => void
  onToggleFavorite: (modelCode: string, e: React.MouseEvent) => void
}

const ModelSelectorResultRow = memo(function ModelSelectorResultRow({
  compactMode,
  densityClasses,
  index,
  isActive,
  isFavorite,
  isFocused,
  model,
  modelSelector,
  showCapabilityBadges,
  showDescriptions,
  onFocusedIndexChange,
  onSelect,
  onToggleFavorite,
}: ModelSelectorResultRowProps): React.ReactElement {
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
        'theme-hover-surface relative flex w-full items-center gap-3 rounded-[10px] px-4 text-left outline-hidden transition-colors',
        densityClasses,
        isActive
          ? 'bg-[color-mix(in_srgb,var(--theme-surface-hover)_80%,transparent)] text-foreground'
          : isFocused
            ? 'text-foreground'
            : 'hover:text-foreground'
      )}
      aria-current={isActive ? 'true' : undefined}
      aria-selected={isFocused}
      data-active={isActive ? 'true' : undefined}
      tabIndex={-1}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn('truncate font-semibold', isTight ? 'text-[13px]' : 'text-sm')}>
            {removeEmojis(model.displayName)}
          </span>
          {badge}
          {modelSelector.showFavoriteStars && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                onToggleFavorite(model.code, e)
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="shrink-0 rounded p-0.5 transition-colors hover:bg-muted"
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
          <span className="truncate text-xs text-muted-foreground">
            {getModelDescription(model)}
          </span>
        )}
      </div>
      {showCapabilityBadges && capabilities.length > 0 && (
        <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
          {capabilities.map((capKey) => (
            <CapabilityBadge
              key={capKey}
              capKey={capKey}
              showTooltip={modelSelector.showInfoTooltips}
            />
          ))}
        </div>
      )}
      {isActive && <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/85" aria-hidden="true" />}
    </div>
  )
})

interface CapabilityBadgeProps {
  capKey: string
  showTooltip: boolean
}

function CapabilityBadge({
  capKey,
  showTooltip,
}: CapabilityBadgeProps): React.ReactElement | null {
  const style = CAPABILITY_BADGE_STYLES[capKey]
  if (!style) return null

  const Icon = style.icon
  const primaryColor = style.gradient.match(/#[0-9a-f]{6}/i)?.[0] || style.iconColor

  return (
    <div
      className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80"
      style={{
        background: `${primaryColor}18`,
        color: primaryColor,
      }}
      title={showTooltip ? style.tooltip : undefined}
      aria-label={style.tooltip}
    >
      <Icon size={13} className="shrink-0" />
    </div>
  )
}

export default ModelSelectorResultsPane
