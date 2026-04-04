import React from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Cpu } from 'lucide-react'
import { useSettings } from '../../../contexts/SettingsContext'
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
}: ModelSelectorProps): React.ReactElement {
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
    setIsOpen,
    toggleFavorite,
    handleSelect,
  } = useModelSelector()

  const modelSelector = settings.modelSelector || {
    dropdownWidth: 'default',
  }

  const { compactMode, effectiveDropdownWidth, effectiveDropdownHeight, triggerLabelMaxWidth } =
    useResponsiveModelSelector(modelSelector.dropdownWidth || 'default', minimal, currentModels.length)
  const { animationsEnabled } = useMotionPreferences()

  return (
    <Popover open={state.isOpen} onOpenChange={setIsOpen} modal={false}>
      <PopoverTrigger asChild>
        <motion.button
          aria-haspopup="dialog"
          aria-expanded={state.isOpen}
          title={`${currentName} — ${settings.modelProvider || 'auto'}`}
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
        className="theme-menu-surface overflow-hidden p-0"
        align={popoverAlign}
        style={{
          width: `${effectiveDropdownWidth}px`,
          maxWidth: 'calc(100vw - 24px)',
          height: `${effectiveDropdownHeight}px`,
          maxHeight: 'calc(100vh - 24px)',
        }}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // Allow interaction with elements inside the popover, including sidebar
          const target = e.target as HTMLElement
          if (target.closest('[data-slot="popover-content"]') || target.closest('[data-sidebar]')) {
            e.preventDefault()
          }
        }}
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
          selectedModelCode={settings.aiModel}
          selectedModelProvider={settings.modelProvider}
          favoriteModels={settings.favoriteModels || []}
          onModelSelect={handleSelect}
          onToggleFavorite={toggleFavorite}
          compactMode={compactMode}
        />
      </PopoverContent>
    </Popover>
  )
}
