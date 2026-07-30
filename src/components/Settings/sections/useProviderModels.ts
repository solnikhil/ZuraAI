import { useMemo, useState } from 'react'
import type {
  ConfiguredModel,
  DeepSeekReasoningEffort,
} from '@/contexts/SettingsConfigContext'
import { getDeepseekReasoning, setDeepseekReasoningEnabled } from '@/utils/deepseekReasoning'
import {
  fetchOpenRouterModels,
  mapOpenRouterModelToConfiguredModel,
} from '@/services/openrouterModels'
import type { ProviderId } from '../../../providers'
import {
  buildProviderModelUpdate,
  type ProviderHubDefinition,
  type ProviderModelSettingsUpdate,
} from './providerHubDescriptors'
import type { ProviderHubSectionProps } from './ProviderHubSection'

type ProviderModelsUpdate = ProviderModelSettingsUpdate &
  Partial<Pick<ProviderHubSectionProps, 'aiModel' | 'modelProvider'>>

interface UseProviderModelsOptions {
  selectedProvider: ProviderHubDefinition
  providerModelMap: Record<ProviderId, ConfiguredModel[]>
  query: string
  listFilter: 'all' | 'chat'
  configuredModels: ConfiguredModel[]
  modelProvider: ProviderId
  aiModel: string
  deepseekReasoning?: Record<string, { enabled: boolean; effort: DeepSeekReasoningEffort }>
  deepseekLastEffort?: DeepSeekReasoningEffort
  getProviderApiKey: (provider: ProviderHubDefinition) => string
  openRouterProvider: ProviderHubDefinition
  onChange: ProviderHubSectionProps['onChange']
}

export function useProviderModels({
  selectedProvider,
  providerModelMap,
  query,
  listFilter,
  configuredModels,
  modelProvider,
  aiModel,
  deepseekReasoning,
  deepseekLastEffort,
  getProviderApiKey,
  openRouterProvider,
  onChange,
}: UseProviderModelsOptions) {
  const [detectingReasoningModel, setDetectingReasoningModel] = useState<string | null>(null)
  const providerModels = providerModelMap[selectedProvider.key] || []

  const visibleProviderModels = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return providerModels
    return providerModels.filter(
      (model) =>
        model.displayName.toLowerCase().includes(normalized) ||
        model.code.toLowerCase().includes(normalized)
    )
  }, [providerModels, query])

  const visibleChatModels = useMemo(
    () =>
      visibleProviderModels.filter((model) => {
        const haystack = `${model.code} ${model.displayName}`.toLowerCase()
        return !/(image|vision|video|embed|embedding|audio|tts|asr)/.test(haystack)
      }),
    [visibleProviderModels]
  )

  const modelsForList = listFilter === 'chat' ? visibleChatModels : visibleProviderModels
  const enabledModels = modelsForList.filter((model) => model.enabled !== false)
  const disabledModels = modelsForList.filter((model) => model.enabled === false)

  const setModels = (provider: ProviderId, models: ConfiguredModel[]): void => {
    onChange(buildProviderModelUpdate(provider, models))
  }

  const add = (model: ConfiguredModel, provider: ProviderId = selectedProvider.key): void => {
    const currentModels = providerModelMap[provider] || []
    const exists = currentModels.some((item) => item.code === model.code)
    setModels(
      provider,
      exists
        ? currentModels.map((item) => (item.code === model.code ? { ...item, ...model } : item))
        : [...currentModels, model]
    )
  }

  const toggleEnabled = (provider: ProviderId, modelCode: string, checked: boolean): void => {
    const updatedModels = (providerModelMap[provider] || []).map((model) =>
      model.code === modelCode ? { ...model, enabled: checked } : model
    )
    const updates: ProviderModelsUpdate = buildProviderModelUpdate(provider, updatedModels)
    if (!checked && modelProvider === provider && aiModel === modelCode) {
      const fallback = updatedModels.find((model) => model.enabled !== false)
      if (fallback) {
        updates.aiModel = fallback.code
        updates.modelProvider = provider
      }
    }
    onChange(updates)
  }

  const toggleReasoning = (modelCode: string, checked: boolean): void => {
    onChange(
      setDeepseekReasoningEnabled({ deepseekReasoning, deepseekLastEffort }, modelCode, checked)
    )
  }

  const reasoningEnabledFor = (modelCode: string): boolean =>
    getDeepseekReasoning({ deepseekReasoning, deepseekLastEffort }, modelCode).enabled

  const detectOpenRouterReasoning = async (modelCode: string): Promise<void> => {
    setDetectingReasoningModel(modelCode)
    try {
      const catalogModels = await fetchOpenRouterModels(getProviderApiKey(openRouterProvider))
      const catalogModel = catalogModels.find((model) => model.id === modelCode)
      if (!catalogModel) return
      const mappedModel = mapOpenRouterModelToConfiguredModel(catalogModel)
      const supportsReasoning = mappedModel.supportsDeepThinking === true
      onChange({
        configuredModels: configuredModels.map((model) =>
          model.code === modelCode
            ? {
                ...model,
                supportsDeepThinking: supportsReasoning,
                modelType: supportsReasoning ? 'reasoning' : model.modelType,
                openRouterReasoningDetected: true,
              }
            : model
        ),
      })
    } finally {
      setDetectingReasoningModel(null)
    }
  }

  const update = (
    provider: ProviderId,
    modelCode: string,
    updatedModel: ConfiguredModel
  ): void => {
    setModels(
      provider,
      (providerModelMap[provider] || []).map((model) =>
        model.code === modelCode ? { ...model, ...updatedModel, code: modelCode } : model
      )
    )
  }

  const remove = (provider: ProviderId, modelCode: string): void => {
    const updatedModels = (providerModelMap[provider] || []).filter(
      (model) => model.code !== modelCode
    )
    const updates: ProviderModelsUpdate = buildProviderModelUpdate(provider, updatedModels)
    if (modelProvider === provider && aiModel === modelCode) {
      const fallback = updatedModels.find((model) => model.enabled !== false)
      if (fallback) {
        updates.aiModel = fallback.code
        updates.modelProvider = provider
      }
    }
    onChange(updates)
  }

  const clear = (provider: ProviderId): void => setModels(provider, [])

  return {
    providerModels,
    visibleProviderModels,
    visibleChatModels,
    enabledModels,
    disabledModels,
    add,
    toggleEnabled,
    toggleReasoning,
    reasoningEnabledFor,
    detectOpenRouterReasoning,
    detectingReasoningModel,
    update,
    remove,
    clear,
  }
}
