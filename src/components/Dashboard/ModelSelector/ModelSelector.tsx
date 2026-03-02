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
  
  const dropdownWidthClass = {
    compact: 'w-[420px]',
    wide: 'w-[640px]',
    default: 'w-[520px]',
  }[modelSelector.dropdownWidth || 'default']

  return (
    <Popover open={state.isOpen} onOpenChange={setIsOpen} modal={false}>
      <PopoverTrigger asChild>
        <motion.button
          aria-haspopup="dialog"
          aria-expanded={state.isOpen}
          title={`${currentName} — ${settings.modelProvider || 'auto'}`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={cn(
            "flex items-center gap-2 rounded-xl px-3 py-1.5 transition-colors cursor-pointer",
            "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20",
            "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white",
            minimal && "px-2 gap-1"
          )}
        >
          {currentModel ? (
            <ModelIcon
              model={currentModel}
              icon={getModelAttributes(currentModel).icon}
              color={getModelAttributes(currentModel).color}
              size={16}
            />
          ) : <Cpu size={14} />}
          <span
            className="truncate text-xs font-medium"
            style={{
              maxWidth: minimal ? '96px' : '140px',
              minWidth: minimal ? 0 : '80px',
            }}
          >
            {currentName}
          </span>
          <motion.div
            animate={{ rotate: state.isOpen ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <ChevronDown 
              size={12} 
              className="opacity-50"
            />
          </motion.div>
        </motion.button>
      </PopoverTrigger>
      <PopoverContent 
        className={cn(dropdownWidthClass, "p-0")}
        align="start"
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
        />
      </PopoverContent>
    </Popover>
  )
}
