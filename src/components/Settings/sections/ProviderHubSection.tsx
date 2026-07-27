import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  CircleHelp,
  CheckCircle2,
  ChevronLeft,
  Edit2,
  Eye,
  EyeOff,
  ExternalLink,
  Globe,
  Loader2,
  ShieldCheck,
  MoreVertical,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ProviderLogo } from '@/components/shared'
import { WithTooltip } from '@/components/ui/WithTooltip'
import type {
  ConfiguredModel,
  TavilySearchDepthPreference,
  DeepSeekReasoningEffort,
} from '@/contexts/SettingsConfigContext'
import type { AlibabaRegion } from '@/services/alibabaEndpoints'
import { isSecureApiKeyPlaceholder } from '@/utils/secureApiKeys'
import { CreateCustomModelDialog } from './CreateCustomModelDialog'
import { AlibabaModelSearchDialog } from './AlibabaModelSearchDialog'
import { DeepseekModelSearchDialog } from './DeepseekModelSearchDialog'
import { OpencodeModelSearchDialog } from './OpencodeModelSearchDialog'
import { FireworksModelSearchDialog } from './FireworksModelSearchDialog'
import { NvidiaModelSearchDialog } from './NvidiaModelSearchDialog'
import { OpenRouterModelSearchDialog } from './OpenRouterModelSearchDialog'
import {
  getProviderDashboardUrl,
  getProviderEnabledDefaults,
  type ProviderId,
  type ProviderSecretField,
} from '../../../providers'
import {
  buildProviderModelUpdate,
  createProviderModelMap,
  PROVIDER_HUB_DEFINITIONS,
  type ProviderHubDefinition,
} from './providerHubDescriptors'
import { useProviderConnectivity } from './useProviderConnectivity'
import { useProviderModelDialogs } from './useProviderModelDialogs'
import { useProviderModels } from './useProviderModels'
import { ProviderDetailField } from './ProviderDetailField'
import {
  SEARCH_APIS,
  SearchApiDetail,
  SearchApiSection,
  type ProviderCatalogFilter,
  type SearchApiKey,
} from './ProviderSearchApiViews'

type ManageMode = 'providers' | 'search-apis'
type ProviderView = 'catalog' | 'detail'
type ProviderKey = ProviderId
type ProviderEnabledMap = Partial<Record<ProviderKey, boolean>>

const PROVIDERS = PROVIDER_HUB_DEFINITIONS

/** Display order for the flat providers catalog (no category headers). */
const PROVIDER_CATALOG_ORDER: readonly ProviderKey[] = [
  'openrouter',
  'codex',
  'groq',
  'alibaba',
  'deepseek',
  'opencode',
  'fireworks',
  'nvidia',
  'ollama',
]

type ProviderSetupState = 'needs-setup' | 'ready' | 'disabled'

function providerNeedsApiKey(provider: ProviderHubDefinition, hasApiKey: boolean): boolean {
  return Boolean(provider.apiKeyField && !hasApiKey)
}

function getProviderSetupState(
  provider: ProviderHubDefinition,
  hasApiKey: boolean,
  enabled: boolean
): ProviderSetupState {
  if (providerNeedsApiKey(provider, hasApiKey)) return 'needs-setup'
  if (!enabled) return 'disabled'
  return 'ready'
}

function formatProviderStatusLine(
  provider: ProviderHubDefinition,
  hasApiKey: boolean,
  enabled: boolean,
  enabledModelCount: number,
  modelCount: number
): string {
  if (providerNeedsApiKey(provider, hasApiKey)) return 'API key not set'
  if (provider.setupKind === 'account') {
    if (!enabled) return 'ChatGPT account · Disabled'
    return modelCount > 0
      ? `ChatGPT account · ${enabledModelCount}/${modelCount} models`
      : 'ChatGPT account · Ready'
  }
  if (provider.setupKind === 'local') {
    if (!enabled) return 'Local · Disabled'
    return modelCount > 0 ? `Local · ${enabledModelCount}/${modelCount} models` : 'Local · Ready'
  }
  if (!enabled) {
    return modelCount > 0
      ? `Configured · ${enabledModelCount}/${modelCount} models`
      : 'Configured · Disabled'
  }
  return modelCount > 0 ? `Key set · ${enabledModelCount}/${modelCount} models` : 'Key set'
}

function providerMatchesCatalogFilter(
  provider: ProviderHubDefinition,
  filter: ProviderCatalogFilter,
  hasApiKey: boolean,
  enabled: boolean
): boolean {
  switch (filter) {
    case 'needs-setup':
      return providerNeedsApiKey(provider, hasApiKey)
    case 'disabled':
      return !providerNeedsApiKey(provider, hasApiKey) && !enabled
    case 'active':
      return !providerNeedsApiKey(provider, hasApiKey) && enabled
    default:
      return true
  }
}

const CATALOG_BASE_BACKGROUND = 'var(--theme-background)'
const STATUS_COLORS = {
  success: {
    background: 'color-mix(in srgb, var(--theme-success) 14%, transparent)',
    color: 'var(--theme-success)',
  },
  warning: {
    background: 'color-mix(in srgb, var(--theme-warning) 14%, transparent)',
    color: 'var(--theme-warning)',
  },
  error: {
    border: 'color-mix(in srgb, var(--theme-error) 56%, transparent)',
    background: 'color-mix(in srgb, var(--theme-error) 22%, transparent)',
    icon: 'var(--theme-error)',
  },
  connectivitySuccess: {
    border: 'color-mix(in srgb, var(--theme-success) 40%, transparent)',
    background: 'color-mix(in srgb, var(--theme-success) 20%, transparent)',
    icon: 'var(--theme-success)',
  },
} as const
const DEFAULT_PROVIDER_ENABLED: Record<ProviderKey, boolean> = {
  ...getProviderEnabledDefaults(),
} as Record<ProviderKey, boolean>

function getSecretFieldPlaceholder(label: string, value: string | undefined): string {
  if (isSecureApiKeyPlaceholder(value)) {
    return `${label} stored securely. Enter a new key to replace it.`
  }
  return `${label} API Key`
}

interface ModelBasic {
  code: string
  displayName: string
  enabled?: boolean
}

