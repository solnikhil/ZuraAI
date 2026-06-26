import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  CircleHelp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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
  Terminal,
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
import { ProviderLogo, SkillLogo } from '@/components/shared'
import { WithTooltip } from '@/components/ui/WithTooltip'
import type {
  ConfiguredModel,
  TavilySearchDepthPreference,
  DeepSeekReasoningEffort,
} from '@/contexts/SettingsConfigContext'
import { getDeepseekReasoning, setDeepseekReasoningEnabled } from '@/utils/deepseekReasoning'
import { isSecureApiKeyPlaceholder, resolveApiKeyFromSecureStorage } from '@/utils/secureApiKeys'
import {
  fetchOpenRouterModels,
  mapOpenRouterModelToConfiguredModel,
} from '@/services/openrouterModels'
import { CreateCustomModelDialog } from './CreateCustomModelDialog'
import { AlibabaModelSearchDialog } from './AlibabaModelSearchDialog'
import { DeepseekModelSearchDialog } from './DeepseekModelSearchDialog'
import { OpencodeModelSearchDialog } from './OpencodeModelSearchDialog'
import { FireworksModelSearchDialog } from './FireworksModelSearchDialog'
import { NvidiaModelSearchDialog } from './NvidiaModelSearchDialog'
import { OpenRouterModelSearchDialog } from './OpenRouterModelSearchDialog'
import { PerplexityModelSearchDialog } from './PerplexityModelSearchDialog'
import {
  DEFAULT_OLLAMA_URL,
  getProviderEndpoint,
  getProviderDashboardUrl,
  getProviderEnabledDefaults,
  getProviderModelListField,
  getSettingsVisibleProviders,
  type ProviderId,
  type ProviderModelListKey,
  type ProviderSecretField,
} from '../../../providers'

type ManageMode = 'providers' | 'search-apis'
type ProviderView = 'catalog' | 'detail'
type ProviderKey = ProviderId
type ConnectivityStatus = 'idle' | 'checking' | 'success' | 'error'
type ProviderEnabledMap = Partial<Record<ProviderKey, boolean>>

interface ProviderDefinition {
  key: ProviderKey
  name: string
  description: string
  apiKeyField?: ProviderSecretField
}
const PROVIDERS: ProviderDefinition[] = getSettingsVisibleProviders().map((provider) => ({
  key: provider.id,
  name: provider.label,
  description: provider.description,
  apiKeyField: provider.secretKeyField,
}))

type ProviderCatalogFilter = 'all' | 'needs-setup' | 'disabled' | 'active'

type ProviderCatalogGroup = {
  title: string
  keys: ProviderKey[]
  featured?: boolean
}

const PROVIDER_CATALOG_GROUPS: ProviderCatalogGroup[] = [
  { title: 'Gateways', keys: ['openrouter'], featured: true },
  {
    title: 'Cloud APIs',
    keys: ['groq', 'alibaba', 'deepseek', 'opencode', 'perplexity', 'fireworks', 'nvidia'],
  },
  { title: 'Local', keys: ['ollama'], featured: true },
]

type ProviderSetupState = 'needs-setup' | 'ready' | 'disabled'

function providerNeedsApiKey(provider: ProviderDefinition, hasApiKey: boolean): boolean {
  return Boolean(provider.apiKeyField && !hasApiKey)
}

function getProviderSetupState(
  provider: ProviderDefinition,
  hasApiKey: boolean,
  enabled: boolean
): ProviderSetupState {
  if (providerNeedsApiKey(provider, hasApiKey)) return 'needs-setup'
  if (!enabled) return 'disabled'
  return 'ready'
}

