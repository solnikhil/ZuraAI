/**
 * ModelSelector component - wrapper/orchestrator for model selection
 * 
 * @module ModelSelector/ModelSelector
 * Requirements: 3.5
 */

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
import { cn } from '@/lib/utils'
import './ModelSelector.css'

export interface ModelSelectorProps {
  minimal?: boolean
}

/**
 * ModelSelector component - orchestrates model selection UI
 */
export default function ModelSelector({ minimal }: ModelSelectorProps): React.ReactElement {
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

  const {
    compactMode,
    effectiveDropdownWidth,
    effectiveDropdownHeight,
    triggerLabelMaxWidth,
  } = useResponsiveModelSelector(modelSelector.dropdownWidth || 'default', minimal)

  return (
    <Popover open={state.isOpen} onOpenChange={setIsOpen} modal={false}>
      <PopoverTrigger asChild>
        <motion.button
          aria-haspopup="dialog"
          aria-expanded={state.isOpen}
          title={`${currentName} — ${settings.modelProvider || 'auto'}`}
          whileHover={minimal ? undefined : { scale: 1.01 }}
          whileTap={minimal ? { scale: 0.995 } : { scale: 0.99 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3 py-1.5 transition-colors cursor-pointer",
              minimal
                ? "border border-transparent bg-transparent hover:bg-white/5 text-black/75 dark:text-white/75 hover:text-black dark:hover:text-white"
                : "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white",
              minimal && "rounded-md px-2.5 py-1 gap-1.5",
              minimal && compactMode !== 'none' && 'px-2 py-1'
            )}
          >
          {!minimal && (currentModel ? (
            <ModelIcon
              model={currentModel}
              icon={getModelAttributes(currentModel).icon}
              color={getModelAttributes(currentModel).color}
              size={16}
            />
          ) : <Cpu size={14} />)}
          <span
            className={cn(
              'truncate font-medium',
              minimal ? 'text-[0.95rem]' : 'text-xs',
            )}
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
              transition={{ duration: 0.14, ease: 'easeOut' }}
            >
              <ChevronDown
                size={12}
                className="opacity-50"
              />
            </motion.div>
          )}
        </motion.button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 overflow-hidden"
        align="start"
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