export interface ProviderHubSectionProps {
  alibabaApiKey: string
  alibabaRegion: AlibabaRegion
  deepseekApiKey: string
  opencodeGoApiKey: string
  fireworksApiKey: string
  nvidiaApiKey: string
  groqApiKey: string
  openRouterApiKey: string
  tavilyApiKey: string
  onlineCompilerApiKey: string
  tavilySearchDepthPreference: TavilySearchDepthPreference
  webSearchIncludeImages: boolean
  ollamaUrl: string
  aiModel: string
  modelProvider: ProviderKey
  providerEnabled?: ProviderEnabledMap
  configuredModels: ConfiguredModel[]
  codexModels: ModelBasic[]
  alibabaModels: ModelBasic[]
  deepseekModels: ModelBasic[]
  opencodeModels: ModelBasic[]
  fireworksModels: ModelBasic[]
  nvidiaModels: ModelBasic[]
  groqModels: ModelBasic[]
  ollamaModels: ModelBasic[]
  maxTokens: number
  deepseekReasoning?: Record<string, { enabled: boolean; effort: DeepSeekReasoningEffort }>
  deepseekLastEffort?: DeepSeekReasoningEffort
  initialProvider?: ProviderKey
  initialManageMode?: ManageMode
  onParamsConsumed?: () => void
  onChange: (
    changes: Partial<{
      alibabaApiKey: string
      alibabaRegion: AlibabaRegion
      deepseekApiKey: string
      opencodeGoApiKey: string
      fireworksApiKey: string
      nvidiaApiKey: string
      groqApiKey: string
      openRouterApiKey: string

      tavilyApiKey: string
      onlineCompilerApiKey: string
      tavilySearchDepthPreference: TavilySearchDepthPreference
      webSearchIncludeImages: boolean
      ollamaUrl: string
      configuredModels: ConfiguredModel[]
      codexModels: ConfiguredModel[]
      alibabaModels: ConfiguredModel[]
      deepseekModels: ConfiguredModel[]
      opencodeModels: ConfiguredModel[]
      fireworksModels: ConfiguredModel[]
      nvidiaModels: ConfiguredModel[]
      groqModels: ConfiguredModel[]
      ollamaModels: ConfiguredModel[]
      maxTokens: number
      aiModel: string
      modelProvider: ProviderKey
      providerEnabled: ProviderEnabledMap
      deepseekReasoning: Record<string, { enabled: boolean; effort: DeepSeekReasoningEffort }>
      deepseekLastEffort: DeepSeekReasoningEffort
    }>
  ) => void
}

type ProviderSettingsUpdate = Partial<
  Pick<
    ProviderHubSectionProps,
    | 'configuredModels'
    | 'codexModels'
    | 'groqModels'
    | 'alibabaModels'
    | 'deepseekModels'
    | 'opencodeModels'
    | 'fireworksModels'
    | 'nvidiaModels'
    | 'ollamaModels'
    | 'aiModel'
    | 'modelProvider'
    | 'providerEnabled'
  >
>

