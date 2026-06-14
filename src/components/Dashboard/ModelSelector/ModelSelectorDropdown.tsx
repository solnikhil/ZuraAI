import React from 'react'
import { Check } from 'lucide-react'
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
import { getReasoningEffortLabel } from '../../../utils/deepseekReasoning'
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
  const providers = getPickerVisibleProviders()
    .filter((provider) => (groupedModels[provider.id]?.length || 0) > 0)
    .map((provider) => ({ id: provider.id, label: getProviderDefinition(provider.id).label }))

  return (
    <DropdownMenuContent
      align={align}
      sideOffset={8}
      collisionPadding={12}
      className="theme-menu-surface w-[248px] rounded-[16px] p-1.5 shadow-none"
    >
      {showReasoning && (
        <>
          <DropdownMenuLabel
            className={cn(
              'px-2 pb-1.5 pt-2 font-[var(--font-sans)] text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--theme-text-tertiary)]',
              !reasoningEnabled && 'opacity-50'
            )}
          >
            Reasoning effort
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            className="flex flex-col gap-0.5"
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
                className="min-h-9 rounded-[10px] py-2 pl-3 pr-2 font-[var(--font-sans)] text-[13px] font-medium leading-none tracking-[0.01em] transition-colors data-[state=checked]:bg-[var(--theme-surface-active)] data-[state=checked]:text-[var(--theme-text-primary)] data-[state=checked]:shadow-[inset_0_0_0_1px_var(--theme-border-subtle)] focus:bg-[var(--theme-surface-hover)] [&>span:first-child]:hidden"
              >
                {getReasoningEffortLabel(effort)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator className="mx-1 my-1.5 h-px" />
        </>
      )}

      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="h-10 rounded-[13px] px-2 text-[13px]">
          {currentModel && <ProviderLogo provider={currentModel.provider} size={16} />}
          <span className="truncate">{currentName}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          sideOffset={6}
          collisionPadding={12}
          className="theme-menu-surface w-[210px] rounded-[16px] p-1.5 shadow-none"
        >
          {providers.length === 0 ? (
            <DropdownMenuItem disabled className="h-10 rounded-[13px] px-2 text-[13px]">
              No models available
            </DropdownMenuItem>
          ) : (
            providers.map((provider) => (
              <DropdownMenuSub key={provider.id}>
                <DropdownMenuSubTrigger className="h-10 rounded-[13px] px-2 text-[13px]">
                  <ProviderLogo provider={provider.id} size={16} />
                  <span>{provider.label}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent
                  sideOffset={6}
                  collisionPadding={12}
                  className="theme-menu-surface w-[230px] max-h-[60vh] overflow-y-auto rounded-[16px] p-1.5 shadow-none"
                >
                  {(groupedModels[provider.id] || []).map((model) => {
                    const isActive =
                      model.code === selectedModelCode && model.provider === selectedModelProvider
                    return (
                      <DropdownMenuItem
                        key={`${model.provider}-${model.code}`}
                        onSelect={() => onModelSelect(model)}
                        className="h-10 rounded-[13px] px-2 text-[13px]"
                      >
                        <ProviderLogo provider={model.provider} size={16} />
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
    </DropdownMenuContent>
  )
}

export default ModelSelectorDropdown
