/**
 * ModelSelector component - wrapper/orchestrator for model selection
 * 
 * @module ModelSelector/ModelSelector
 * Requirements: 3.5
 */

import React from 'react'
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
    currentModel,
    currentName,
    setSearchQuery,
    setViewMode,
    setSelectedProvider,
    setIsOpen,
    toggleFavorite,
    handleSelect,
  } = useModelSelector()

  return (
    <Popover open={state.isOpen} onOpenChange={setIsOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          aria-haspopup="dialog"
          aria-expanded={state.isOpen}
          title={`${currentName} — ${settings.modelProvider || 'auto'}`}
          className={cn(
            "flex items-center gap-1 rounded-lg p-2 transition-all cursor-pointer",
            "bg-black/5 dark:bg-white/5",
            "hover:bg-black/10 dark:hover:bg-white/10",
            "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white",
            minimal ? "px-2" : "px-3"
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
          {!minimal && (
            <span className="truncate text-xs" style={{ maxWidth: '100px' }}>
              {currentName}
            </span>
          )}
          <ChevronDown 
            size={12} 
            className={cn(
              "opacity-50 transition-transform duration-200",
              state.isOpen && "rotate-180"
            )} 
          />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[460px] p-0" 
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // Allow interaction with elements inside the popover
          const target = e.target as HTMLElement
          if (target.closest('[data-slot="popover-content"]')) {
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
          groupedModels={{ ollama: [], perplexity: [], openrouter: [], gemini: [], groq: [], minimax: [] }}
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