export function ProviderHubSection({
  openRouterApiKey,
  groqApiKey,
  alibabaApiKey,
  alibabaRegion,
  deepseekApiKey,
  opencodeGoApiKey,
  fireworksApiKey,
  nvidiaApiKey,
  tavilyApiKey,
  onlineCompilerApiKey,
  tavilySearchDepthPreference,
  webSearchIncludeImages,
  ollamaUrl,
  aiModel,
  modelProvider,
  providerEnabled,
  configuredModels,
  codexModels,
  groqModels,
  alibabaModels,
  deepseekModels,
  opencodeModels,
  fireworksModels,
  nvidiaModels,
  ollamaModels,
  deepseekReasoning,
  deepseekLastEffort,
  initialProvider,
  initialManageMode,
  onParamsConsumed,
  onChange,
}: ProviderHubSectionProps): React.ReactElement {
  const normalizeVisibleProvider = (provider?: ProviderKey): ProviderKey => provider || 'openrouter'

  const [catalogFilter, setCatalogFilter] = useState<ProviderCatalogFilter>('all')
  const [providerView, setProviderView] = useState<ProviderView>(
    initialProvider ? 'detail' : 'catalog'
  )
  const [providerModelQuery, setProviderModelQuery] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>(
    normalizeVisibleProvider(initialProvider)
  )
  const [searchApiView, setSearchApiView] = useState<'catalog' | 'detail'>('catalog')
  const [selectedSearchApi, setSelectedSearchApi] = useState<SearchApiKey>('tavily')
  const [showApiKey, setShowApiKey] = useState(false)
  const [displayedApiKey, setDisplayedApiKey] = useState('')
  const modelDialogs = useProviderModelDialogs()
  const [modelListFilter, setModelListFilter] = useState<'all' | 'chat'>('all')
  const apiKeyOrEndpointInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (initialProvider != null || initialManageMode != null) {
      if (initialProvider != null) {
        setSelectedProvider(normalizeVisibleProvider(initialProvider))
        setProviderView('detail')
      } else if (initialManageMode === 'search-apis') {
        setSelectedSearchApi('tavily')
        setSearchApiView('detail')
      }
      onParamsConsumed?.()
    }
  }, [initialProvider, initialManageMode, onParamsConsumed])

  const providerModelMap = useMemo(
    () =>
      createProviderModelMap({
        configuredModels,
        codexModels,
        groqModels,
        alibabaModels,
        deepseekModels,
        opencodeModels,
        fireworksModels,
        nvidiaModels,
        ollamaModels,
      }),
    [
      configuredModels,
      codexModels,
      groqModels,
      alibabaModels,
      deepseekModels,
      opencodeModels,
      fireworksModels,
      nvidiaModels,
      ollamaModels,
    ]
  )

  const selectedProviderDef =
    PROVIDERS.find((provider) => provider.key === selectedProvider) ?? PROVIDERS[0]

  useEffect(() => {
    setShowApiKey(false)
    setDisplayedApiKey('')

    const apiKeyField = selectedProviderDef.apiKeyField
    if (!apiKeyField) return

    const currentValue = getProviderApiKey(selectedProviderDef)
    setDisplayedApiKey(isSecureApiKeyPlaceholder(currentValue) ? '' : currentValue)
  }, [selectedProviderDef.key, selectedProviderDef.apiKeyField])

  const providerDashboardUrl = getProviderDashboardUrl(selectedProviderDef.key)

  useEffect(() => {
    setModelListFilter('all')
  }, [selectedProviderDef.key])

  const getProviderApiKey = (provider: ProviderHubDefinition): string => {
    if (!provider.apiKeyField) return ''
    const providerApiKeys: Record<ProviderSecretField, string> = {
      alibabaApiKey: alibabaApiKey ?? '',
      deepseekApiKey: deepseekApiKey ?? '',
      opencodeGoApiKey: opencodeGoApiKey ?? '',
      fireworksApiKey: fireworksApiKey ?? '',
      nvidiaApiKey: nvidiaApiKey ?? '',
      groqApiKey: groqApiKey ?? '',
      openRouterApiKey: openRouterApiKey ?? '',
    }
    return providerApiKeys[provider.apiKeyField] ?? ''
  }

  const providerModelsController = useProviderModels({
    selectedProvider: selectedProviderDef,
    providerModelMap: providerModelMap as Record<ProviderKey, ConfiguredModel[]>,
    query: providerModelQuery,
    listFilter: modelListFilter,
    configuredModels,
    modelProvider,
    aiModel,
    deepseekReasoning,
    deepseekLastEffort,
    getProviderApiKey,
    openRouterProvider:
      PROVIDERS.find((provider) => provider.key === 'openrouter') ?? selectedProviderDef,
    onChange,
  })
  const providerModels = providerModelsController.providerModels

  const connectivity = useProviderConnectivity({
    provider: selectedProviderDef,
    models: providerModels,
    getApiKey: getProviderApiKey,
    alibabaRegion,
    ollamaUrl,
    aiModel,
    onModelsDiscovered: (models, selectedModel) => {
      onChange({
        codexModels: models,
        ...(modelProvider === 'codex' ? { aiModel: selectedModel } : {}),
      })
    },
  })

  const normalizedProviderEnabled = useMemo<Record<ProviderKey, boolean>>(() => {
    return {
      openrouter: providerEnabled?.openrouter !== false,
      codex: providerEnabled?.codex !== false,
      groq: providerEnabled?.groq !== false,
      ollama: providerEnabled?.ollama !== false,
      alibaba: providerEnabled?.alibaba !== false,
      deepseek: providerEnabled?.deepseek !== false,
      opencode: providerEnabled?.opencode !== false,
      fireworks: providerEnabled?.fireworks !== false,
      nvidia: providerEnabled?.nvidia !== false,
    }
  }, [
    providerEnabled?.openrouter,
    providerEnabled?.codex,
    providerEnabled?.groq,
    providerEnabled?.ollama,
    providerEnabled?.alibaba,
    providerEnabled?.deepseek,
    providerEnabled?.opencode,
    providerEnabled?.fireworks,
    providerEnabled?.nvidia,
  ])

  const isProviderEnabled = (provider: ProviderHubDefinition): boolean =>
    normalizedProviderEnabled[provider.key]

  const catalogStats = useMemo(() => {
    let configured = 0
    let active = 0
    let needsSetup = 0
    let disabled = 0

    for (const provider of PROVIDERS) {
      const hasApiKey = provider.apiKeyField ? getProviderApiKey(provider).trim().length > 0 : true
      const enabled = isProviderEnabled(provider)
      const needsKey = providerNeedsApiKey(provider, hasApiKey)

      if (!needsKey) configured += 1
      if (needsKey) needsSetup += 1
      if (!needsKey && enabled) active += 1
      if (!needsKey && !enabled) disabled += 1
    }

    return {
      total: PROVIDERS.length,
      configured,
      active,
      needsSetup,
      disabled,
    }
  }, [
    alibabaApiKey,
    deepseekApiKey,
    opencodeGoApiKey,
    fireworksApiKey,
    groqApiKey,
    nvidiaApiKey,
    openRouterApiKey,
    normalizedProviderEnabled,
  ])

  const setProviderApiKey = (provider: ProviderHubDefinition, value: string) => {
    if (!provider.apiKeyField) return
    onChange({ [provider.apiKeyField]: value })
  }

  const setProviderEnabled = (providerKey: ProviderKey, enabled: boolean) => {
    const nextProviderEnabled: ProviderEnabledMap = {
      ...DEFAULT_PROVIDER_ENABLED,
      ...providerEnabled,
      [providerKey]: enabled,
    }

    const updates: ProviderSettingsUpdate = {
      providerEnabled: nextProviderEnabled,
    }

    if (!enabled && modelProvider === providerKey) {
      const fallbackProvider = PROVIDERS.find((provider) => {
        if (!nextProviderEnabled[provider.key]) return false
        const models = providerModelMap[provider.key] || []
        return models.some((model) => model.enabled !== false)
      })

      const fallbackModel = fallbackProvider
        ? (providerModelMap[fallbackProvider.key] || []).find((model) => model.enabled !== false)
        : null

      if (fallbackProvider && fallbackModel) {
        updates.modelProvider = fallbackProvider.key
        updates.aiModel = fallbackModel.code
      }
    }

    onChange(updates)
  }

  const getModelsForProvider = (provider: ProviderKey): ConfiguredModel[] => {
    return (providerModelMap[provider] as ConfiguredModel[] | undefined) || []
  }

  const setModelsForProvider = (provider: ProviderKey, models: ConfiguredModel[]) => {
    onChange(buildProviderModelUpdate(provider, models))
  }

  const addCustomModel = (
    model: ConfiguredModel,
    provider: ProviderKey = selectedProviderDef.key
  ) => {
    const currentModels = getModelsForProvider(provider)
    const exists = currentModels.some((item) => item.code === model.code)
    if (exists) {
      setModelsForProvider(
        provider,
        currentModels.map((item) => (item.code === model.code ? { ...item, ...model } : item))
      )
      return
    }
    setModelsForProvider(provider, [...currentModels, model])
  }

  const toggleModelEnabled = (provider: ProviderKey, modelCode: string, checked: boolean) => {
    const currentModels = providerModelMap[provider] as ConfiguredModel[]
    const updatedModels = currentModels.map((model) => {
      if (model.code !== modelCode) return model
      return { ...model, enabled: checked }
    })

    const updates: ProviderSettingsUpdate = buildProviderModelUpdate(provider, updatedModels)

    if (!checked && modelProvider === provider && aiModel === modelCode) {
      const fallback = updatedModels.find((model) => model.enabled !== false)
      if (fallback) {
        updates.aiModel = fallback.code
        updates.modelProvider = provider
      }
    }

    onChange(updates)
  }

  const toggleModelReasoning = (modelCode: string, checked: boolean) => {
    // DeepSeek-only: the user's explicit per-model toggle is the source of truth.
    onChange(
      setDeepseekReasoningEnabled({ deepseekReasoning, deepseekLastEffort }, modelCode, checked)
    )
  }

  const detectOpenRouterReasoning = async (modelCode: string) => {
    setDetectingReasoningModel(modelCode)
    try {
      const openRouterProvider =
        PROVIDERS.find((provider) => provider.key === 'openrouter') ?? selectedProviderDef
      const catalogModels = await fetchOpenRouterModels(getProviderApiKey(openRouterProvider))
      const catalogModel = catalogModels.find((model) => model.id === modelCode)
      if (!catalogModel) return

      const mappedModel = mapOpenRouterModelToConfiguredModel(catalogModel)
      const supportsReasoning = mappedModel.supportsDeepThinking === true
      const updatedModels = configuredModels.map((model) => {
        if (model.code !== modelCode) return model
        return {
          ...model,
          supportsDeepThinking: supportsReasoning,
          modelType: supportsReasoning ? 'reasoning' : model.modelType,
          openRouterReasoningDetected: true,
        }
      })

      onChange({ configuredModels: updatedModels })
    } finally {
      setDetectingReasoningModel(null)
    }
  }

  const updateModel = (provider: ProviderKey, modelCode: string, updatedModel: ConfiguredModel) => {
    const currentModels = providerModelMap[provider] as ConfiguredModel[]
    const updatedModels = currentModels.map((model) => {
      if (model.code !== modelCode) return model
      return { ...model, ...updatedModel, code: modelCode }
    })

    onChange(buildProviderModelUpdate(provider, updatedModels))
  }

  const removeModel = (provider: ProviderKey, modelCode: string) => {
    const currentModels = providerModelMap[provider] as ConfiguredModel[]
    const updatedModels = currentModels.filter((model) => model.code !== modelCode)

    const updates: ProviderSettingsUpdate = buildProviderModelUpdate(provider, updatedModels)

    if (modelProvider === provider && aiModel === modelCode) {
      const fallback = updatedModels.find((model) => model.enabled !== false)
      if (fallback) {
        updates.aiModel = fallback.code
        updates.modelProvider = provider
      }
    }

    onChange(updates)
  }

  const handleEditModel = (model: ModelBasic) => {
    modelDialogs.openEdit(selectedProviderDef.key, model as ConfiguredModel)
  }

  const handleDeleteModelClick = (model: ModelBasic) => {
    modelDialogs.openDelete({
      provider: selectedProviderDef.key,
      modelCode: model.code,
      displayName: model.displayName || model.code,
    })
  }

  const handleDeleteConfirm = () => {
    if (modelDialogs.modelToDelete) {
      removeModel(modelDialogs.modelToDelete.provider, modelDialogs.modelToDelete.modelCode)
    }
    modelDialogs.closeDelete()
  }

  const clearModelsForProvider = (provider: ProviderKey) => {
    onChange(buildProviderModelUpdate(provider, []))
  }

  const handleClearModelsConfirm = () => {
    clearModelsForProvider(selectedProviderDef.key)
    modelDialogs.setClearOpen(false)
  }

  return (
    <div className="settings-section-layout settings-section-layout--wide min-w-0">
      <div className="page-header flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="page-title">Providers</h2>
          <div className="page-subtitle">
            Manage model providers, API keys, and service APIs in one place.
          </div>
        </div>
      </div>

      {providerView === 'catalog' && searchApiView === 'catalog' && (
        <div className="mt-4 min-w-0 space-y-4">
          <ProviderCatalogStats
            stats={catalogStats}
            filter={catalogFilter}
            onFilterChange={setCatalogFilter}
          />
          <Card
            className="settings-section-card provider-hub-base-card min-w-0 overflow-y-auto p-4 sm:p-5"
            style={{ background: CATALOG_BASE_BACKGROUND }}
          >
            <ProviderCatalog
              providers={PROVIDERS}
              filter={catalogFilter}
              onCardClick={(provider) => {
                setSelectedProvider(provider.key)
                setProviderView('detail')
              }}
              isProviderEnabled={isProviderEnabled}
              setProviderEnabled={setProviderEnabled}
              getApiKey={getProviderApiKey}
              modelMap={providerModelMap}
            />
            <div className="mt-4 border-t border-border pt-4">
              <SearchApiSection
                apis={SEARCH_APIS}
                filter={catalogFilter}
                selectedApi={selectedSearchApi}
                tavilyApiKey={tavilyApiKey}
                onlineCompilerApiKey={onlineCompilerApiKey}
                tavilySearchDepthPreference={tavilySearchDepthPreference}
                onCardClick={(api) => {
                  setSelectedSearchApi(api.key)
                  setSearchApiView('detail')
                }}
                onChange={onChange}
              />
            </div>
          </Card>
        </div>
      )}

      {providerView === 'detail' && searchApiView === 'catalog' && (
        <Card
          className="settings-section-card provider-hub-base-card mt-4 min-w-0 px-4 sm:px-5"
          style={{ background: CATALOG_BASE_BACKGROUND }}
        >
          <div className="min-w-0 space-y-6">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProviderView('catalog')}
                  className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  aria-label="Back to providers"
                >
                  <ChevronLeft size={16} />
                </button>
                <ProviderLogo provider={selectedProviderDef.key} size={18} />
                <span className="text-xl font-semibold leading-none text-foreground sm:text-2xl lg:text-[28px]">
                  {selectedProviderDef.name}
                </span>
                {providerDashboardUrl ? (
                  <WithTooltip tooltip={`Open ${selectedProviderDef.name} dashboard`}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 rounded-full border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                      onClick={() => window.shell?.openExternal(providerDashboardUrl)}
                      aria-label={`Open ${selectedProviderDef.name} dashboard`}
                    >
                      <ExternalLink size={12} />
                    </Button>
                  </WithTooltip>
                ) : (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground">
                    <CircleHelp size={12} />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  className="provider-hub-toggle"
                  checked={isProviderEnabled(selectedProviderDef)}
                  onCheckedChange={(checked) => {
                    setProviderEnabled(selectedProviderDef.key, checked)
                    if (checked) {
                      apiKeyOrEndpointInputRef.current?.focus()
                    }
                  }}
                  aria-label={`Enable ${selectedProviderDef.name}`}
                />
              </div>
            </div>

            <div className="border-t border-border pt-6">
              {selectedProviderDef.apiKeyField ? (
                <div className="space-y-6">
                  <ProviderDetailField
                    label="API Key"
                    description={`Please enter your ${selectedProviderDef.name} API key`}
                    control={
                      <div className="relative w-full">
                        <Input
                          ref={apiKeyOrEndpointInputRef}
                          type={showApiKey ? 'text' : 'password'}
                          value={
                            isSecureApiKeyPlaceholder(getProviderApiKey(selectedProviderDef))
                              ? displayedApiKey
                              : getProviderApiKey(selectedProviderDef)
                          }
                          onChange={(e) => {
                            setDisplayedApiKey(e.target.value)
                            setProviderApiKey(selectedProviderDef, e.target.value)
                            connectivity.reset('API key changed. Run connectivity check to verify.')
                          }}
                          className="border-border bg-secondary pr-10"
                          placeholder={getSecretFieldPlaceholder(
                            selectedProviderDef.name,
                            getProviderApiKey(selectedProviderDef)
                          )}
                          autoComplete="new-password"
                          spellCheck={false}
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey((previous) => !previous)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                          aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                        >
                          {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    }
                  />

                  {selectedProviderDef.key === 'alibaba' && (
                    <ProviderDetailField
                      label="Region"
                      description="The API key and endpoint must belong to the same Alibaba region."
                      control={
                        <Select
                          value={alibabaRegion}
                          onValueChange={(value) => {
                            onChange({ alibabaRegion: value as AlibabaRegion })
                            connectivity.reset('Region changed. Run connectivity check again.')
                          }}
                        >
                          <SelectTrigger
                            className="h-10 border-border bg-secondary"
                            aria-label="Alibaba region"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="settings-menu-surface">
                            <SelectItem value="singapore">Singapore</SelectItem>
                            <SelectItem value="us-virginia">US (Virginia)</SelectItem>
                            <SelectItem value="china-beijing">China (Beijing)</SelectItem>
                          </SelectContent>
                        </Select>
                      }
                    />
                  )}

                  <ProviderDetailField
                    label="Connectivity Check"
                    description="Test if API key and proxy URL are correctly configured"
                    control={
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Select
                            value={connectivity.model}
                            onValueChange={connectivity.selectModel}
                          >
                            <SelectTrigger
                              className="h-10 flex-1 border-border bg-secondary"
                              aria-label="Connectivity check model"
                            >
                              <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                            <SelectContent className="settings-menu-surface">
                              {providerModels.map((model) => (
                                <SelectItem key={model.code} value={model.code}>
                                  {model.code}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            className="min-w-24"
                            onClick={connectivity.check}
                            disabled={connectivity.state.status === 'checking'}
                          >
                            {connectivity.state.status === 'checking' ? (
                              <span className="inline-flex items-center gap-2">
                                <Loader2 size={14} className="animate-spin" />
                                Checking
                              </span>
                            ) : (
                              'Check'
                            )}
                          </Button>
                        </div>

                        <div
                          className="rounded-xl border"
                          style={{
                            borderColor:
                              connectivity.state.status === 'error'
                                ? STATUS_COLORS.error.border
                                : connectivity.state.status === 'success'
                                  ? STATUS_COLORS.connectivitySuccess.border
                                  : 'var(--theme-border)',
                            background:
                              connectivity.state.status === 'error'
                                ? STATUS_COLORS.error.background
                                : connectivity.state.status === 'success'
                                  ? STATUS_COLORS.connectivitySuccess.background
                                  : 'var(--theme-surface-hover)',
                          }}
                        >
                          <div className="px-4 py-3">
                            <span className="inline-flex items-start gap-2 text-sm leading-6 text-foreground">
                              {connectivity.state.status === 'checking' && (
                                <Loader2 size={16} className="mt-0.5 animate-spin" />
                              )}
                              {connectivity.state.status === 'success' && (
                                <CheckCircle2
                                  size={16}
                                  className="mt-0.5"
                                  style={{ color: STATUS_COLORS.connectivitySuccess.icon }}
                                />
                              )}
                              {connectivity.state.status === 'error' && (
                                <AlertCircle
                                  size={16}
                                  className="mt-0.5"
                                  style={{ color: STATUS_COLORS.error.icon }}
                                />
                              )}
                              {connectivity.state.status === 'idle' && (
                                <Globe size={16} className="mt-0.5 text-muted-foreground" />
                              )}
                              <span>{connectivity.state.message}</span>
                            </span>
                            {connectivity.state.meta && (
                              <span className="mt-2 block text-xs text-muted-foreground">
                                {`Latency ${connectivity.state.meta.latencyMs}ms • Checked at ${connectivity.state.meta.checkedAt}`}
                              </span>
                            )}
                          </div>

                          {connectivity.state.details && (
                            <div className="border-t border-dashed border-border/60 px-4 py-2">
                              <button
                                type="button"
                                onClick={connectivity.toggleDetails}
                                className="text-xs text-foreground/90 transition hover:text-foreground"
                              >
                                {connectivity.state.showDetails ? 'Hide Details' : 'Show Details'}
                              </button>
                              {connectivity.state.showDetails && (
                                <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-muted-foreground">
                                  {connectivity.state.details}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    }
                  />
                </div>
              ) : selectedProviderDef.key === 'codex' ? (
                <div className="space-y-6">
                  <ProviderDetailField
                    label="ChatGPT Account"
                    description="Unofficial local integration using your ChatGPT Codex allowance. OAuth tokens are OS-encrypted and remain in ZuraAI's main process."
                    control={
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={connectivity.signInCodex}
                          disabled={connectivity.codexSigningIn}
                        >
                          {connectivity.codexSigningIn ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <ExternalLink size={14} />
                          )}
                          {connectivity.codexSigningIn
                            ? 'Waiting for sign-in'
                            : connectivity.codexSignedIn
                              ? 'Sign in again'
                              : 'Sign in with ChatGPT'}
                        </Button>
                        {connectivity.codexSignedIn && (
                          <Button variant="ghost" onClick={connectivity.signOutCodex}>
                            Sign out
                          </Button>
                        )}
                      </div>
                    }
                  />
                  <ProviderDetailField
                    label="Connectivity Check"
                    description="Verify the OAuth session and selected account-accessible Codex model."
                    control={
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={connectivity.check}
                          disabled={connectivity.state.status === 'checking'}
                        >
                          {connectivity.state.status === 'checking' ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 size={14} className="animate-spin" />
                              Checking
                            </span>
                          ) : (
                            'Check ChatGPT sign-in'
                          )}
                        </Button>
                        <div className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm">
                          <span className="inline-flex items-start gap-2">
                            {connectivity.state.status === 'success' ? (
                              <CheckCircle2 size={16} className="mt-0.5 text-emerald-400" />
                            ) : connectivity.state.status === 'error' ? (
                              <AlertCircle size={16} className="mt-0.5 text-red-400" />
                            ) : (
                              <ShieldCheck size={16} className="mt-0.5 text-muted-foreground" />
                            )}
                            <span>{connectivity.state.message}</span>
                          </span>
                          {connectivity.state.details && (
                            <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-muted-foreground">
                              {connectivity.state.details}
                            </pre>
                          )}
                        </div>
                      </div>
                    }
                  />
                </div>
              ) : (
                <ProviderDetailField
                  label="Ollama Endpoint"
                  description="Set your local Ollama endpoint URL"
                  control={
                    <Input
                      ref={apiKeyOrEndpointInputRef}
                      value={ollamaUrl}
                      onChange={(e) => onChange({ ollamaUrl: e.target.value })}
                      className="border-border bg-secondary"
                      placeholder="http://localhost:11434"
                    />
                  }
                />
              )}

              {selectedProviderDef.apiKeyField && (
                <p className="mt-5 inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck size={13} />
                  <span>
                    Your key is stored in{' '}
                    <a
                      href="https://www.electronjs.org/docs/latest/api/safe-storage"
                      onClick={(e) => {
                        e.preventDefault()
                        window.shell?.openExternal(
                          'https://www.electronjs.org/docs/latest/api/safe-storage'
                        )
                      }}
                      className="text-cyan-300 underline decoration-cyan-300/40 underline-offset-2 transition hover:decoration-cyan-300"
                    >
                      Electron secure storage
                    </a>
                  </span>
                </p>
              )}
            </div>

            <div className="space-y-3 border-t border-border pt-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">Model List</h3>
                <span className="text-sm text-muted-foreground">
                  {providerModels.length} models available
                </span>
              </div>

              <div className="flex items-center gap-4 pb-1">
                <button
                  type="button"
                  onClick={() => setModelListFilter('all')}
                  className="text-sm"
                  style={{
                    color:
                      modelListFilter === 'all'
                        ? 'var(--theme-text-primary)'
                        : 'var(--theme-text-secondary)',
                  }}
                >
                  All ({visibleProviderModels.length})
                </button>
                <button
                  type="button"
                  onClick={() => setModelListFilter('chat')}
                  className="text-sm"
                  style={{
                    color:
                      modelListFilter === 'chat'
                        ? 'var(--theme-text-primary)'
                        : 'var(--theme-text-secondary)',
                  }}
                >
                  Chat ({visibleChatModels.length})
                </button>
              </div>

              <div className="grid min-w-0 items-center gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                <div className="relative min-w-0">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    value={providerModelQuery}
                    onChange={(e) => setProviderModelQuery(e.target.value)}
                    placeholder="Search models..."
                    className="h-8 w-full border-border bg-secondary pl-9"
                  />
                </div>
                {selectedProviderDef.supportsCatalogDialog && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => modelDialogs.openCatalog(selectedProviderDef.key)}
                    className="gap-2 whitespace-nowrap"
                  >
                    <Search size={14} />
                    Add from Catalog
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => modelDialogs.setClearOpen(true)}
                  disabled={providerModels.length === 0}
                  className="gap-2 whitespace-nowrap text-rose-300 hover:text-rose-200"
                >
                  <Trash2 size={14} />
                  Remove All
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => modelDialogs.setAddOpen(true)}
                  aria-label="Add custom model"
                >
                  <Plus size={16} />
                </Button>
              </div>

              <div className="max-h-[min(350px,55vh)] overflow-y-auto rounded-md border border-border bg-secondary/35 sm:max-h-[480px] lg:max-h-[640px]">
                <ModelGroup
                  models={[...enabledModels, ...disabledModels]}
                  selectedProvider={selectedProviderDef.key}
                  onToggleModel={(code, checked) =>
                    toggleModelEnabled(selectedProviderDef.key, code, checked)
                  }
                  reasoningEnabledFor={
                    selectedProviderDef.key === 'deepseek'
                      ? (code) =>
                          getDeepseekReasoning({ deepseekReasoning, deepseekLastEffort }, code)
                            .enabled
                      : undefined
                  }
                  onToggleReasoning={
                    selectedProviderDef.key === 'deepseek' ? toggleModelReasoning : undefined
                  }
                  onDetectOpenRouterReasoning={
                    selectedProviderDef.key === 'openrouter' ? detectOpenRouterReasoning : undefined
                  }
                  detectingOpenRouterReasoningCode={
                    selectedProviderDef.key === 'openrouter' ? detectingReasoningModel : null
                  }
                  onEditModel={handleEditModel}
                  onDeleteModel={handleDeleteModelClick}
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {searchApiView === 'detail' && providerView === 'catalog' && (
        <SearchApiDetail
          api={SEARCH_APIS.find((a) => a.key === selectedSearchApi)!}
          tavilyApiKey={tavilyApiKey}
          onlineCompilerApiKey={onlineCompilerApiKey}
          tavilySearchDepthPreference={tavilySearchDepthPreference}
          webSearchIncludeImages={webSearchIncludeImages}
          onBack={() => setSearchApiView('catalog')}
          onChange={onChange}
        />
      )}

      <CreateCustomModelDialog
        open={modelDialogs.addOpen}
        onOpenChange={modelDialogs.setAddOpen}
        provider={selectedProviderDef.key}
        providerApiKey={getProviderApiKey(selectedProviderDef)}
        onCreate={(model) => addCustomModel(model, selectedProviderDef.key)}
      />

      <CreateCustomModelDialog
        open={modelDialogs.editOpen}
        onOpenChange={(open) => {
          modelDialogs.setEditOpen(open)
          if (!open) modelDialogs.setModelToEdit(null)
        }}
        provider={modelDialogs.modelToEdit?.provider}
        providerApiKey={
          modelDialogs.modelToEdit
            ? getProviderApiKey(
                PROVIDERS.find((provider) => provider.key === modelDialogs.modelToEdit?.provider) ??
                  selectedProviderDef
              )
            : ''
        }
        onCreate={addCustomModel}
        initialModel={modelDialogs.modelToEdit?.model}
        onUpdate={(updated) => {
          if (modelDialogs.modelToEdit) {
            updateModel(
              modelDialogs.modelToEdit.provider,
              modelDialogs.modelToEdit.model.code,
              updated
            )
            modelDialogs.closeEdit()
          }
        }}
      />

      <Dialog open={modelDialogs.deleteOpen} onOpenChange={modelDialogs.setDeleteOpen}>
        <DialogContent className="border-border bg-card sm:max-w-[420px]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete Model</DialogTitle>
            <DialogDescription>
              {modelDialogs.modelToDelete && (
                <>
                  Remove{' '}
                  <span className="inline-flex rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.9em] text-foreground">
                    &quot;{modelDialogs.modelToDelete.displayName}&quot;
                  </span>{' '}
                  from your model list?
                  {modelDialogs.modelToDelete.provider === 'ollama' && (
                    <span className="mt-2 block text-muted-foreground">
                      Ollama models will reappear when you refresh the model list.
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={modelDialogs.closeDelete}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={modelDialogs.clearOpen} onOpenChange={modelDialogs.setClearOpen}>
        <DialogContent className="border-border bg-card sm:max-w-[440px]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove All Models</DialogTitle>
            <DialogDescription>
              Remove all models from{' '}
              <span className="inline-flex rounded bg-secondary px-1.5 py-0.5 text-foreground">
                {selectedProviderDef.name}
              </span>
              ?
              {selectedProviderDef.key === 'ollama' && (
                <span className="mt-2 block text-muted-foreground">
                  Ollama models will reappear when you refresh the model list.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => modelDialogs.setClearOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClearModelsConfirm}>
              Remove All
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {selectedProviderDef.key === 'alibaba' && (
        <AlibabaModelSearchDialog
          open={modelDialogs.catalogOpen.alibaba === true}
          onOpenChange={(open) => modelDialogs.setCatalogDialogOpen('alibaba', open)}
          onAddModel={(model) => addCustomModel(model, 'alibaba')}
          existingModelCodes={alibabaModels.map((m) => m.code)}
        />
      )}

      {selectedProviderDef.key === 'openrouter' && (
        <OpenRouterModelSearchDialog
          open={modelDialogs.catalogOpen.openrouter === true}
          onOpenChange={(open) => modelDialogs.setCatalogDialogOpen('openrouter', open)}
          onAddModel={(model) => addCustomModel(model, 'openrouter')}
          apiKey={openRouterApiKey}
          existingModelCodes={configuredModels.map((m) => m.code)}
        />
      )}

      {selectedProviderDef.key === 'fireworks' && (
        <FireworksModelSearchDialog
          open={modelDialogs.catalogOpen.fireworks === true}
          onOpenChange={(open) => modelDialogs.setCatalogDialogOpen('fireworks', open)}
          onAddModel={(model) => addCustomModel(model, 'fireworks')}
          apiKey={fireworksApiKey}
          existingModelCodes={fireworksModels.map((m) => m.code)}
        />
      )}

      {selectedProviderDef.key === 'deepseek' && (
        <DeepseekModelSearchDialog
          open={modelDialogs.catalogOpen.deepseek === true}
          onOpenChange={(open) => modelDialogs.setCatalogDialogOpen('deepseek', open)}
          onAddModel={(model) => addCustomModel(model, 'deepseek')}
          apiKey={getProviderApiKey(selectedProviderDef)}
          existingModelCodes={deepseekModels.map((m) => m.code)}
        />
      )}

      {selectedProviderDef.key === 'opencode' && (
        <OpencodeModelSearchDialog
          open={modelDialogs.catalogOpen.opencode === true}
          onOpenChange={(open) => modelDialogs.setCatalogDialogOpen('opencode', open)}
          onAddModel={(model) => addCustomModel(model, 'opencode')}
          apiKey={getProviderApiKey(selectedProviderDef)}
          existingModelCodes={opencodeModels.map((m) => m.code)}
        />
      )}

      {selectedProviderDef.key === 'nvidia' && (
        <NvidiaModelSearchDialog
          open={modelDialogs.catalogOpen.nvidia === true}
          onOpenChange={(open) => modelDialogs.setCatalogDialogOpen('nvidia', open)}
          onAddModel={(model) => addCustomModel(model, 'nvidia')}
          apiKey={getProviderApiKey(selectedProviderDef)}
          existingModelCodes={nvidiaModels.map((m) => m.code)}
        />
      )}
    </div>
  )
}

function ProviderCatalogStats({
  stats,
  filter,
  onFilterChange,
}: {
  stats: { total: number; configured: number; active: number; needsSetup: number; disabled: number }
  filter: ProviderCatalogFilter
  onFilterChange: (filter: ProviderCatalogFilter) => void
}): React.ReactElement {
  const chips: Array<{ id: ProviderCatalogFilter; label: string; value: number }> = [
    { id: 'all', label: 'All', value: stats.total },
    { id: 'active', label: 'Active', value: stats.active },
    { id: 'needs-setup', label: 'Needs setup', value: stats.needsSetup },
    { id: 'disabled', label: 'Disabled', value: stats.disabled },
  ]

  const summaryParts = [`${stats.configured}/${stats.total} configured`, `${stats.active} active`]
  if (stats.needsSetup > 0) {
    summaryParts.push(`${stats.needsSetup} need setup`)
  }

  return (
    <div className="provider-hub-header" aria-label="Provider status summary">
      <div className="provider-hub-header__intro">
        <p className="provider-hub-header__summary">{summaryParts.join(' · ')}</p>
      </div>
      <div className="provider-hub-header__stats">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`provider-hub-stat ${filter === chip.id ? 'is-active' : ''}`}
            onClick={() =>
              onFilterChange(filter === chip.id && chip.id !== 'all' ? 'all' : chip.id)
            }
            aria-pressed={filter === chip.id}
          >
            <span className="provider-hub-stat__label">{chip.label}</span>
            <span className="provider-hub-stat__value">{chip.value}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ProviderCatalog({
  providers,
  filter,
  onCardClick,
  isProviderEnabled,
  setProviderEnabled,
  getApiKey,
  modelMap,
}: {
  providers: readonly ProviderHubDefinition[]
  filter: ProviderCatalogFilter
  onCardClick: (provider: ProviderHubDefinition) => void
  isProviderEnabled: (provider: ProviderHubDefinition) => boolean
  setProviderEnabled: (providerKey: ProviderKey, enabled: boolean) => void
  getApiKey: (provider: ProviderHubDefinition) => string
  modelMap: Record<ProviderKey, ModelBasic[]>
}): React.ReactElement | null {
  const providerByKey = useMemo(() => {
    return new Map(providers.map((provider) => [provider.key, provider]))
  }, [providers])

  const orderedProviders: ProviderHubDefinition[] = []
  for (const key of PROVIDER_CATALOG_ORDER) {
    const provider = providerByKey.get(key)
    if (provider) orderedProviders.push(provider)
  }
  for (const provider of providers) {
    if (!PROVIDER_CATALOG_ORDER.includes(provider.key)) {
      orderedProviders.push(provider)
    }
  }

  const visibleProviders = orderedProviders.filter((provider) => {
    const hasApiKey = provider.apiKeyField ? getApiKey(provider).trim().length > 0 : true
    const enabled = isProviderEnabled(provider)
    return providerMatchesCatalogFilter(provider, filter, hasApiKey, enabled)
  })

  if (visibleProviders.length === 0) {
    return (
      <div className="provider-catalog-empty" role="status">
        No providers match this filter.
      </div>
    )
  }

  return (
    <div className="provider-catalog" aria-label="Model providers">
      <div className="provider-catalog-group__grid">
        {visibleProviders.map((provider) => (
          <ProviderCatalogRow
            key={provider.key}
            provider={provider}
            enabled={isProviderEnabled(provider)}
            hasApiKey={provider.apiKeyField ? getApiKey(provider).trim().length > 0 : true}
            models={modelMap[provider.key] || []}
            onOpen={() => onCardClick(provider)}
            onToggle={(checked) => setProviderEnabled(provider.key, checked)}
          />
        ))}
      </div>
    </div>
  )
}

function ProviderCatalogRow({
  provider,
  enabled,
  hasApiKey,
  models,
  onOpen,
  onToggle,
}: {
  provider: ProviderHubDefinition
  enabled: boolean
  hasApiKey: boolean
  models: ModelBasic[]
  onOpen: () => void
  onToggle: (checked: boolean) => void
}): React.ReactElement {
  const modelCount = models.length
  const enabledModelCount = models.filter((model) => model.enabled !== false).length
  const setupState = getProviderSetupState(provider, hasApiKey, enabled)
  const statusLine = formatProviderStatusLine(
    provider,
    hasApiKey,
    enabled,
    enabledModelCount,
    modelCount
  )
  const dashboardUrl = getProviderDashboardUrl(provider.key)
  const logoActive = setupState === 'ready'

  return (
    <div
      className={`provider-catalog-row provider-catalog-row--${setupState}`}
      data-provider={provider.key}
    >
      <button
        type="button"
        className="provider-catalog-row__main"
        onClick={onOpen}
        aria-label={`Configure ${provider.name}`}
      >
        <span
          className={`provider-catalog-row__logo ${
            logoActive ? 'provider-catalog-row__logo--enabled' : ''
          }`}
        >
          <ProviderLogo provider={provider.key} size={22} />
        </span>
        <span className="provider-catalog-row__content">
          <span className="provider-catalog-row__title">{provider.name}</span>
          <span
            className={`provider-catalog-row__status provider-catalog-row__status--${setupState}`}
          >
            {setupState === 'ready' && (
              <span className="provider-catalog-row__status-dot" aria-hidden="true" />
            )}
            {statusLine}
          </span>
        </span>
      </button>

      <div className="provider-catalog-row__actions">
        <Switch
          className="provider-hub-toggle provider-catalog-row__toggle"
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={`Toggle ${provider.name}`}
          onClick={(event) => event.stopPropagation()}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="provider-catalog-row__menu"
              aria-label={`More actions for ${provider.name}`}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreVertical size={15} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="settings-menu-surface zura-menu-surface--compact"
          >
            <DropdownMenuItem className="zura-menu-item--compact" onClick={onOpen}>
              Configure
            </DropdownMenuItem>
            {dashboardUrl ? (
              <DropdownMenuItem
                className="zura-menu-item--compact"
                onClick={() => window.shell?.openExternal(dashboardUrl)}
              >
                Open dashboard
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              className="zura-menu-item--compact"
              onClick={() => onToggle(!enabled)}
            >
              {enabled ? 'Disable provider' : 'Enable provider'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function ModelGroup({
  title,
  models,
  selectedProvider,
  onToggleModel,
  reasoningEnabledFor,
  onToggleReasoning,
  onDetectOpenRouterReasoning,
  detectingOpenRouterReasoningCode,
  onEditModel,
  onDeleteModel,
}: {
  title?: string
  models: ModelBasic[]
  selectedProvider: ProviderKey
  onToggleModel: (code: string, checked: boolean) => void
  reasoningEnabledFor?: (code: string) => boolean
  onToggleReasoning?: (code: string, checked: boolean) => void
  onDetectOpenRouterReasoning?: (code: string) => void
  detectingOpenRouterReasoningCode?: string | null
  onEditModel: (model: ModelBasic) => void
  onDeleteModel: (model: ModelBasic) => void
}): React.ReactElement {
  if (models.length === 0) {
    return <div className="px-4 py-3 text-sm text-muted-foreground">No models in this section.</div>
  }

  return (
    <div>
      {title && (
        <div className="px-4 py-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </div>
      )}
      {models.map((model) => {
        const enabled = model.enabled !== false
        const handleToggle = () => onToggleModel(model.code, !enabled)
        const showReasoning = Boolean(reasoningEnabledFor && onToggleReasoning)
        const reasoningEnabled = showReasoning ? reasoningEnabledFor!(model.code) : false
        const configuredModel = model as ConfiguredModel
        const canDetectOpenRouterReasoning = Boolean(
          onDetectOpenRouterReasoning && !configuredModel.openRouterReasoningDetected
        )
        const showOpenRouterReasoningDetected = Boolean(
          onDetectOpenRouterReasoning &&
          configuredModel.openRouterReasoningDetected &&
          configuredModel.supportsDeepThinking
        )
        const showOpenRouterNoReasoning = Boolean(
          onDetectOpenRouterReasoning &&
          configuredModel.openRouterReasoningDetected &&
          !configuredModel.supportsDeepThinking
        )
        const isDetectingReasoning = detectingOpenRouterReasoningCode === model.code
        return (
          <motion.div
            key={`${selectedProvider}-${model.code}`}
            layout
            initial={{ opacity: 1 }}
            transition={{ layout: { duration: 0.25, ease: 'easeInOut' } }}
            className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 first:border-t-0"
          >
            <button
              type="button"
              onClick={handleToggle}
              className="min-w-0 flex-1 text-left cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 -m-1 p-1"
              aria-label={`${enabled ? 'Disable' : 'Enable'} ${model.displayName}`}
            >
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <div className="truncate text-sm font-medium text-foreground">
                  {model.displayName}
                </div>
              </div>
              <div className="mt-1 inline-flex rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                {model.code}
              </div>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              {showReasoning && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  role="presentation"
                  className="mr-1 flex items-center gap-1.5"
                >
                  <span className="text-xs text-muted-foreground">Reasoning</span>
                  <Switch
                    className="provider-hub-toggle"
                    checked={reasoningEnabled}
                    onCheckedChange={(checked) => onToggleReasoning!(model.code, checked)}
                    aria-label={`Toggle reasoning for ${model.displayName}`}
                  />
                </div>
              )}
              {canDetectOpenRouterReasoning && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mr-1 h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                  disabled={isDetectingReasoning}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDetectOpenRouterReasoning!(model.code)
                  }}
                >
                  {isDetectingReasoning ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <CircleHelp size={12} />
                  )}
                  Detect reasoning
                </Button>
              )}
              {showOpenRouterReasoningDetected && (
                <span className="mr-1 rounded bg-secondary px-2 py-1 text-xs text-muted-foreground">
                  Reasoning detected
                </span>
              )}
              {showOpenRouterNoReasoning && (
                <span className="mr-1 rounded bg-secondary px-2 py-1 text-xs text-muted-foreground">
                  No reasoning
                </span>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  onEditModel(model)
                }}
                aria-label={`Edit ${model.displayName}`}
              >
                <Edit2 size={14} />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`More actions for ${model.displayName}`}
                  >
                    <MoreVertical size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="settings-menu-surface zura-menu-surface--compact"
                >
                  <DropdownMenuItem
                    className="zura-menu-item--compact"
                    onSelect={(e) => {
                      e.preventDefault()
                      onEditModel(model)
                    }}
                  >
                    <Edit2 size={14} />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="zura-menu-item--compact"
                    onSelect={(e) => {
                      e.preventDefault()
                      onDeleteModel(model)
                    }}
                    variant="destructive"
                  >
                    <Trash2 size={14} />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div onClick={(e) => e.stopPropagation()} role="presentation">
                <Switch
                  className="provider-hub-toggle"
                  checked={enabled}
                  onCheckedChange={(checked) => onToggleModel(model.code, checked)}
                  aria-label={`Toggle ${model.displayName}`}
                />
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

export default ProviderHubSection
