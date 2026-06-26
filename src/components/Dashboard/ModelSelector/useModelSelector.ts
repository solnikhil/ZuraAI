/**
 * useModelSelector hook - handles model selection state and logic
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
  getPickerVisibleProviders,
  getProviderModelListField,
  hasProviderAccess,
} from '../../../providers'
import { removeEmojis } from '../../../utils/textUtils'
import type { ModelWithProvider, GroupedModels } from './types'

export interface ModelSelectorState {
  isOpen: boolean
}

export interface UseModelSelectorReturn {
  state: ModelSelectorState
  allModels: ModelWithProvider[]
  groupedModels: GroupedModels
  currentModel: ModelWithProvider | undefined
  currentName: string
  setIsOpen: (open: boolean) => void
  toggleOpen: () => void
  handleSelect: (model: ModelWithProvider, e?: React.MouseEvent) => void
}

export function useModelSelector(): UseModelSelectorReturn {
  const { settings, updateSettings } = useSettings()
  const [isOpen, setIsOpen] = useState(false)
  const pickerProviders = getPickerVisibleProviders()

  const isProviderEnabled = useCallback(
    (provider: string): boolean => hasProviderAccess(settings, provider),
    [settings]
  )

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
    if (prevOpenRef.current) return
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

  const allModels = useMemo((): ModelWithProvider[] => {
    return pickerProviders.flatMap((provider) => {
      if (!isProviderEnabled(provider.id)) {
        return []
      }

      const modelListField = getProviderModelListField(provider.id)
      if (!modelListField) {
        return []
      }

      return (settings[modelListField] || [])
        .filter((model) => model.enabled !== false)
        .map((model) => ({ ...model, provider: provider.id }))
    })
  }, [settings, isProviderEnabled, pickerProviders])

  const groupedModels = useMemo((): GroupedModels => {
    return Object.fromEntries(
      pickerProviders.map((provider) => [
        provider.id,
        allModels.filter((model) => model.provider === provider.id),
      ])
    )
  }, [allModels, pickerProviders])

  const currentModel = useMemo(() => {
    return allModels.find(
      (m) => m.code === settings.aiModel && m.provider === settings.modelProvider
    )
  }, [allModels, settings.aiModel, settings.modelProvider])

  const currentName = useMemo(() => {
    const nameRaw =
      currentModel?.displayName ||
      (settings.aiModel ? settings.aiModel.split('/').pop() : null) ||
      'Select Models...'
    return removeEmojis(nameRaw)
  }, [currentModel, settings.aiModel])

  useEffect(() => {
    const currentInList = allModels.some(
      (m) => m.code === settings.aiModel && m.provider === settings.modelProvider
    )
    if (!currentInList && allModels.length > 0) {
      const fallback = allModels[0]
      updateSettings({ aiModel: fallback.code, modelProvider: fallback.provider })
    }
  }, [allModels, settings.aiModel, settings.modelProvider, updateSettings])

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const handleSelect = useCallback(
    (model: ModelWithProvider, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation()
        e.preventDefault()
      }
      setIsOpen(false)
      updateSettings({ aiModel: model.code, modelProvider: model.provider })
    },
    [updateSettings]
  )

  return {
    state: { isOpen },
    allModels,
    groupedModels,
    currentModel,
    currentName,
    setIsOpen,
    toggleOpen,
    handleSelect,
  }
}

export default useModelSelector