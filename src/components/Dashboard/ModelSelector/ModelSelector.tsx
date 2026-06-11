import { motion } from 'framer-motion'
import { ChevronDown, Cpu } from 'lucide-react'
import { useEffect } from 'react'
import { useSettings } from '../../../contexts/SettingsContext'
import { useModelSelectorContext } from '../../../contexts/ModelSelectorContext'
import { useModelSelector } from './useModelSelector'
import { useResponsiveModelSelector } from './useResponsiveModelSelector'
import { ModelSelectorContent } from './ModelSelectorContent'
import { ModelIcon } from './ModelIcon'
import { getModelAttributes } from '../../../utils/modelUtils'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  motionDuration,
  motionDurations,
  motionEasing,
  useMotionPreferences,
} from '@/lib/motion'
import { cn } from '@/lib/utils'
import './ModelSelector.css'
export interface ModelSelectorProps { minimal?: boolean; popoverAlign?: 'start' | 'center' | 'end' }
export default function ModelSelector({ minimal, popoverAlign = 'start' }: ModelSelectorProps) {
  const { consumeRequest } = useModelSelectorContext()
  const { settings } = useSettings()
  const {
    state,
    searchInputRef,
    currentModels,
    groupedModels,
    currentModel,
    currentName,
    setSearchQuery,
    setViewMode,
    setSelectedProvider,
    setFocusedIndex,
    setIsOpen,
    toggleFavorite,
    handleSelect,
  } = useModelSelector()
  const { compactMode, effectiveDropdownWidth, effectiveDropdownHeight, triggerLabelMaxWidth } = useResponsiveModelSelector(settings.modelSelector?.dropdownWidth || 'default', minimal)
  const { animationsEnabled } = useMotionPreferences()
  const triggerTitle = `${currentName} - ${settings.modelProvider || 'auto'}`
  const showLeadingIcon = !minimal

  useEffect(() => {
    const requested = consumeRequest()
    if (requested && !state.isOpen) {
      setIsOpen(true)
    }
  })
  return (
    <Popover open={state.isOpen} onOpenChange={setIsOpen} modal={false}>
      <TooltipProvider delayDuration={350}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <motion.button
                aria-haspopup="dialog"
                aria-expanded={state.isOpen}
                aria-label={`Select model: ${triggerTitle}`}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 transition-[background-color,border-color,color] duration-150',
                  minimal
                    ? 'min-h-9 rounded-full border border-transparent bg-transparent px-2 py-1.5 text-[var(--theme-text-secondary)] hover:bg-[color-mix(in_srgb,var(--theme-surface)_72%,transparent)] hover:text-[var(--theme-text-primary)]'
                    : 'border border-[var(--theme-border)] bg-[var(--theme-surface-subtle)] text-[var(--theme-text-secondary)] hover:border-[var(--theme-border-hover)] hover:bg-[var(--theme-surface-hover)] hover:text-[var(--theme-text-primary)]',
                  minimal && state.isOpen && 'is-active',
                  minimal && compactMode !== 'none' && 'px-2.5 py-2'
                )}
              >
                {showLeadingIcon &&
                  (currentModel ? (
                    <ModelIcon model={currentModel} icon={getModelAttributes(currentModel).icon} color={getModelAttributes(currentModel).color} size={16} />
                  ) : (
                    <Cpu size={14} />
                  ))}
                <span
                  className={cn('truncate', minimal ? 'text-[0.95rem]' : 'text-xs font-medium')}
                  style={{
                    maxWidth: triggerLabelMaxWidth,
                    minWidth: minimal ? 0 : '80px',
                  }}
                >
                  {currentName}
                </span>
                {!(minimal && compactMode === 'tight') && (
                  <motion.div
                    animate={{ rotate: state.isOpen ? 180 : 0 }}
                    transition={{
                      duration: motionDuration(animationsEnabled, motionDurations.fast),
                      ease: motionEasing.standard,
                    }}
                  >
                    <ChevronDown size={12} className={cn('opacity-50', minimal && 'opacity-40')} />
                  </motion.div>
                )}
              </motion.button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" align="end" className="rounded-full">
            Model Selector
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <ModelSelectorContent
        popoverAlign={popoverAlign}
        effectiveDropdownWidth={effectiveDropdownWidth}
        effectiveDropdownHeight={effectiveDropdownHeight}
        searchInputRef={searchInputRef}
        searchQuery={state.searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={state.viewMode}
        onViewModeChange={setViewMode}
        selectedProvider={state.selectedProvider}
        onProviderSelect={setSelectedProvider}
        currentModels={currentModels}
        groupedModels={groupedModels}
        focusedIndex={state.focusedIndex}
        selectedModelCode={settings.aiModel}
        selectedModelProvider={settings.modelProvider}
        favoriteModels={settings.favoriteModels || []}
        onModelSelect={handleSelect}
        onToggleFavorite={toggleFavorite}
        onFocusedIndexChange={setFocusedIndex}
        compactMode={compactMode}
      />
    </Popover>
  )
}
