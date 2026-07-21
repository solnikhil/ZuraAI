import { ChevronDown, Cpu } from 'lucide-react'
import { useEffect } from 'react'
import { useSettings } from '../../../contexts/SettingsContext'
import { useModelSelectorContext } from '../../../contexts/ModelSelectorContext'
import { useModelSelector } from './useModelSelector'
import { ModelSelectorDropdown } from './ModelSelectorDropdown'
import { ModelIcon } from './ModelIcon'
import { getModelAttributes } from '../../../utils/modelUtils'
import { getModelSelectorReasoning } from './modelSelectorReasoning'
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface ModelSelectorProps {
  minimal?: boolean
  popoverAlign?: 'start' | 'center' | 'end'
}

export default function ModelSelector({ minimal, popoverAlign = 'start' }: ModelSelectorProps) {
  const { consumeRequest } = useModelSelectorContext()
  const { settings, updateSettings } = useSettings()
  const { state, groupedModels, currentModel, currentName, setIsOpen, handleSelect } =
    useModelSelector()

  useEffect(() => {
    const requested = consumeRequest()
    if (requested && !state.isOpen) {
      setIsOpen(true)
    }
  })

  // The model picker owns per-model reasoning effort selection.
  const reasoning = getModelSelectorReasoning(settings, currentModel)
  const showLeadingIcon = !minimal

  return (
    <DropdownMenu open={state.isOpen} onOpenChange={setIsOpen} modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Select model: ${currentName}`}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 transition-[background-color,border-color,color] duration-150',
                minimal
                  ? 'min-h-9 rounded-full border border-transparent bg-transparent px-2 py-1.5 text-[var(--theme-text-secondary)] hover:bg-[color-mix(in_srgb,var(--theme-surface)_72%,transparent)] hover:text-[var(--theme-text-primary)] data-[state=open]:bg-[color-mix(in_srgb,var(--theme-surface)_72%,transparent)] data-[state=open]:text-[var(--theme-text-primary)]'
                  : 'border border-[var(--theme-border)] bg-[var(--theme-surface-subtle)] text-[var(--theme-text-secondary)] hover:border-[var(--theme-border-hover)] hover:bg-[var(--theme-surface-hover)] hover:text-[var(--theme-text-primary)] data-[state=open]:border-[var(--theme-border-hover)] data-[state=open]:bg-[var(--theme-surface-hover)] data-[state=open]:text-[var(--theme-text-primary)]'
              )}
            >
              {showLeadingIcon &&
                (currentModel ? (
                  <ModelIcon
                    model={currentModel}
                    icon={getModelAttributes(currentModel).icon}
                    color={getModelAttributes(currentModel).color}
                    size={16}
                  />
                ) : (
                  <Cpu size={14} />
                ))}
              <span
                className={cn('truncate', minimal ? 'text-[0.95rem]' : 'text-xs font-medium')}
                style={{ maxWidth: minimal ? '220px' : '140px', minWidth: minimal ? 0 : '80px' }}
              >
                {currentName}
              </span>
              {reasoning.show && reasoning.enabled && (
                <span className="inline-flex shrink-0 items-center border-l border-[var(--theme-border-subtle)] pl-1.5 text-[0.68rem] font-semibold leading-none text-[var(--theme-text-tertiary)]">
                  {reasoning.compactLabel}
                </span>
              )}
              <ChevronDown
                size={12}
                className={cn(
                  'shrink-0 opacity-50 transition-transform duration-150',
                  minimal && 'opacity-40',
                  state.isOpen && 'rotate-180'
                )}
              />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" align="end" className="rounded-full">
          Model Selector
        </TooltipContent>
      </Tooltip>
      <ModelSelectorDropdown
        align={popoverAlign}
        groupedModels={groupedModels}
        currentName={currentName}
        currentModel={currentModel}
        selectedModelCode={settings.aiModel}
        selectedModelProvider={settings.modelProvider}
        onModelSelect={handleSelect}
        showReasoning={reasoning.show}
        reasoningEnabled={reasoning.enabled}
        reasoningEffort={reasoning.effort}
        reasoningEfforts={reasoning.efforts}
        onReasoningEffortChange={(effort) => updateSettings(reasoning.settingsPatch(effort))}
      />
    </DropdownMenu>
  )
}
