/**
 * useModelSelector hook - handles model selection state and logic
 * 
 * @module ModelSelector/useModelSelector
 * Requirements: 3.3
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSettings } from '../../../contexts/SettingsContext'
import { filterModels, groupModelsByProvider } from '../../../utils/modelUtils'
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
}

/**
 * Return type for useModelSelector hook
 */
export interface UseModelSelectorReturn {
  // State
  state: ModelSelectorState
  
  // Refs
  dropdownRef: React.RefObject<HTMLDivElement | null>
  portalRef: React.RefObject<HTMLDivElement | null>
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
  toggleOpen: () => void
  toggleGroup: (provider: string) => void
  toggleFavorite: (modelCode: string, e: React.MouseEvent) => void
  handleSelect: (model: ModelWithProvider, e?: React.MouseEvent) => void
  
  // Dropdown position
  dropdownPos: { top: number; left: number; showAbove: boolean }
  calculatePosition: () => void
}

/**
 * Custom hook for managing ModelSelector state and logic
 * Centralizes all model selection functionality
 */
export function useModelSelector(): UseModelSelectorReturn {
  const { settings, updateSettings } = useSettings()
  
  // State
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [selectedProvider, setSelectedProviderState] = useState<string>(settings.modelProvider || 'openrouter')
  
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
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, showAbove: true })
  
  // Refs
  const dropdownRef = useRef<HTMLDivElement>(null)
  const portalRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  
  // Sync selectedProvider with settings.modelProvider when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setSelectedProvider(settings.modelProvider || 'openrouter')
    }
  }, [isOpen, settings.modelProvider])
  
  // Get ALL models from ALL providers
  const allModels = useMemo((): ModelWithProvider[] => {
    const models: ModelWithProvider[] = []
    
    if (settings.ollamaModels) {
      settings.ollamaModels.forEach(m => models.push({ ...m, provider: 'ollama' }))
    }
    if (settings.perplexityModels) {
      settings.perplexityModels.forEach(m => models.push({ ...m, provider: 'perplexity' }))
    }
    if (settings.configuredModels) {
      settings.configuredModels.forEach(m => models.push({ ...m, provider: 'openrouter' }))
    }
    if (settings.geminiModels) {
      settings.geminiModels.forEach(m => models.push({ ...m, provider: 'gemini' }))
    }
    if (settings.groqModels) {
      settings.groqModels.forEach(m => models.push({ ...m, provider: 'groq' }))
    }
    if (settings.minimaxModels) {
      settings.minimaxModels.forEach(m => models.push({ ...m, provider: 'minimax' }))
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
  
  // Calculate dropdown position
  const calculatePosition = useCallback(() => {
    if (!dropdownRef.current) return
    
    const rect = dropdownRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const dropdownHeight = 484
    const dropdownWidth = 460
    const padding = 16
    
    const spaceAbove = rect.top
    const spaceBelow = viewportHeight - rect.bottom
    const showAbove = spaceAbove >= dropdownHeight + padding || spaceAbove > spaceBelow
    
    let top: number
    if (showAbove) {
      top = rect.top - 12
    } else {
      top = rect.bottom + 12
    }
    
    let left = rect.left
    if (left + dropdownWidth > viewportWidth - padding) {
      left = viewportWidth - dropdownWidth - padding
    }
    if (left < padding) {
      left = padding
    }
    
    const docWidth = document.body.clientWidth
    if (docWidth < viewportWidth) {
      left = Math.min(left, docWidth - dropdownWidth - padding)
    }
    
    setDropdownPos({ top, left, showAbove })
  }, [])
  
  // Toggle dropdown open/close
  const toggleOpen = useCallback(() => {
    if (!isOpen) {
      calculatePosition()
      setIsOpen(true)
    } else {
      setIsOpen(false)
    }
  }, [isOpen, calculatePosition])
  
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
    setIsOpen(false)
    updateSettings({ aiModel: model.code, modelProvider: model.provider })
  }, [updateSettings])
  
  // Update position on window resize
  useEffect(() => {
    if (!isOpen) return
    
    const handleResize = () => calculatePosition()
    
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleResize, true)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleResize, true)
    }
  }, [isOpen, calculatePosition])
  
  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return
    
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    const rafId = requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      cancelAnimationFrame(rafId)
    }
  }, [isOpen])
  
  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (dropdownRef.current && !dropdownRef.current.contains(target) &&
          portalRef.current && !portalRef.current.contains(target)) {
        setIsOpen(false)
      }
    }
    
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    
    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])
  
  return {
    state: {
      isOpen,
      searchQuery,
      viewMode,
      selectedProvider,
      collapsedGroups
    },
    dropdownRef,
    portalRef,
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
    toggleOpen,
    toggleGroup,
    toggleFavorite,
    handleSelect,
    dropdownPos,
    calculatePosition
  }
}

export default useModelSelector
