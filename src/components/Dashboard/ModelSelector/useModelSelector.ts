/**
 * useModelSelector hook - handles model selection state and logic
 *
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSettings } from '../../../contexts/SettingsContext'
import {
  checkOllamaStatus,
  listOllamaModels,
  enrichOllamaModelsWithContext,
} from '../../../services/ollama'
import {
  DEFAULT_OLLAMA_URL,
  getActiveProviderIds,
  hasProviderAccess,
  type ActiveProviderId,
} from '../../../providers'
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
  const validProviders = getActiveProviderIds()

  const isProviderEnabled = useCallback(
    (provider: string): boolean => {
      return hasProviderAccess(settings, provider)
    },
    [settings]
  )

  const [selectedProvider, setSelectedProviderState] = useState<string>(() => {
    if (modelSelector.rememberProvider && settings.modelProvider) {
      const p = settings.modelProvider as ActiveProviderId
      return (validProviders as readonly string[]).includes(p) ? p : 'openrouter'
    }
    return 'openrouter'
  })

  // Wrapper to accept string type
  const setSelectedProvider = (provider: string) => setSelectedProviderState(provider)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    alibaba: false,
    fireworks: false,
    groq: false,
    ollama: false,
    openrouter: false,
    perplexity: false,
  })

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
        // Restore provider if rememberProvider is enabled and provider is valid and enabled
        let provider =
          modelSelector.rememberProvider && settings.modelProvider
            ? settings.modelProvider
            : 'openrouter'
        if (
          !validProviders.includes(provider as (typeof validProviders)[number]) ||
          !isProviderEnabled(provider)
        ) {
          provider = validProviders.find((p) => isProviderEnabled(p)) ?? 'openrouter'
        }
        setSelectedProvider(provider)
      }
      setFocusedIndex(-1) // Reset focus when opening
    } else {
      setFocusedIndex(-1) // Reset focus when closing
    }
  }, [
    isOpen,
    settings.modelProvider,
    modelSelector.defaultView,
    modelSelector.rememberProvider,
    isProviderEnabled,
  ])

  // Refresh Ollama models when dropdown opens so models added via terminal appear immediately
  const prevOpenRef = useRef(false)
  useEffect(() => {
    if (!isOpen) {
      prevOpenRef.current = false
      return
    }
    if (!isProviderEnabled('ollama')) {
      prevOpenRef.current = false
      return
    }
    if (prevOpenRef.current) return // Already fetched for this open session
    prevOpenRef.current = true
    const url = settings.ollamaUrl?.trim() || DEFAULT_OLLAMA_URL
    const existing = (settings.ollamaModels || []).map((m) => [m.code, m.enabled] as const)
    const refresh = async () => {
      try {
        const connected = await checkOllamaStatus(url)
        if (!connected) return
        const models = await listOllamaModels(url)
        if (models.length === 0) return
        const formatted = models.map((m) => ({
          code: m.name,
          displayName: `${m.name} (${m.details.parameter_size})`,
        }))
        const enriched = await enrichOllamaModelsWithContext(url, formatted)
        const enabledMap = new Map(existing)
        const merged = enriched.map((m) => ({
          ...m,
          enabled: enabledMap.get(m.code) ?? true,
        }))
        updateSettings({ ollamaModels: merged })
      } catch {
        /* Ollama not available */
      }
    }
    void refresh()
  }, [isOpen, settings.ollamaUrl, settings.ollamaModels, updateSettings, isProviderEnabled])

  // Get ALL models from providers that are manually enabled and configured
  const allModels = useMemo((): ModelWithProvider[] => {
    const models: ModelWithProvider[] = []

    if (isProviderEnabled('alibaba') && settings.alibabaModels) {
      settings.alibabaModels
        .filter((m) => m.enabled !== false)
        .forEach((m) => models.push({ ...m, provider: 'alibaba' }))
    }
    if (isProviderEnabled('fireworks') && settings.fireworksModels) {
      settings.fireworksModels
        .filter((m) => m.enabled !== false)
        .forEach((m) => models.push({ ...m, provider: 'fireworks' }))
    }
    if (isProviderEnabled('groq') && settings.groqModels) {
      settings.groqModels
        .filter((m) => m.enabled !== false)
        .forEach((m) => models.push({ ...m, provider: 'groq' }))
    }
    if (isProviderEnabled('ollama') && settings.ollamaModels) {
      settings.ollamaModels
        .filter((m) => m.enabled !== false)
        .forEach((m) => models.push({ ...m, provider: 'ollama' }))
    }
    if (isProviderEnabled('openrouter') && settings.configuredModels) {
      settings.configuredModels
        .filter((m) => m.enabled !== false)
        .forEach((m) => models.push({ ...m, provider: 'openrouter' }))
    }
    if (isProviderEnabled('perplexity') && settings.perplexityModels) {
      settings.perplexityModels
        .filter((m) => m.enabled !== false)
        .forEach((m) => models.push({ ...m, provider: 'perplexity' }))
    }
    return models
  }, [settings, isProviderEnabled])

  // Filter models based on search query
  const filteredModels = useMemo(() => {
    return filterModels(allModels, searchQuery)
  }, [allModels, searchQuery])

  // Group models by provider
  const groupedModels = useMemo((): GroupedModels => {
    return {
      alibaba: filteredModels.filter((m) => m.provider === 'alibaba'),
      fireworks: filteredModels.filter((m) => m.provider === 'fireworks'),
      groq: filteredModels.filter((m) => m.provider === 'groq'),
      ollama: filteredModels.filter((m) => m.provider === 'ollama'),
      openrouter: filteredModels.filter((m) => m.provider === 'openrouter'),
      perplexity: filteredModels.filter((m) => m.provider === 'perplexity'),
    }
  }, [filteredModels])

  // Get favorite models
  const favoriteModels = useMemo(() => {
    const favs = settings.favoriteModels || []
    if (favs.length === 0) return []
    return allModels.filter((m) => favs.includes(m.code))
  }, [allModels, settings.favoriteModels])

  // Get models for the current view
  const currentModels = useMemo((): ModelWithProvider[] => {
    if (searchQuery.trim()) {
      return filteredModels
    }
    if (viewMode === 'favorites') {
      return favoriteModels
    }
    return allModels.filter((m) => m.provider === selectedProvider)
  }, [searchQuery, filteredModels, viewMode, favoriteModels, allModels, selectedProvider])

  // Find current model
  const currentModel = useMemo(() => {
    return allModels.find(
      (m) => m.code === settings.aiModel && m.provider === settings.modelProvider
    )
  }, [allModels, settings.aiModel, settings.modelProvider])

  // Get current model name for display
  const currentName = useMemo(() => {
    const nameRaw =
      currentModel?.displayName ||
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

  // Auto-switch when current model is from a disabled provider (no longer in allModels)
  useEffect(() => {
    const currentInList = allModels.some(
      (m) => m.code === settings.aiModel && m.provider === settings.modelProvider
    )
    if (!currentInList && allModels.length > 0) {
      const fallback = allModels[0]
      updateSettings({ aiModel: fallback.code, modelProvider: fallback.provider })
    }
  }, [allModels, settings.aiModel, settings.modelProvider, updateSettings])

  // Toggle dropdown open/close
  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  // Toggle provider group collapse
  const toggleGroup = useCallback((provider: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [provider]: !prev[provider],
    }))
  }, [])

  // Toggle favorite status
  const toggleFavorite = useCallback(
    (modelCode: string, e: React.MouseEvent) => {
      e.stopPropagation()
      const currentFavorites = settings.favoriteModels || []
      const newFavorites = currentFavorites.includes(modelCode)
        ? currentFavorites.filter((f) => f !== modelCode)
        : [...currentFavorites, modelCode]
      updateSettings({ favoriteModels: newFavorites })
    },
    [settings.favoriteModels, updateSettings]
  )

  // Handle model selection
  const handleSelect = useCallback(
    (model: ModelWithProvider, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation()
        e.preventDefault()
      }
      if (modelSelector.autoCloseOnSelect) {
        setIsOpen(false)
      }
      setFocusedIndex(-1)
      updateSettings({ aiModel: model.code, modelProvider: model.provider })
    },
    [updateSettings, modelSelector.autoCloseOnSelect]
  )

  // Keyboard navigation handler — cmdk handles ArrowUp/ArrowDown/Enter internally,
  // so we only need to handle Escape here.
  const handleKeyboardNav = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return

      if (e.key === 'Escape') {
        e.preventDefault()
        setIsOpen(false)
        setFocusedIndex(-1)
      }
    },
    [isOpen]
  )

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
      focusedIndex,
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
    handleKeyboardNav,
  }
}

export default useModelSelector
