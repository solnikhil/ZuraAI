/**
 * useModelSelector hook - handles model selection state and logic
 * 
 * @module ModelSelector/useModelSelector
 * Requirements: 3.3
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSettings } from '../../../contexts/SettingsContext'
import { filterModels } from '../../../utils/modelUtils'
import { removeEmojis } from '../../../utils/textUtils'
import type { ModelWithProvider, ViewMode, GroupedModels } from './types'

/**
 * State returned by the useModelSelector hook
 */
export interface ModelSelectorState {
  /** Whether the dropdown is open */
  isOpen: boolean
  /** Current search query */
  searchQuery: string
  /** Current view mode (favorites or all) */
  viewMode: ViewMode
  /** Currently selected provider in sidebar */
  selectedProvider: string
  /** Collapsed state for each provider group */
  collapsedGroups: Record<string, boolean>
  /** Focused model index for keyboard navigation */
  focusedIndex: number
}

/**
 * Return type for useModelSelector hook
 */
export interface UseModelSelectorReturn {
  // State
  state: ModelSelectorState
  
  // Refs
  searchInputRef: React.RefObject<HTMLInputElement | null>
  
  // Computed values
  allModels: ModelWithProvider[]
  filteredModels: ModelWithProvider[]
  groupedModels: GroupedModels
  currentModels: ModelWithProvider[]
  favoriteModels: ModelWithProvider[]
  currentModel: ModelWithProvider | undefined
  currentName: string
  
  // Actions
  setIsOpen: (open: boolean) => void
  setSearchQuery: (query: string) => void
  setViewMode: (mode: ViewMode) => void
  setSelectedProvider: (provider: string) => void
  setFocusedIndex: (index: number) => void
  toggleOpen: () => void
  toggleGroup: (provider: string) => void
  toggleFavorite: (modelCode: string, e: React.MouseEvent) => void
  handleSelect: (model: ModelWithProvider, e?: React.MouseEvent) => void
  handleKeyboardNav: (e: KeyboardEvent) => void
}

/**
 * Custom hook for managing ModelSelector state and logic
 * Centralizes all model selection functionality
 */
