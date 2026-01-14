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
    dropdownRef,
    portalRef,
    searchInputRef,
    currentModels,
    currentModel,
    currentName,
    setSearchQuery,
    setViewMode,
    setSelectedProvider,
    toggleOpen,
    toggleFavorite,
    handleSelect,
    dropdownPos
  } = useModelSelector()

  const triggerClass = `model-selector-trigger ${minimal ? 'minimal' : ''}`

  return (
    <div style={{ position: 'relative', zIndex: 100 }} ref={dropdownRef}>
      <button
        onClick={toggleOpen}
        aria-haspopup="dialog"
        aria-expanded={state.isOpen}
        title={`${currentName} — ${settings.modelProvider || 'auto'}`}
        className={triggerClass}
      >
        {currentModel ? (
          <ModelIcon
            model={currentModel}
            icon={getModelAttributes(currentModel).icon}
            color={getModelAttributes(currentModel).color}
            size={16}
          />
        ) : <Cpu size={14} />}
        <span className="truncate" style={{ maxWidth: minimal ? '110px' : '120px', fontSize: minimal ? '0.8rem' : '0.85rem' }}>
          {currentName}
        </span>
        <ChevronDown size={14} style={{ opacity: 0.5, transform: state.isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {state.isOpen && (
        <ModelSelectorDropdown
          portalRef={portalRef}
          searchInputRef={searchInputRef}
          dropdownPos={dropdownPos}
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
      )}
    </div>
  )
}
