import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { ProviderLogo } from '@/components/shared'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { getPickerVisibleProviders, getProviderDefinition } from '@/providers'
import { filterModels } from '../../../utils/modelUtils'
import { removeEmojis } from '../../../utils/textUtils'
import type { DeepSeekReasoningEffort } from '../../../contexts/SettingsConfigContext'
import type { GroupedModels, ModelWithProvider } from './types'
import { cn } from '@/lib/utils'

export interface ModelSelectorDropdownProps {
  /** Popover/menu alignment relative to the trigger. */
  align?: 'start' | 'center' | 'end'
  /** Models grouped by provider id (already filtered to enabled + configured). */
  groupedModels: GroupedModels
  /** Display name of the active model (shown on the current-model row). */
  currentName: string
  /** Active model record, used for the current-model row logo. */
  currentModel?: ModelWithProvider
  /** Active model code + provider for the ✓ active marker. */
  selectedModelCode: string
  selectedModelProvider: string
  /** Selection handler (closes the menu via useModelSelector). */
  onModelSelect: (model: ModelWithProvider) => void
  /** Whether to render the reasoning-effort section at all (DeepSeek models). */
  showReasoning: boolean
  /** Whether reasoning is enabled (interactive). When false, the section is greyed/disabled. */
  reasoningEnabled: boolean
  reasoningEffort: DeepSeekReasoningEffort
  reasoningEfforts: readonly DeepSeekReasoningEffort[]
  onReasoningEffortChange: (effort: DeepSeekReasoningEffort) => void
}

/**
 * Cascading model picker content (Codex / memory-selector style).
 *
 * Structure: an optional top "Reasoning effort" group (only for the active
 * DeepSeek model with reasoning enabled), then a single current-model row that
 * opens a provider submenu, each provider opening its own models submenu.
 * Provider → models mirrors the cascade in Settings → Memory.
 */
export function ModelSelectorDropdown({
  align = 'start',
  groupedModels,
  currentName,
  currentModel,
  selectedModelCode,
  selectedModelProvider,
  onModelSelect,
  showReasoning,
  reasoningEnabled,
  reasoningEffort,
  reasoningEfforts,
  onReasoningEffortChange,
}: ModelSelectorDropdownProps): React.ReactElement {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const providers = getPickerVisibleProviders()
    .filter((provider) => (groupedModels[provider.id]?.length || 0) > 0)
    .map((provider) => ({ id: provider.id, label: getProviderDefinition(provider.id).label }))

  // Flat list (provider order) backing the search results.
  const allModels = getPickerVisibleProviders().flatMap(
    (provider) => groupedModels[provider.id] || []
  )

  const searching = query.trim().length > 0
  const results = useMemo(() => filterModels(allModels, query), [allModels, query])

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <DropdownMenuContent
      align={align}
      sideOffset={8}
      collisionPadding={12}
      className="theme-menu-surface w-[260px] rounded-[14px] p-0.5 shadow-none"
      onCloseAutoFocus={() => setQuery('')}
    >
      {searching ? (
        <div className="flex max-h-[50vh] flex-col gap-0.5 overflow-y-auto p-0.5">
          {results.length === 0 ? (
            <div className="px-1.5 py-2 text-[12px] text-[var(--theme-text-muted)]">
              No models found
            </div>
          ) : (
            results.map((model) => {
              const isActive =
                model.code === selectedModelCode && model.provider === selectedModelProvider
              return (
                <button
                  key={`${model.provider}-${model.code}`}
                  type="button"
                  onClick={() => onModelSelect(model)}
                  className="flex h-8 items-center gap-2 rounded-[12px] px-1.5 text-[12px] text-[var(--theme-text-primary)] transition-colors hover:bg-[var(--theme-surface-hover)]"
                >
                  <ProviderLogo provider={model.provider} size={14} />
                  <span className="flex-1 truncate text-left">{removeEmojis(model.displayName)}</span>
                  {isActive && (
                    <Check className="h-3.5 w-3.5 text-[var(--theme-primary)]" aria-label="Active model" />
                  )}
                </button>
              )
            })
          )}
        </div>
      ) : (
        <>
          {showReasoning && (
            <>
              <DropdownMenuLabel
                className={cn(
                  'px-1.5 pb-1 pt-1.5 text-[12px] font-medium text-[var(--theme-text-tertiary)]',
                  !reasoningEnabled && 'opacity-50'
                )}
              >
                Reasoning effort
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={reasoningEffort}
                onValueChange={
                  reasoningEnabled
                    ? (value) => onReasoningEffortChange(value as DeepSeekReasoningEffort)
                    : undefined
                }
              >
                {reasoningEfforts.map((effort) => (
                  <DropdownMenuRadioItem
                    key={effort}
                    value={effort}
                    disabled={!reasoningEnabled}
                    className="h-8 rounded-[12px] pr-1.5 text-[12px] capitalize"
                  >
                    {effort}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator className="mx-0 my-px h-px" />
            </>
          )}

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="h-8 rounded-[12px] px-1.5 text-[12px]">
              {currentModel && <ProviderLogo provider={currentModel.provider} size={14} />}
              <span className="truncate">{currentName}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              sideOffset={8}
              collisionPadding={12}
              className="theme-menu-surface w-[220px] rounded-[14px] p-0.5 shadow-none"
            >
              {providers.length === 0 ? (
                <DropdownMenuItem disabled className="h-8 rounded-[12px] px-1.5 text-[12px]">
                  No models available
                </DropdownMenuItem>
              ) : (
                providers.map((provider) => (
                  <DropdownMenuSub key={provider.id}>
                    <DropdownMenuSubTrigger className="h-8 rounded-[12px] px-1.5 text-[12px]">
                      <ProviderLogo provider={provider.id} size={14} />
                      <span>{provider.label}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                      sideOffset={8}
                      collisionPadding={12}
                      className="theme-menu-surface w-[240px] max-h-[60vh] overflow-y-auto rounded-[14px] p-0.5 shadow-none"
                    >
                      {(groupedModels[provider.id] || []).map((model) => {
                        const isActive =
                          model.code === selectedModelCode &&
                          model.provider === selectedModelProvider
                        return (
                          <DropdownMenuItem
                            key={`${model.provider}-${model.code}`}
                            onSelect={() => onModelSelect(model)}
                            className="h-8 rounded-[12px] px-1.5 text-[12px]"
                          >
                            <ProviderLogo provider={model.provider} size={14} />
                            <span className="flex-1 truncate">{removeEmojis(model.displayName)}</span>
                            {isActive && (
                              <Check
                                className="h-3.5 w-3.5 text-[var(--theme-primary)]"
                                aria-label="Active model"
                              />
                            )}
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ))
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </>
      )}

      <DropdownMenuSeparator className="mx-0 my-px h-px" />
      <div className="p-0.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--theme-text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Let Escape bubble to close the menu; keep typing/arrows local.
              if (event.key !== 'Escape') event.stopPropagation()
            }}
            placeholder="Type a command or search..."
            aria-label="Search models"
            className="h-9 w-full rounded-[10px] border-0 bg-transparent pl-8 pr-2 text-[12px] text-[var(--theme-text-primary)] outline-none placeholder:text-[var(--theme-text-muted)]"
          />
        </div>
      </div>
    </DropdownMenuContent>
  )
}

export default ModelSelectorDropdown
