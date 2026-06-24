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
  /** Whether to render the reasoning-effort section at all (reasoning-capable models). */
  showReasoning: boolean
  /** Whether reasoning is currently active (not 'none'). Controls badge visibility. */
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
      className="zura-menu-surface--model w-[248px]"
    >
      {showReasoning && (
        <>
          <DropdownMenuLabel>
            Reasoning effort
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            className="flex flex-col gap-0.5"
            value={reasoningEffort}
            onValueChange={(value) => onReasoningEffortChange(value as DeepSeekReasoningEffort)}
          >
            {reasoningEfforts.map((effort) => (
              <DropdownMenuRadioItem
                key={effort}
                value={effort}
                className="zura-menu-item--model pl-3 pr-2 [&>span:first-child]:hidden"
              >
                {getReasoningEffortLabel(effort)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
        </>
      )}

      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="zura-menu-sub-trigger--model">
          {currentModel && <ProviderLogo provider={currentModel.provider} size={16} />}
          <span className="truncate">{currentName}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          sideOffset={6}
          collisionPadding={12}
          className="zura-menu-surface--model w-[210px]"
        >
          {providers.length === 0 ? (
            <DropdownMenuItem disabled className="zura-menu-item--model">
              No models available
            </DropdownMenuItem>
          ) : (
            providers.map((provider) => (
              <DropdownMenuSub key={provider.id}>
                <DropdownMenuSubTrigger className="zura-menu-sub-trigger--model">
                  <ProviderLogo provider={provider.id} size={16} />
                  <span>{provider.label}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent
                  sideOffset={6}
                  collisionPadding={12}
                  className="zura-menu-surface--model w-[230px] max-h-[60vh] overflow-y-auto"
                >
                  {(groupedModels[provider.id] || []).map((model) => {
                    const isActive =
                      model.code === selectedModelCode && model.provider === selectedModelProvider
                    return (
                      <DropdownMenuItem
                        key={`${model.provider}-${model.code}`}
                        onSelect={() => onModelSelect(model)}
                        className="zura-menu-item--model"
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