export function useModelSelector(): UseModelSelectorReturn {
  const { settings, updateSettings } = useSettings()
  
  const modelSelector = settings.modelSelector || {
    defaultView: 'lastUsed',
    rememberProvider: true,
    autoCloseOnSelect: true,
  }
  
  // Determine initial view mode based on settings
  const getInitialViewMode = (): ViewMode => {
    if (modelSelector.defaultView === 'favorites') {
      return 'favorites'
    }
    return 'all'
  }
  
  // State
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode())
  const [selectedProvider, setSelectedProviderState] = useState<string>(() => {
    if (modelSelector.rememberProvider && settings.modelProvider) {
      return settings.modelProvider
    }
    return 'openrouter'
  })
  
  // Wrapper to accept string type
  const setSelectedProvider = (provider: string) => setSelectedProviderState(provider)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    ollama: false,
    perplexity: false,
    openrouter: false,
    gemini: false,
    groq: false,
    minimax: false
  })
  
  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null)
  
  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState(-1)
  
  // Sync selectedProvider with settings.modelProvider when dropdown opens
  useEffect(() => {
    if (isOpen) {
      // Set initial view mode based on defaultView setting
      if (modelSelector.defaultView === 'favorites') {
        setViewMode('favorites')
      } else {
        setViewMode('all')
        // Restore provider if rememberProvider is enabled
        if (modelSelector.rememberProvider && settings.modelProvider) {
          setSelectedProvider(settings.modelProvider)
        } else {
          setSelectedProvider('openrouter')
        }
      }
      setFocusedIndex(-1) // Reset focus when opening
    } else {
      setFocusedIndex(-1) // Reset focus when closing
    }
  }, [isOpen, settings.modelProvider, modelSelector.defaultView, modelSelector.rememberProvider])
  
  // Get ALL models from ALL providers
  const allModels = useMemo((): ModelWithProvider[] => {
    const models: ModelWithProvider[] = []
    
    if (settings.ollamaModels) {
      settings.ollamaModels
        .filter(m => m.enabled !== false)
        .forEach(m => models.push({ ...m, provider: 'ollama' }))
    }
    if (settings.perplexityModels) {
      settings.perplexityModels
        .filter(m => m.enabled !== false)
        .forEach(m => models.push({ ...m, provider: 'perplexity' }))
    }
    if (settings.configuredModels) {
      settings.configuredModels
        .filter(m => m.enabled !== false)
        .forEach(m => models.push({ ...m, provider: 'openrouter' }))
    }
    if (settings.geminiModels) {
      settings.geminiModels
        .filter(m => m.enabled !== false)
        .forEach(m => models.push({ ...m, provider: 'gemini' }))
    }
    if (settings.groqModels) {
      settings.groqModels
        .filter(m => m.enabled !== false)
        .forEach(m => models.push({ ...m, provider: 'groq' }))
    }
    if (settings.minimaxModels) {
      settings.minimaxModels
        .filter(m => m.enabled !== false)
        .forEach(m => models.push({ ...m, provider: 'minimax' }))
    }
    
    return models
  }, [settings])
  
  // Filter models based on search query
  const filteredModels = useMemo(() => {
    return filterModels(allModels, searchQuery)
  }, [allModels, searchQuery])
  
  // Group models by provider
  const groupedModels = useMemo((): GroupedModels => {
    return {
      ollama: filteredModels.filter(m => m.provider === 'ollama'),
      perplexity: filteredModels.filter(m => m.provider === 'perplexity'),
      openrouter: filteredModels.filter(m => m.provider === 'openrouter'),
      gemini: filteredModels.filter(m => m.provider === 'gemini'),
      groq: filteredModels.filter(m => m.provider === 'groq'),
      minimax: filteredModels.filter(m => m.provider === 'minimax')
    }
  }, [filteredModels])
  
  // Get favorite models
  const favoriteModels = useMemo(() => {
    const favs = settings.favoriteModels || []
    if (favs.length === 0) return []
    return allModels.filter(m => favs.includes(m.code))
  }, [allModels, settings.favoriteModels])
  
  // Get models for the current view
  const currentModels = useMemo((): ModelWithProvider[] => {
    if (searchQuery.trim()) {
      return filteredModels
    }
    if (viewMode === 'favorites') {
      return favoriteModels
    }
    return allModels.filter(m => m.provider === selectedProvider)
  }, [searchQuery, filteredModels, viewMode, favoriteModels, allModels, selectedProvider])
  
  // Find current model
  const currentModel = useMemo(() => {
    return allModels.find(m => m.code === settings.aiModel && m.provider === settings.modelProvider)
  }, [allModels, settings.aiModel, settings.modelProvider])
  
  // Get current model name for display
  const currentName = useMemo(() => {
    const nameRaw = currentModel?.displayName || 
      (settings.aiModel ? settings.aiModel.split('/').pop() : null) || 
      'Select Models...'
    return removeEmojis(nameRaw)
  }, [currentModel, settings.aiModel])
  
  // Reset focused index when models change
  useEffect(() => {
    if (focusedIndex >= currentModels.length) {
      setFocusedIndex(Math.max(0, currentModels.length - 1))
    }
  }, [currentModels.length, focusedIndex])
  
  // Toggle dropdown open/close
  const toggleOpen = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])
  
  // Toggle provider group collapse
  const toggleGroup = useCallback((provider: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [provider]: !prev[provider]
    }))
  }, [])
  
  // Toggle favorite status
  const toggleFavorite = useCallback((modelCode: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const currentFavorites = settings.favoriteModels || []
    const newFavorites = currentFavorites.includes(modelCode)
      ? currentFavorites.filter(f => f !== modelCode)
      : [...currentFavorites, modelCode]
    updateSettings({ favoriteModels: newFavorites })
  }, [settings.favoriteModels, updateSettings])
  
  // Handle model selection
  const handleSelect = useCallback((model: ModelWithProvider, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    if (modelSelector.autoCloseOnSelect) {
      setIsOpen(false)
    }
    setFocusedIndex(-1)
    updateSettings({ aiModel: model.code, modelProvider: model.provider })
  }, [updateSettings, modelSelector.autoCloseOnSelect])
  
  // Keyboard navigation handlers
  const handleKeyboardNav = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex(prev => 
          prev < currentModels.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex(prev => 
          prev > 0 ? prev - 1 : currentModels.length - 1
        )
        break
      case 'Enter':
        if (focusedIndex >= 0 && focusedIndex < currentModels.length) {
          e.preventDefault()
          handleSelect(currentModels[focusedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        setFocusedIndex(-1)
        break
    }
  }, [isOpen, currentModels, focusedIndex, handleSelect])
  
  // Attach keyboard event listener when dropdown is open
  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyboardNav)
      return () => {
        window.removeEventListener('keydown', handleKeyboardNav)
      }
    }
  }, [isOpen, handleKeyboardNav])
  
  
  return {
    state: {
      isOpen,
      searchQuery,
      viewMode,
      selectedProvider,
      collapsedGroups,
      focusedIndex
    },
    searchInputRef,
    allModels,
    filteredModels,
    groupedModels,
    currentModels,
    favoriteModels,
    currentModel,
    currentName,
    setIsOpen,
    setSearchQuery,
    setViewMode,
    setSelectedProvider,
    setFocusedIndex,
    toggleOpen,
    toggleGroup,
    toggleFavorite,
    handleSelect,
    handleKeyboardNav
  }
}

export default useModelSelector