function formatProviderStatusLine(
  provider: ProviderDefinition,
  hasApiKey: boolean,
  enabled: boolean,
  enabledModelCount: number,
  modelCount: number
): string {
  if (providerNeedsApiKey(provider, hasApiKey)) return 'API key required'
  if (!provider.apiKeyField) {
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
  provider: ProviderDefinition,
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

const PROVIDER_ENDPOINTS: Record<ProviderKey, string> = {
  alibaba: getProviderEndpoint('alibaba', 'baseUrl') || '',
  deepseek: getProviderEndpoint('deepseek', 'baseUrl') || '',
  opencode: getProviderEndpoint('opencode', 'baseUrl') || '',
  fireworks: getProviderEndpoint('fireworks', 'baseUrl') || '',
  groq: getProviderEndpoint('groq', 'baseUrl') || '',
  nvidia: getProviderEndpoint('nvidia', 'baseUrl') || '',
  ollama: getProviderEndpoint('ollama', 'baseUrl') || DEFAULT_OLLAMA_URL,
  openrouter: getProviderEndpoint('openrouter', 'baseUrl') || '',
  perplexity: getProviderEndpoint('perplexity', 'baseUrl') || '',
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

type SearchApiKey = 'tavily' | 'onlinecompiler'

interface SearchApiDefinition {
  key: SearchApiKey
  name: string
  description: string
  shortDescription?: string
  icon: React.ReactNode
  color?: string
  learnMoreUrl?: string
  apiKeyField?: 'tavilyApiKey' | 'onlineCompilerApiKey'
}

const SEARCH_APIS: SearchApiDefinition[] = [
  {
    key: 'tavily',
    name: 'Tavily',
    description:
      'AI-optimized search API for the web_search tool. Best quality results with optional images.',
    shortDescription: 'AI-optimized search for web_search. Add a key for best results.',
    icon: <SkillLogo skill="tavily" size={18} />,
    color: '#4dabf7',
    learnMoreUrl: 'https://tavily.com',
    apiKeyField: 'tavilyApiKey',
  },
  {
    key: 'onlinecompiler',
    name: 'Code Execution API',
    description: 'Free code execution sandbox for the code_execution tool (1M requests/month).',
    shortDescription: 'Run code_execution with OnlineCompiler. Add a key for best results.',
    icon: <Terminal size={16} />,
    color: '#a78bfa',
    learnMoreUrl: 'https://onlinecompiler.io',
    apiKeyField: 'onlineCompilerApiKey',
  },
]

interface ModelBasic {
  code: string
  displayName: string
  enabled?: boolean
}

export interface ProviderHubSectionProps {
  alibabaApiKey: string
  deepseekApiKey: string
  opencodeGoApiKey: string
  fireworksApiKey: string
  nvidiaApiKey: string
  groqApiKey: string
  openRouterApiKey: string
  perplexityApiKey: string
  tavilyApiKey: string
  onlineCompilerApiKey: string
  tavilySearchDepthPreference: TavilySearchDepthPreference
  webSearchIncludeImages: boolean
  ollamaUrl: string
  aiModel: string
  modelProvider: ProviderKey
  providerEnabled?: ProviderEnabledMap
  configuredModels: ConfiguredModel[]
  alibabaModels: ModelBasic[]
  deepseekModels: ModelBasic[]
  opencodeModels: ModelBasic[]
  fireworksModels: ModelBasic[]
  nvidiaModels: ModelBasic[]
  groqModels: ModelBasic[]
  ollamaModels: ModelBasic[]
  perplexityModels: ModelBasic[]
  maxTokens: number
  deepseekReasoning?: Record<string, { enabled: boolean; effort: DeepSeekReasoningEffort }>
  deepseekLastEffort?: DeepSeekReasoningEffort
  initialProvider?: ProviderKey
  initialManageMode?: ManageMode
  onParamsConsumed?: () => void
  onChange: (
    changes: Partial<{
      alibabaApiKey: string
      deepseekApiKey: string
      opencodeGoApiKey: string
      fireworksApiKey: string
      nvidiaApiKey: string
      groqApiKey: string
      openRouterApiKey: string

      perplexityApiKey: string
      tavilyApiKey: string
      onlineCompilerApiKey: string
      tavilySearchDepthPreference: TavilySearchDepthPreference
      webSearchIncludeImages: boolean
      ollamaUrl: string
      configuredModels: ConfiguredModel[]
      alibabaModels: ConfiguredModel[]
      deepseekModels: ConfiguredModel[]
      opencodeModels: ConfiguredModel[]
      fireworksModels: ConfiguredModel[]
      nvidiaModels: ConfiguredModel[]
      groqModels: ConfiguredModel[]
      ollamaModels: ConfiguredModel[]
      perplexityModels: ConfiguredModel[]
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
    | 'perplexityModels'
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
  perplexityApiKey,
  groqApiKey,
  alibabaApiKey,
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
  perplexityModels,
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

  const [manageMode, setManageMode] = useState<ManageMode>(initialManageMode ?? 'providers')
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
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [alibabaSearchDialogOpen, setAlibabaSearchDialogOpen] = useState(false)
  const [deepseekSearchDialogOpen, setDeepseekSearchDialogOpen] = useState(false)
  const [opencodeSearchDialogOpen, setOpencodeSearchDialogOpen] = useState(false)
  const [fireworksSearchDialogOpen, setFireworksSearchDialogOpen] = useState(false)
  const [nvidiaSearchDialogOpen, setNvidiaSearchDialogOpen] = useState(false)
  const [perplexitySearchDialogOpen, setPerplexitySearchDialogOpen] = useState(false)
  const [modelToEdit, setModelToEdit] = useState<{
    provider: ProviderKey
    model: ConfiguredModel
  } | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [modelToDelete, setModelToDelete] = useState<{
    provider: ProviderKey
    modelCode: string
    displayName: string
  } | null>(null)
  const [clearModelsConfirmOpen, setClearModelsConfirmOpen] = useState(false)
  const [openRouterSearchDialogOpen, setOpenRouterSearchDialogOpen] = useState(false)
  const [detectingReasoningModel, setDetectingReasoningModel] = useState<string | null>(null)
  const [connectivityModel, setConnectivityModel] = useState('')
  const [modelListFilter, setModelListFilter] = useState<'all' | 'chat'>('all')
  const [providerProxyUrls, setProviderProxyUrls] =
    useState<Record<ProviderKey, string>>(PROVIDER_ENDPOINTS)
  const [connectivityStatus, setConnectivityStatus] = useState<ConnectivityStatus>('idle')
  const [connectivityMessage, setConnectivityMessage] = useState(
    'Select a model, then test your connection.'
  )
  const [connectivityMeta, setConnectivityMeta] = useState<{
    latencyMs: number
    checkedAt: string
  } | null>(null)
  const [connectivityDetails, setConnectivityDetails] = useState('')
  const [showConnectivityDetails, setShowConnectivityDetails] = useState(false)
  const apiKeyOrEndpointInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (manageMode !== 'providers') {
      setProviderView('catalog')
      if (manageMode === 'search-apis') {
        setSearchApiView('catalog')
      }
    }
  }, [manageMode])

  useEffect(() => {
    if (initialProvider != null || initialManageMode != null) {
      if (initialProvider != null) {
        setSelectedProvider(normalizeVisibleProvider(initialProvider))
        setProviderView('detail')
      }
      if (initialManageMode != null) {
        setManageMode(initialManageMode)
      }
      onParamsConsumed?.()
    }
  }, [initialProvider, initialManageMode, onParamsConsumed])

  const providerModelMap: Record<ProviderKey, ModelBasic[]> = {
    openrouter: configuredModels,
    perplexity: perplexityModels,
    groq: groqModels,
    alibaba: alibabaModels,
    deepseek: deepseekModels,
    opencode: opencodeModels,
    fireworks: fireworksModels,
    nvidia: nvidiaModels,
    ollama: ollamaModels,
  }

  const buildModelUpdateForProvider = (
    provider: ProviderKey,
    models: ConfiguredModel[]
  ): ProviderSettingsUpdate => {
    const modelListField = getProviderModelListField(provider) as ProviderModelListKey
    return {
      [modelListField]: models,
    }
  }

  const resetConnectivityState = (message: string) => {
    setConnectivityStatus('idle')
    setConnectivityMeta(null)
    setConnectivityDetails('')
    setShowConnectivityDetails(false)
    setConnectivityMessage(message)
  }

  const setConnectivityErrorState = (message: string, details: string) => {
    setConnectivityStatus('error')
    setConnectivityMeta(null)
    setConnectivityDetails(details)
    setShowConnectivityDetails(false)
    setConnectivityMessage(message)
  }

  const runBearerGetConnectivityCheck = async (
    endpointUrl: string,
    apiKey: string,
    failurePrefix: string,
    signal: AbortSignal
  ) => {
    const response = await fetch(endpointUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    })

    if (!response.ok) {
      throw new Error(`${failurePrefix} (${response.status}).`)
    }
  }

  const runChatCompletionsConnectivityCheck = async (
    endpoint: string,
    apiKey: string,
    modelCode: string,
    failurePrefix: string,
    signal: AbortSignal
  ) => {
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelCode,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      signal,
    })

    if (!response.ok && response.status !== 400) {
      throw new Error(`${failurePrefix} (${response.status}).`)
    }
  }

  const selectedProviderDef =
    PROVIDERS.find((provider) => provider.key === selectedProvider) ?? PROVIDERS[0]

  useEffect(() => {
    setShowApiKey(false)
    setDisplayedApiKey('')

    const apiKeyField = selectedProviderDef.apiKeyField
    if (!apiKeyField) return

    const currentValue = getProviderApiKey(selectedProviderDef)
    if (isSecureApiKeyPlaceholder(currentValue)) {
      let cancelled = false
      resolveApiKeyFromSecureStorage(apiKeyField, currentValue)
        .then((realKey) => {
          if (!cancelled) setDisplayedApiKey(realKey)
        })
        .catch(() => {
          if (!cancelled) setDisplayedApiKey('')
        })
      return () => {
        cancelled = true
      }
    } else {
      setDisplayedApiKey(currentValue)
    }
  }, [selectedProviderDef.key, selectedProviderDef.apiKeyField])

  const providerModels = providerModelMap[selectedProviderDef.key] || []
  const providerDashboardUrl = getProviderDashboardUrl(selectedProviderDef.key)

  useEffect(() => {
    if (providerModels.length === 0) {
      setConnectivityModel('')
      return
    }
    if (!providerModels.some((model) => model.code === connectivityModel)) {
      setConnectivityModel(providerModels[0].code)
    }
  }, [providerModels, connectivityModel])

  useEffect(() => {
    setModelListFilter('all')
    resetConnectivityState('Select a model, then test your connection.')
  }, [selectedProviderDef.key])

  const visibleProviderModels = useMemo(() => {
    const normalized = providerModelQuery.trim().toLowerCase()
    if (!normalized) return providerModels
    return providerModels.filter((model) => {
      return (
        model.displayName.toLowerCase().includes(normalized) ||
        model.code.toLowerCase().includes(normalized)
      )
    })
  }, [providerModels, providerModelQuery])

  const visibleChatModels = useMemo(() => {
    return visibleProviderModels.filter((model) => {
      const haystack = `${model.code} ${model.displayName}`.toLowerCase()
      return !/(image|vision|video|embed|embedding|audio|tts|asr)/.test(haystack)
    })
  }, [visibleProviderModels])

  const modelsForList = modelListFilter === 'chat' ? visibleChatModels : visibleProviderModels

  const enabledModels = modelsForList.filter((model) => model.enabled !== false)
  const disabledModels = modelsForList.filter((model) => model.enabled === false)

  const getProviderApiKey = (provider: ProviderDefinition): string => {
    if (!provider.apiKeyField) return ''
    const providerApiKeys: Record<ProviderSecretField, string> = {
      alibabaApiKey: alibabaApiKey ?? '',
      deepseekApiKey: deepseekApiKey ?? '',
      opencodeGoApiKey: opencodeGoApiKey ?? '',
      fireworksApiKey: fireworksApiKey ?? '',
      nvidiaApiKey: nvidiaApiKey ?? '',
      groqApiKey: groqApiKey ?? '',
      openRouterApiKey: openRouterApiKey ?? '',
      perplexityApiKey: perplexityApiKey ?? '',
    }
    return providerApiKeys[provider.apiKeyField] ?? ''
  }

  const normalizedProviderEnabled = useMemo<Record<ProviderKey, boolean>>(() => {
    return {
      openrouter: providerEnabled?.openrouter !== false,
      perplexity: providerEnabled?.perplexity !== false,
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
    providerEnabled?.perplexity,
    providerEnabled?.groq,
    providerEnabled?.ollama,
    providerEnabled?.alibaba,
    providerEnabled?.deepseek,
    providerEnabled?.opencode,
    providerEnabled?.fireworks,
    providerEnabled?.nvidia,
  ])

  const isProviderEnabled = (provider: ProviderDefinition): boolean =>
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
    perplexityApiKey,
    normalizedProviderEnabled,
  ])

  const setProviderApiKey = (provider: ProviderDefinition, value: string) => {
    if (!provider.apiKeyField) return
    onChange({ [provider.apiKeyField]: value })
  }

  const resolveProviderApiKey = async (provider: ProviderDefinition): Promise<string> => {
    if (!provider.apiKeyField) return ''
    return resolveApiKeyFromSecureStorage(provider.apiKeyField, getProviderApiKey(provider))
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
    onChange(buildModelUpdateForProvider(provider, models))
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

    const updates: ProviderSettingsUpdate = buildModelUpdateForProvider(provider, updatedModels)

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
      const resolvedApiKey = await resolveProviderApiKey(openRouterProvider)
      const catalogModels = await fetchOpenRouterModels(resolvedApiKey)
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

    onChange(buildModelUpdateForProvider(provider, updatedModels))
  }

  const removeModel = (provider: ProviderKey, modelCode: string) => {
    const currentModels = providerModelMap[provider] as ConfiguredModel[]
    const updatedModels = currentModels.filter((model) => model.code !== modelCode)

    const updates: ProviderSettingsUpdate = buildModelUpdateForProvider(provider, updatedModels)

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
    setModelToEdit({ provider: selectedProviderDef.key, model: model as ConfiguredModel })
    setEditDialogOpen(true)
  }

  const handleDeleteModelClick = (model: ModelBasic) => {
    setModelToDelete({
      provider: selectedProviderDef.key,
      modelCode: model.code,
      displayName: model.displayName || model.code,
    })
    setDeleteConfirmOpen(true)
  }

  const handleDeleteConfirm = () => {
    if (modelToDelete) {
      removeModel(modelToDelete.provider, modelToDelete.modelCode)
      setModelToDelete(null)
    }
    setDeleteConfirmOpen(false)
  }

  const clearModelsForProvider = (provider: ProviderKey) => {
    onChange(buildModelUpdateForProvider(provider, []))
  }

  const openCatalogDialogForProvider = (provider: ProviderKey) => {
    if (provider === 'openrouter') {
      setOpenRouterSearchDialogOpen(true)
      return
    }
    if (provider === 'fireworks') {
      setFireworksSearchDialogOpen(true)
      return
    }
    if (provider === 'perplexity') {
      setPerplexitySearchDialogOpen(true)
      return
    }
    if (provider === 'alibaba') {
      setAlibabaSearchDialogOpen(true)
      return
    }
    if (provider === 'deepseek') {
      setDeepseekSearchDialogOpen(true)
      return
    }
    if (provider === 'opencode') {
      setOpencodeSearchDialogOpen(true)
      return
    }
    if (provider === 'nvidia') {
      setNvidiaSearchDialogOpen(true)
    }
  }

  const handleClearModelsConfirm = () => {
    clearModelsForProvider(selectedProviderDef.key)
    setClearModelsConfirmOpen(false)
  }

  const runConnectivityCheck = async () => {
    const selectedKey = (await resolveProviderApiKey(selectedProviderDef)).trim()
    const endpoint =
      providerProxyUrls[selectedProviderDef.key] || PROVIDER_ENDPOINTS[selectedProviderDef.key]

    if (selectedProviderDef.key !== 'ollama' && !selectedKey) {
      setConnectivityErrorState(
        `${selectedProviderDef.name} API key is incorrect or empty. Add a valid key and try again.`,
        `Provider: ${selectedProviderDef.name}\nModel: ${connectivityModel || 'none'}\nEndpoint: ${endpoint}`
      )
      return
    }

    if (!connectivityModel) {
      setConnectivityErrorState(
        'Select a model for this provider before checking.',
        `Provider: ${selectedProviderDef.name}\nEndpoint: ${endpoint}`
      )
      return
    }

    setConnectivityStatus('checking')
    setConnectivityMeta(null)
    setConnectivityDetails('')
    setShowConnectivityDetails(false)
    setConnectivityMessage('Checking provider connectivity...')

    const startedAt = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 9000)

    try {
      if (selectedProviderDef.key === 'openrouter') {
        await runBearerGetConnectivityCheck(
          `${endpoint}/auth/key`,
          selectedKey,
          'OpenRouter auth failed',
          controller.signal
        )
      } else if (selectedProviderDef.key === 'groq') {
        await runBearerGetConnectivityCheck(
          `${endpoint}/models`,
          selectedKey,
          'Groq check failed',
          controller.signal
        )
      } else if (selectedProviderDef.key === 'perplexity') {
        await runChatCompletionsConnectivityCheck(
          endpoint,
          selectedKey,
          connectivityModel,
          'Perplexity check failed',
          controller.signal
        )
      } else if (selectedProviderDef.key === 'alibaba') {
        await runChatCompletionsConnectivityCheck(
          endpoint,
          selectedKey,
          connectivityModel,
          'Alibaba Cloud check failed',
          controller.signal
        )
      } else if (selectedProviderDef.key === 'fireworks') {
        await runChatCompletionsConnectivityCheck(
          endpoint,
          selectedKey,
          connectivityModel,
          'Fireworks check failed',
          controller.signal
        )
      } else if (selectedProviderDef.key === 'deepseek') {
        await runChatCompletionsConnectivityCheck(
          endpoint,
          selectedKey,
          connectivityModel,
          'DeepSeek check failed',
          controller.signal
        )
      } else if (selectedProviderDef.key === 'opencode') {
        await runChatCompletionsConnectivityCheck(
          endpoint,
          selectedKey,
          connectivityModel,
          'OpenCode Go check failed',
          controller.signal
        )
      } else if (selectedProviderDef.key === 'nvidia') {
        await runChatCompletionsConnectivityCheck(
          endpoint,
          selectedKey,
          connectivityModel,
          'NVIDIA NIM check failed',
          controller.signal
        )
      } else {
        throw new Error(
          `Connectivity check is not supported for provider: ${selectedProviderDef.key}`
        )
      }

      const latencyMs = Math.max(1, Date.now() - startedAt)
      setConnectivityStatus('success')
      setConnectivityMeta({ latencyMs, checkedAt: new Date().toLocaleTimeString() })
      setConnectivityMessage('Connection successful. API key and model are reachable.')
      setConnectivityDetails(
        `Provider: ${selectedProviderDef.name}\nModel: ${connectivityModel}\nEndpoint: ${endpoint}\nStatus: 200 OK`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connectivity check failed.'
      setConnectivityStatus('error')
      setConnectivityMeta(null)
      setConnectivityMessage(
        `${selectedProviderDef.name} API key appears invalid or endpoint is unreachable.`
      )
      setConnectivityDetails(
        `Provider: ${selectedProviderDef.name}\nModel: ${connectivityModel}\nEndpoint: ${endpoint}\nError: ${message}`
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  return (
    <div className="settings-section-layout settings-section-layout--wide min-w-0">
      <div className="page-header flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="page-title">Providers</h2>
          <div className="page-subtitle">
            Manage model providers, API keys, and search APIs in one place.
          </div>
        </div>
        <div className="provider-hub-mode-switch flex rounded-md border border-border p-1">
          <button
            type="button"
            onClick={() => setManageMode('providers')}
            className={`provider-hub-mode-switch__item rounded px-3 py-1.5 text-xs font-medium transition ${
              manageMode === 'providers' ? 'is-active' : ''
            }`}
            style={{
              background:
                manageMode === 'providers' ? 'var(--theme-surface-active)' : 'transparent',
              color: 'var(--theme-text-primary)',
            }}
          >
            Model Providers
          </button>
          <button
            type="button"
            onClick={() => setManageMode('search-apis')}
            className={`provider-hub-mode-switch__item rounded px-3 py-1.5 text-xs font-medium transition ${
              manageMode === 'search-apis' ? 'is-active' : ''
            }`}
            style={{
              background:
                manageMode === 'search-apis' ? 'var(--theme-surface-active)' : 'transparent',
              color: 'var(--theme-text-primary)',
            }}
          >
            Service APIs
          </button>
        </div>
      </div>

      {manageMode === 'providers' && providerView === 'catalog' && (
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
          </Card>
        </div>
      )}

      {manageMode === 'providers' && providerView === 'detail' && (
        <Card
          className="settings-section-card provider-hub-base-card mt-4"
          style={{ background: CATALOG_BASE_BACKGROUND }}
        >
          <div className="space-y-6">
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
                  <DetailField
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
                            resetConnectivityState(
                              'API key changed. Run connectivity check to verify.'
                            )
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

                  <DetailField
                    label="API Proxy URL"
                    description="Must include http(s)://"
                    control={
                      <Input
                        value={providerProxyUrls[selectedProviderDef.key]}
                        onChange={(e) => {
                          setProviderProxyUrls((previous) => ({
                            ...previous,
                            [selectedProviderDef.key]: e.target.value,
                          }))
                          resetConnectivityState('Proxy URL changed. Run connectivity check again.')
                        }}
                        className="border-border bg-secondary"
                        placeholder="https://api.example.com/v1"
                      />
                    }
                  />

                  <DetailField
                    label="Connectivity Check"
                    description="Test if API key and proxy URL are correctly configured"
                    control={
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Select
                            value={connectivityModel}
                            onValueChange={(value) => {
                              setConnectivityModel(value)
                              resetConnectivityState(
                                'Model changed. Run check again to verify this model.'
                              )
                            }}
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
                            onClick={runConnectivityCheck}
                            disabled={connectivityStatus === 'checking'}
                          >
                            {connectivityStatus === 'checking' ? (
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
                              connectivityStatus === 'error'
                                ? STATUS_COLORS.error.border
                                : connectivityStatus === 'success'
                                  ? STATUS_COLORS.connectivitySuccess.border
                                  : 'var(--theme-border)',
                            background:
                              connectivityStatus === 'error'
                                ? STATUS_COLORS.error.background
                                : connectivityStatus === 'success'
                                  ? STATUS_COLORS.connectivitySuccess.background
                                  : 'var(--theme-surface-hover)',
                          }}
                        >
                          <div className="px-4 py-3">
                            <span className="inline-flex items-start gap-2 text-sm leading-6 text-foreground">
                              {connectivityStatus === 'checking' && (
                                <Loader2 size={16} className="mt-0.5 animate-spin" />
                              )}
                              {connectivityStatus === 'success' && (
                                <CheckCircle2
                                  size={16}
                                  className="mt-0.5"
                                  style={{ color: STATUS_COLORS.connectivitySuccess.icon }}
                                />
                              )}
                              {connectivityStatus === 'error' && (
                                <AlertCircle
                                  size={16}
                                  className="mt-0.5"
                                  style={{ color: STATUS_COLORS.error.icon }}
                                />
                              )}
                              {connectivityStatus === 'idle' && (
                                <Globe size={16} className="mt-0.5 text-muted-foreground" />
                              )}
                              <span>{connectivityMessage}</span>
                            </span>
                            {connectivityMeta && (
                              <span className="mt-2 block text-xs text-muted-foreground">
                                {`Latency ${connectivityMeta.latencyMs}ms • Checked at ${connectivityMeta.checkedAt}`}
                              </span>
                            )}
                          </div>

                          {connectivityDetails && (
                            <div className="border-t border-dashed border-border/60 px-4 py-2">
                              <button
                                type="button"
                                onClick={() => setShowConnectivityDetails((previous) => !previous)}
                                className="text-xs text-foreground/90 transition hover:text-foreground"
                              >
                                {showConnectivityDetails ? 'Hide Details' : 'Show Details'}
                              </button>
                              {showConnectivityDetails && (
                                <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-muted-foreground">
                                  {connectivityDetails}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    }
                  />
                </div>
              ) : (
                <DetailField
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

              <p className="mt-5 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck size={13} />
                <span>
                  Your key and proxy URL are stored in{' '}
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

              <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_auto_auto]">
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    value={providerModelQuery}
                    onChange={(e) => setProviderModelQuery(e.target.value)}
                    placeholder="Search models..."
                    className="h-8 border-border bg-secondary pl-9"
                  />
                </div>
                {(selectedProviderDef.key === 'openrouter' ||
                  selectedProviderDef.key === 'fireworks' ||
                  selectedProviderDef.key === 'alibaba' ||
                  selectedProviderDef.key === 'deepseek' ||
                  selectedProviderDef.key === 'opencode' ||
                  selectedProviderDef.key === 'nvidia' ||
                  selectedProviderDef.key === 'perplexity') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openCatalogDialogForProvider(selectedProviderDef.key)}
                    className="gap-2"
                  >
                    <Search size={14} />
                    Add from Catalog
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setClearModelsConfirmOpen(true)}
                  disabled={providerModels.length === 0}
                  className="gap-2 text-rose-300 hover:text-rose-200"
                >
                  <Trash2 size={14} />
                  Remove All
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setAddDialogOpen(true)}
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

      {manageMode === 'search-apis' && searchApiView === 'catalog' && (
        <div className="mt-4 min-w-0">
          <Card
            className="settings-section-card provider-hub-base-card min-w-0 overflow-y-auto p-4 sm:p-5"
            style={{ background: CATALOG_BASE_BACKGROUND }}
          >
            <SearchApiSection
              apis={SEARCH_APIS}
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
          </Card>
        </div>
      )}

      {manageMode === 'search-apis' && searchApiView === 'detail' && (
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
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        provider={selectedProviderDef.key}
        providerApiKey={getProviderApiKey(selectedProviderDef)}
        onCreate={(model) => addCustomModel(model, selectedProviderDef.key)}
      />

      <CreateCustomModelDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open)
          if (!open) setModelToEdit(null)
        }}
        provider={modelToEdit?.provider}
        providerApiKey={
          modelToEdit
            ? getProviderApiKey(
                PROVIDERS.find((provider) => provider.key === modelToEdit.provider) ??
                  selectedProviderDef
              )
            : ''
        }
        onCreate={addCustomModel}
        initialModel={modelToEdit?.model}
        onUpdate={(updated) => {
          if (modelToEdit) {
            updateModel(modelToEdit.provider, modelToEdit.model.code, updated)
            setEditDialogOpen(false)
            setModelToEdit(null)
          }
        }}
      />

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="border-border bg-card sm:max-w-[420px]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete Model</DialogTitle>
            <DialogDescription>
              {modelToDelete && (
                <>
                  Remove{' '}
                  <span className="inline-flex rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.9em] text-foreground">
                    &quot;{modelToDelete.displayName}&quot;
                  </span>{' '}
                  from your model list?
                  {modelToDelete.provider === 'ollama' && (
                    <span className="mt-2 block text-muted-foreground">
                      Ollama models will reappear when you refresh the model list.
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={clearModelsConfirmOpen} onOpenChange={setClearModelsConfirmOpen}>
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
            <Button variant="outline" onClick={() => setClearModelsConfirmOpen(false)}>
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
          open={alibabaSearchDialogOpen}
          onOpenChange={setAlibabaSearchDialogOpen}
          onAddModel={(model) => addCustomModel(model, 'alibaba')}
          apiKey={alibabaApiKey}
          existingModelCodes={alibabaModels.map((m) => m.code)}
        />
      )}

      {selectedProviderDef.key === 'openrouter' && (
        <OpenRouterModelSearchDialog
          open={openRouterSearchDialogOpen}
          onOpenChange={setOpenRouterSearchDialogOpen}
          onAddModel={(model) => addCustomModel(model, 'openrouter')}
          apiKey={openRouterApiKey}
          existingModelCodes={configuredModels.map((m) => m.code)}
        />
      )}

      {selectedProviderDef.key === 'fireworks' && (
        <FireworksModelSearchDialog
          open={fireworksSearchDialogOpen}
          onOpenChange={setFireworksSearchDialogOpen}
          onAddModel={(model) => addCustomModel(model, 'fireworks')}
          apiKey={fireworksApiKey}
          existingModelCodes={fireworksModels.map((m) => m.code)}
        />
      )}

      {selectedProviderDef.key === 'perplexity' && (
        <PerplexityModelSearchDialog
          open={perplexitySearchDialogOpen}
          onOpenChange={setPerplexitySearchDialogOpen}
          onAddModel={(model) => addCustomModel(model, 'perplexity')}
          apiKey={perplexityApiKey}
          existingModelCodes={perplexityModels.map((m) => m.code)}
        />
      )}

      {selectedProviderDef.key === 'deepseek' && (
        <DeepseekModelSearchDialog
          open={deepseekSearchDialogOpen}
          onOpenChange={setDeepseekSearchDialogOpen}
          onAddModel={(model) => addCustomModel(model, 'deepseek')}
          apiKey={getProviderApiKey(selectedProviderDef)}
          existingModelCodes={deepseekModels.map((m) => m.code)}
        />
      )}

      {selectedProviderDef.key === 'opencode' && (
        <OpencodeModelSearchDialog
          open={opencodeSearchDialogOpen}
          onOpenChange={setOpencodeSearchDialogOpen}
          onAddModel={(model) => addCustomModel(model, 'opencode')}
          apiKey={getProviderApiKey(selectedProviderDef)}
          existingModelCodes={opencodeModels.map((m) => m.code)}
        />
      )}

      {selectedProviderDef.key === 'nvidia' && (
        <NvidiaModelSearchDialog
          open={nvidiaSearchDialogOpen}
          onOpenChange={setNvidiaSearchDialogOpen}
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

  const summaryParts = [
    `${stats.configured}/${stats.total} configured`,
    `${stats.active} active`,
  ]
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
            onClick={() => onFilterChange(filter === chip.id && chip.id !== 'all' ? 'all' : chip.id)}
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
  providers: ProviderDefinition[]
  filter: ProviderCatalogFilter
  onCardClick: (provider: ProviderDefinition) => void
  isProviderEnabled: (provider: ProviderDefinition) => boolean
  setProviderEnabled: (providerKey: ProviderKey, enabled: boolean) => void
  getApiKey: (provider: ProviderDefinition) => string
  modelMap: Record<ProviderKey, ModelBasic[]>
}): React.ReactElement | null {
  const providerByKey = useMemo(() => {
    return new Map(providers.map((provider) => [provider.key, provider]))
  }, [providers])

  const visibleGroups = PROVIDER_CATALOG_GROUPS.map((group) => ({
    ...group,
    providers: group.keys
      .map((key) => providerByKey.get(key))
      .filter((provider): provider is ProviderDefinition => Boolean(provider))
      .filter((provider) => {
        const hasApiKey = provider.apiKeyField ? getApiKey(provider).trim().length > 0 : true
        const enabled = isProviderEnabled(provider)
        return providerMatchesCatalogFilter(provider, filter, hasApiKey, enabled)
      }),
  })).filter((group) => group.providers.length > 0)

  if (visibleGroups.length === 0) {
    return (
      <div className="provider-catalog-empty" role="status">
        No providers match this filter.
      </div>
    )
  }

  return (
    <div className="provider-catalog" aria-label="Model providers">
      {visibleGroups.map((group) => (
        <section key={group.title} className="provider-catalog-group">
          <div className="provider-catalog-group__header">
            <h3>{group.title}</h3>
          </div>
          <div
            className={`provider-catalog-group__grid ${
              group.featured ? 'provider-catalog-group__grid--featured' : ''
            }`}
          >
            {group.providers.map((provider) => (
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
        </section>
      ))}
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
  provider: ProviderDefinition
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
        aria-label={
          setupState === 'needs-setup' ? `Set up ${provider.name}` : `Configure ${provider.name}`
        }
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
        {setupState === 'needs-setup' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="provider-catalog-row__setup"
            onClick={onOpen}
          >
            Set up
            <ChevronRight size={14} aria-hidden="true" />
          </Button>
        )}

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
          <DropdownMenuContent align="end" className="settings-menu-surface zura-menu-surface--compact">
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

function DetailField({
  label,
  description,
  control,
}: {
  label: string
  description: string
  control: React.ReactNode
}): React.ReactElement {
  return (
    <div className="settings-list-row settings-list-row--field provider-hub-detail-field">
      <div className="settings-list-row__meta">
        <div className="settings-list-row__label">{label}</div>
        <div className="settings-list-row__description">{description}</div>
      </div>
      <div className="settings-list-row__control settings-list-row__control--stretch provider-hub-detail-field__control">
        {control}
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
                <DropdownMenuContent align="end" className="settings-menu-surface zura-menu-surface--compact">
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

function SearchApiSection({
  apis,
  selectedApi,
  tavilyApiKey,
  onlineCompilerApiKey,
  tavilySearchDepthPreference,
  onCardClick,
  onChange,
}: {
  apis: SearchApiDefinition[]
  selectedApi: SearchApiKey
  tavilyApiKey: string
  onlineCompilerApiKey: string
  tavilySearchDepthPreference: TavilySearchDepthPreference
  onCardClick: (api: SearchApiDefinition) => void
  onChange: ProviderHubSectionProps['onChange']
}): React.ReactElement {
  const getDepthSummary = (preference: TavilySearchDepthPreference): string => {
    switch (preference) {
      case 'auto':
        return 'Auto speed'
      case 'ultra-fast':
        return 'Lightning'
      case 'fast':
        return 'Fast'
      case 'basic':
        return 'Standard'
      case 'advanced':
        return 'Thorough'
      default:
        return 'Auto speed'
    }
  }

  const configuredCount = apis.filter((api) => {
    const keyValue =
      api.apiKeyField === 'tavilyApiKey'
        ? tavilyApiKey
        : api.apiKeyField === 'onlineCompilerApiKey'
          ? onlineCompilerApiKey
          : ''
    return Boolean(api.apiKeyField && typeof keyValue === 'string' && keyValue.trim())
  }).length

  return (
    <div className="provider-catalog" aria-label="Service APIs">
      <section className="provider-catalog-group">
        <div className="provider-catalog-group__header">
          <h3>Search APIs</h3>
        </div>
        <p className="provider-catalog-group__summary">
          {configuredCount}/{apis.length} configured
        </p>
        <div className="provider-catalog-group__grid provider-catalog-group__grid--featured">
          {apis.map((api) => {
            const keyValue =
              api.apiKeyField === 'tavilyApiKey'
                ? tavilyApiKey
                : api.apiKeyField === 'onlineCompilerApiKey'
                  ? onlineCompilerApiKey
                  : ''
            const normalizedKeyValue = typeof keyValue === 'string' ? keyValue : ''
            const hasKey = Boolean(api.apiKeyField && normalizedKeyValue.trim())
            const setupState: ProviderSetupState = hasKey ? 'ready' : 'needs-setup'
            const speedSummary =
              api.key === 'tavily'
                ? `Search speed: ${getDepthSummary(tavilySearchDepthPreference)}`
                : null
            const statusLine = hasKey
              ? speedSummary || 'Key set'
              : 'API key required'

            return (
              <div
                key={api.key}
                className={`provider-catalog-row provider-catalog-row--${setupState} ${
                  selectedApi === api.key ? 'provider-catalog-row--selected' : ''
                }`}
              >
                <button
                  type="button"
                  className="provider-catalog-row__main"
                  onClick={() => onCardClick(api)}
                  aria-label={hasKey ? `Configure ${api.name}` : `Set up ${api.name}`}
                >
                  <span
                    className={`provider-catalog-row__logo provider-catalog-row__logo--api ${
                      hasKey ? 'provider-catalog-row__logo--enabled' : ''
                    }`}
                    style={api.color ? { color: api.color } : undefined}
                  >
                    {api.icon}
                  </span>
                  <span className="provider-catalog-row__content">
                    <span className="provider-catalog-row__title-row">
                      <span className="provider-catalog-row__title">{api.name}</span>
                      {api.key === 'tavily' && (
                        <span className="provider-catalog-row__badge">Recommended</span>
                      )}
                    </span>
                    <span
                      className={`provider-catalog-row__status provider-catalog-row__status--${setupState}`}
                    >
                      {hasKey && <span className="provider-catalog-row__status-dot" aria-hidden="true" />}
                      {statusLine}
                    </span>
                  </span>
                </button>

                <div className="provider-catalog-row__actions">
                  {!hasKey && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="provider-catalog-row__setup"
                      onClick={() => onCardClick(api)}
                    >
                      Set up
                      <ChevronRight size={14} aria-hidden="true" />
                    </Button>
                  )}

                  <Switch
                    className="provider-hub-toggle provider-catalog-row__toggle"
                    checked={hasKey}
                    onCheckedChange={(checked) => {
                      if (!checked) {
                        if (api.apiKeyField === 'tavilyApiKey') {
                          onChange({ tavilyApiKey: '' })
                        }
                        if (api.apiKeyField === 'onlineCompilerApiKey') {
                          onChange({ onlineCompilerApiKey: '' })
                        }
                      } else {
                        onCardClick(api)
                      }
                    }}
                    aria-label={`Toggle ${api.name}`}
                    onClick={(event) => event.stopPropagation()}
                  />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="provider-catalog-row__menu"
                        aria-label={`More actions for ${api.name}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <MoreVertical size={15} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="settings-menu-surface zura-menu-surface--compact"
                    >
                      <DropdownMenuItem className="zura-menu-item--compact" onClick={() => onCardClick(api)}>
                        Configure
                      </DropdownMenuItem>
                      {api.learnMoreUrl ? (
                        <DropdownMenuItem
                          className="zura-menu-item--compact"
                          onClick={() => window.shell?.openExternal(api.learnMoreUrl!)}
                        >
                          Learn more
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function SearchApiDetail({
  api,
  tavilyApiKey,
  onlineCompilerApiKey,
  tavilySearchDepthPreference,
  webSearchIncludeImages,
  onBack,
  onChange,
}: {
  api: SearchApiDefinition
  tavilyApiKey: string
  onlineCompilerApiKey: string
  tavilySearchDepthPreference: TavilySearchDepthPreference
  webSearchIncludeImages: boolean
  onBack: () => void
  onChange: ProviderHubSectionProps['onChange']
}): React.ReactElement {
  const [showApiKey, setShowApiKey] = useState(false)
  const [displayedApiKey, setDisplayedApiKey] = useState('')

  const apiKeyValue =
    api.apiKeyField === 'tavilyApiKey'
      ? tavilyApiKey
      : api.apiKeyField === 'onlineCompilerApiKey'
        ? onlineCompilerApiKey
        : ''
  const normalizedApiKeyValue = typeof apiKeyValue === 'string' ? apiKeyValue : ''
  const isEnabled = Boolean(api.apiKeyField && normalizedApiKeyValue.trim())

  useEffect(() => {
    setShowApiKey(false)
    setDisplayedApiKey('')

    if (!api.apiKeyField) return

    if (isSecureApiKeyPlaceholder(normalizedApiKeyValue)) {
      let cancelled = false
      resolveApiKeyFromSecureStorage(api.apiKeyField, normalizedApiKeyValue)
        .then((realKey) => {
          if (!cancelled) setDisplayedApiKey(realKey)
        })
        .catch(() => {
          if (!cancelled) setDisplayedApiKey('')
        })
      return () => {
        cancelled = true
      }
    } else {
      setDisplayedApiKey(normalizedApiKeyValue)
    }
  }, [api.apiKeyField, normalizedApiKeyValue])

  return (
    <Card
      className="settings-section-card provider-hub-base-card mt-4"
      style={{ background: CATALOG_BASE_BACKGROUND }}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label="Back to search APIs"
            >
              <ChevronLeft size={16} />
            </button>
            <span style={api.color ? { color: api.color } : undefined}>{api.icon}</span>
            <span className="text-xl font-semibold leading-none text-foreground sm:text-2xl lg:text-[28px]">
              {api.name}
            </span>
            {api.key === 'tavily' && (
              <span className="rounded bg-[var(--theme-accent)]/20 px-2 py-0.5 text-xs font-medium text-[var(--theme-accent)]">
                Recommended
              </span>
            )}
          </div>
          <Switch
            className="provider-hub-toggle"
            checked={isEnabled}
            onCheckedChange={(checked) => {
              if (!checked) {
                if (api.apiKeyField === 'tavilyApiKey') {
                  onChange({ tavilyApiKey: '' })
                }
                if (api.apiKeyField === 'onlineCompilerApiKey') {
                  onChange({ onlineCompilerApiKey: '' })
                }
              }
            }}
            aria-label={`Enable ${api.name}`}
          />
        </div>

        <div className="border-t border-border pt-6">
          {api.apiKeyField === 'tavilyApiKey' || api.apiKeyField === 'onlineCompilerApiKey' ? (
            <div className="space-y-6">
              <DetailField
                label="API Key"
                description={
                  api.apiKeyField === 'tavilyApiKey'
                    ? 'Without a key, a limited free fallback is used. Add a key for best results. Only API key is required here.'
                    : 'Used for code execution requests. Add your OnlineCompiler key to enable hosted code sandbox calls.'
                }
                control={
                  <div className="relative w-full">
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      value={
                        isSecureApiKeyPlaceholder(normalizedApiKeyValue)
                          ? displayedApiKey
                          : normalizedApiKeyValue
                      }
                      onChange={(e) => {
                        setDisplayedApiKey(e.target.value)
                        if (api.apiKeyField === 'tavilyApiKey') {
                          onChange({ tavilyApiKey: e.target.value })
                        } else if (api.apiKeyField === 'onlineCompilerApiKey') {
                          onChange({ onlineCompilerApiKey: e.target.value })
                        }
                      }}
                      placeholder={
                        api.apiKeyField === 'tavilyApiKey'
                          ? isSecureApiKeyPlaceholder(tavilyApiKey)
                            ? 'Tavily key stored securely. Enter a new key to replace it.'
                            : 'tvly-...'
                          : isSecureApiKeyPlaceholder(onlineCompilerApiKey)
                            ? 'OnlineCompiler key stored securely. Enter a new key to replace it.'
                            : 'Paste your OnlineCompiler API key'
                      }
                      className="border-border bg-secondary pr-10"
                      autoComplete="new-password"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                      aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                }
              />
              {api.apiKeyField === 'tavilyApiKey' && (
                <>
                  <DetailField
                    label="Search Speed"
                    description="Sets the default Tavily search depth when the model does not specify one. Auto lets the app choose per query."
                    control={
                      <Select
                        value={tavilySearchDepthPreference}
                        onValueChange={(value: TavilySearchDepthPreference) =>
                          onChange({ tavilySearchDepthPreference: value })
                        }
                      >
                        <SelectTrigger className="border-border bg-secondary">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="settings-menu-surface">
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="ultra-fast">Lightning</SelectItem>
                          <SelectItem value="fast">Fast</SelectItem>
                          <SelectItem value="basic">Standard</SelectItem>
                          <SelectItem value="advanced">Thorough</SelectItem>
                        </SelectContent>
                      </Select>
                    }
                  />
                  <DetailField
                    label="Result Images"
                    description="Include image results in web_search responses and show the inline image strip in chat."
                    control={
                      <div className="flex justify-end">
                        <Switch
                          checked={webSearchIncludeImages}
                          onCheckedChange={(checked) =>
                            onChange({ webSearchIncludeImages: checked })
                          }
                          aria-label="Include web search images"
                        />
                      </div>
                    }
                  />
                </>
              )}
              {api.learnMoreUrl && (
                <p className="text-sm text-muted-foreground">
                  Learn more:{' '}
                  <a
                    href={api.learnMoreUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--theme-accent)] hover:underline"
                  >
                    {api.learnMoreUrl.replace(/^https?:\/\//, '')}
                  </a>
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

export default ProviderHubSection