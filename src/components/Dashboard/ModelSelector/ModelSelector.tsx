import { motion } from 'framer-motion'
import { ChevronDown, Cpu } from 'lucide-react'
import { useEffect } from 'react'
import { useSettings } from '../../../contexts/SettingsContext'
import { useModelSelectorContext } from '../../../contexts/ModelSelectorContext'
import { useModelSelector } from './useModelSelector'
import { useResponsiveModelSelector } from './useResponsiveModelSelector'
import { ModelSelectorDropdown } from './ModelSelectorDropdown'
import { ModelIcon } from './ModelIcon'
import { getModelAttributes } from '../../../utils/modelUtils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  maybeAnimate,
  motionDuration,
  motionDurations,
  motionEasing,
  useMotionPreferences,
} from '@/lib/motion'
import { cn } from '@/lib/utils'
import './ModelSelector.css'
export interface ModelSelectorProps {
  minimal?: boolean
  popoverAlign?: 'start' | 'center' | 'end'
}
export default function ModelSelector({
  minimal,
  popoverAlign = 'start',
}: ModelSelectorProps) {
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
  const { compactMode, effectiveDropdownWidth, effectiveDropdownHeight, triggerLabelMaxWidth } =
    useResponsiveModelSelector(settings.modelSelector?.dropdownWidth || 'default', minimal)
  const { animationsEnabled } = useMotionPreferences()
  const triggerTitle = `${currentName} - ${settings.modelProvider || 'auto'}`

  useEffect(() => {
    const requested = consumeRequest()
    if (requested && !state.isOpen) {
      setIsOpen(true)
    }
  })
  return (
    <Popover open={state.isOpen} onOpenChange={setIsOpen} modal={false}>
      <PopoverTrigger asChild>
        <motion.button
          aria-haspopup="dialog"
          aria-expanded={state.isOpen}
          title={triggerTitle}
          whileHover={!minimal ? maybeAnimate(animationsEnabled, { scale: 1.01 }) : undefined}
          whileTap={maybeAnimate(animationsEnabled, minimal ? { scale: 0.995 } : { scale: 0.99 })}
          transition={{
            duration: motionDuration(animationsEnabled, motionDurations.micro),
            ease: motionEasing.standard,
          }}
          className={cn(
            'flex cursor-pointer items-center gap-2 rounded-xl px-3 py-1.5',
            minimal
              ? 'theme-control-btn rounded-[10px] px-2.5 py-1 text-[var(--theme-text-secondary)]'
              : 'border border-[var(--theme-border)] bg-[var(--theme-surface-subtle)] text-[var(--theme-text-secondary)] transition-[background-color,border-color,color,box-shadow] duration-150 hover:bg-[var(--theme-surface-hover)] hover:border-[var(--theme-border-hover)] hover:text-[var(--theme-text-primary)] hover:shadow-[var(--theme-shadow-sm)]',
            minimal && state.isOpen && 'is-active',
            minimal && compactMode !== 'none' && 'px-2 py-1'
          )}
        >
          {!minimal &&
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
            className={cn('truncate font-medium', minimal ? 'text-[0.95rem]' : 'text-xs')}
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
              <ChevronDown size={12} className="opacity-50" />
            </motion.div>
          )}
        </motion.button>
      </PopoverTrigger>
      <PopoverContent
        className="theme-menu-surface model-selector-popover overflow-hidden p-0"
        align={popoverAlign}
        style={{
          width: `${effectiveDropdownWidth}px`,
          maxWidth: 'calc(100vw - 24px)',
          height: `${effectiveDropdownHeight}px`,
          maxHeight: 'calc(100vh - 24px)',
        }}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 32,
            mass: 0.8,
          }}
          className="h-full"
        >
          <ModelSelectorDropdown
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
        </motion.div>
      </PopoverContent>
    </Popover>
  )
}
