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
  Globe,
  Loader2,
  Lock,
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import type {
  ConfiguredModel,
  TavilySearchDepthPreference,
} from '@/contexts/SettingsConfigContext'
import { CreateCustomModelDialog } from './CreateCustomModelDialog'
import { FireworksModelSearchDialog } from './FireworksModelSearchDialog'
import { OpenRouterModelSearchDialog } from './OpenRouterModelSearchDialog'
import {
  DEFAULT_OLLAMA_URL,
  getActiveProviderDefinitions,
  getProviderEndpoint,
  type ProviderId,
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
  apiKeyField?: keyof Pick<
    ProviderHubSectionProps,
    'alibabaApiKey' | 'fireworksApiKey' | 'groqApiKey' | 'openRouterApiKey' | 'perplexityApiKey'
  >
}

const PROVIDERS: ProviderDefinition[] = getActiveProviderDefinitions().map((provider) => ({
  key: provider.id as ProviderKey,
  name: provider.label,
  description: provider.description,
  apiKeyField:
    provider.id === 'openrouter'
      ? 'openRouterApiKey'
      : provider.id === 'groq'
        ? 'groqApiKey'
        : provider.id === 'alibaba'
          ? 'alibabaApiKey'
          : provider.id === 'fireworks'
            ? 'fireworksApiKey'
          : provider.id === 'perplexity'
            ? 'perplexityApiKey'
            : undefined,
}))

const PROVIDER_ENDPOINTS: Record<ProviderKey, string> = {
  alibaba: getProviderEndpoint('alibaba', 'baseUrl') || '',
  fireworks: getProviderEndpoint('fireworks', 'baseUrl') || '',
  groq: getProviderEndpoint('groq', 'baseUrl') || '',
  ollama: getProviderEndpoint('ollama', 'baseUrl') || DEFAULT_OLLAMA_URL,
  openrouter: getProviderEndpoint('openrouter', 'baseUrl') || '',
  perplexity: getProviderEndpoint('perplexity', 'baseUrl') || '',
}

const CATALOG_BASE_BACKGROUND = '#212121'
const CATALOG_CARD_BACKGROUND = '#2c2c2c'
const DEFAULT_PROVIDER_ENABLED: Record<ProviderKey, boolean> = {
  alibaba: true,
  fireworks: true,
  groq: true,
  ollama: true,
  openrouter: true,
  perplexity: true,
}

type SearchApiKey = 'tavily'

interface SearchApiDefinition {
  key: SearchApiKey
  name: string
  description: string
  shortDescription?: string
  icon: React.ReactNode
  color?: string
  learnMoreUrl?: string
  apiKeyField?: 'tavilyApiKey'
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
]

interface ModelBasic {
  code: string
  displayName: string
  enabled?: boolean
}

export interface ProviderHubSectionProps {
  alibabaApiKey: string
  fireworksApiKey: string
  groqApiKey: string
  openRouterApiKey: string
  perplexityApiKey: string
  tavilyApiKey: string
  tavilySearchDepthPreference: TavilySearchDepthPreference
  webSearchIncludeImages: boolean
  ollamaUrl: string
  aiModel: string
  modelProvider: ProviderKey
  providerEnabled?: ProviderEnabledMap
  configuredModels: ConfiguredModel[]
  alibabaModels: ModelBasic[]
  fireworksModels: ModelBasic[]
  groqModels: ModelBasic[]
  ollamaModels: ModelBasic[]
  perplexityModels: ModelBasic[]
  maxTokens: number
  initialProvider?: ProviderKey
  initialManageMode?: ManageMode
  onParamsConsumed?: () => void
  onChange: (
    changes: Partial<{
      alibabaApiKey: string
      fireworksApiKey: string
      groqApiKey: string
      openRouterApiKey: string
      perplexityApiKey: string
      tavilyApiKey: string
      tavilySearchDepthPreference: TavilySearchDepthPreference
      webSearchIncludeImages: boolean
      ollamaUrl: string
      configuredModels: ConfiguredModel[]
      alibabaModels: ConfiguredModel[]
      fireworksModels: ConfiguredModel[]
      groqModels: ConfiguredModel[]
      ollamaModels: ConfiguredModel[]
      perplexityModels: ConfiguredModel[]
      maxTokens: number
      aiModel: string
      modelProvider: ProviderKey
      providerEnabled: ProviderEnabledMap
    }>
  ) => void
}

export function ProviderHubSection({
  openRouterApiKey,
  perplexityApiKey,
  groqApiKey,
  alibabaApiKey,
  fireworksApiKey,
  tavilyApiKey,
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
  fireworksModels,
  ollamaModels,
  initialProvider,
  initialManageMode,
  onParamsConsumed,
  onChange,
}: ProviderHubSectionProps): React.ReactElement {
  const normalizeVisibleProvider = (provider?: ProviderKey): ProviderKey =>
    provider || 'openrouter'

  const [manageMode, setManageMode] = useState<ManageMode>(initialManageMode ?? 'providers')
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
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [fireworksSearchDialogOpen, setFireworksSearchDialogOpen] = useState(false)
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
  const [openRouterSearchDialogOpen, setOpenRouterSearchDialogOpen] = useState(false)
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
    fireworks: fireworksModels,
    ollama: ollamaModels,
  }

  const selectedProviderDef =
    PROVIDERS.find((provider) => provider.key === selectedProvider) ?? PROVIDERS[0]
  const providerModels = providerModelMap[selectedProviderDef.key] || []

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
    setConnectivityStatus('idle')
    setConnectivityMeta(null)
    setConnectivityMessage('Select a model, then test your connection.')
    setConnectivityDetails('')
    setShowConnectivityDetails(false)
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
    if (provider.apiKeyField === 'openRouterApiKey') return openRouterApiKey ?? ''
    if (provider.apiKeyField === 'perplexityApiKey') return perplexityApiKey ?? ''
    if (provider.apiKeyField === 'groqApiKey') return groqApiKey ?? ''
    if (provider.apiKeyField === 'alibabaApiKey') return alibabaApiKey ?? ''
    if (provider.apiKeyField === 'fireworksApiKey') return fireworksApiKey ?? ''
    return ''
  }

  const normalizedProviderEnabled = useMemo<Record<ProviderKey, boolean>>(() => {
    return {
      openrouter: providerEnabled?.openrouter !== false,
      perplexity: providerEnabled?.perplexity !== false,
      groq: providerEnabled?.groq !== false,
      ollama: providerEnabled?.ollama !== false,
      alibaba: providerEnabled?.alibaba !== false,
      fireworks: providerEnabled?.fireworks !== false,
    }
  }, [
    providerEnabled?.openrouter,
    providerEnabled?.perplexity,
    providerEnabled?.groq,
    providerEnabled?.ollama,
    providerEnabled?.alibaba,
    providerEnabled?.fireworks,
  ])

  const isProviderEnabled = (provider: ProviderDefinition): boolean =>
    normalizedProviderEnabled[provider.key]

  const setProviderApiKey = (provider: ProviderDefinition, value: string) => {
    if (!provider.apiKeyField) return
    if (provider.apiKeyField === 'openRouterApiKey') onChange({ openRouterApiKey: value })
    if (provider.apiKeyField === 'perplexityApiKey') onChange({ perplexityApiKey: value })
    if (provider.apiKeyField === 'groqApiKey') onChange({ groqApiKey: value })
    if (provider.apiKeyField === 'alibabaApiKey') onChange({ alibabaApiKey: value })
    if (provider.apiKeyField === 'fireworksApiKey') onChange({ fireworksApiKey: value })
  }

  const setProviderEnabled = (providerKey: ProviderKey, enabled: boolean) => {
    const nextProviderEnabled: ProviderEnabledMap = {
      ...DEFAULT_PROVIDER_ENABLED,
      ...providerEnabled,
      [providerKey]: enabled,
    }

    const updates: Partial<ProviderHubSectionProps> & { [key: string]: unknown } = {
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
    const updates: Partial<ProviderHubSectionProps> & { [key: string]: unknown } = {}
    if (provider === 'openrouter') updates.configuredModels = models
    if (provider === 'perplexity') updates.perplexityModels = models
    if (provider === 'groq') updates.groqModels = models
    if (provider === 'alibaba') updates.alibabaModels = models
    if (provider === 'fireworks') updates.fireworksModels = models
    if (provider === 'ollama') updates.ollamaModels = models
    onChange(updates)
  }

  const addCustomModel = (model: ConfiguredModel, provider: ProviderKey = selectedProviderDef.key) => {
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

    const updates: Partial<ProviderHubSectionProps> & { [key: string]: unknown } = {}
    if (provider === 'openrouter') updates.configuredModels = updatedModels
    if (provider === 'perplexity') updates.perplexityModels = updatedModels
    if (provider === 'groq') updates.groqModels = updatedModels
    if (provider === 'alibaba') updates.alibabaModels = updatedModels
    if (provider === 'fireworks') updates.fireworksModels = updatedModels
    if (provider === 'ollama') updates.ollamaModels = updatedModels

    if (!checked && modelProvider === provider && aiModel === modelCode) {
      const fallback = updatedModels.find((model) => model.enabled !== false)
      if (fallback) {
        updates.aiModel = fallback.code
        updates.modelProvider = provider
      }
    }

    onChange(updates)
  }

  const updateModel = (provider: ProviderKey, modelCode: string, updatedModel: ConfiguredModel) => {
    const currentModels = providerModelMap[provider] as ConfiguredModel[]
    const updatedModels = currentModels.map((model) => {
      if (model.code !== modelCode) return model
      return { ...model, ...updatedModel, code: modelCode }
    })

    const updates: Partial<ProviderHubSectionProps> & { [key: string]: unknown } = {}
    if (provider === 'openrouter') updates.configuredModels = updatedModels
    if (provider === 'perplexity') updates.perplexityModels = updatedModels
    if (provider === 'groq') updates.groqModels = updatedModels
    if (provider === 'alibaba') updates.alibabaModels = updatedModels
    if (provider === 'fireworks') updates.fireworksModels = updatedModels
    if (provider === 'ollama') updates.ollamaModels = updatedModels

    onChange(updates)
  }

  const removeModel = (provider: ProviderKey, modelCode: string) => {
    const currentModels = providerModelMap[provider] as ConfiguredModel[]
    const updatedModels = currentModels.filter((model) => model.code !== modelCode)

    const updates: Partial<ProviderHubSectionProps> & { [key: string]: unknown } = {}
    if (provider === 'openrouter') updates.configuredModels = updatedModels
    if (provider === 'perplexity') updates.perplexityModels = updatedModels
    if (provider === 'groq') updates.groqModels = updatedModels
    if (provider === 'alibaba') updates.alibabaModels = updatedModels
    if (provider === 'fireworks') updates.fireworksModels = updatedModels
    if (provider === 'ollama') updates.ollamaModels = updatedModels

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

  const runConnectivityCheck = async () => {
    const selectedKey = getProviderApiKey(selectedProviderDef).trim()
    const endpoint =
      providerProxyUrls[selectedProviderDef.key] || PROVIDER_ENDPOINTS[selectedProviderDef.key]

    if (selectedProviderDef.key !== 'ollama' && !selectedKey) {
      setConnectivityStatus('error')
      setConnectivityMeta(null)
      setConnectivityDetails(
        `Provider: ${selectedProviderDef.name}\nModel: ${connectivityModel || 'none'}\nEndpoint: ${endpoint}`
      )
      setShowConnectivityDetails(false)
      setConnectivityMessage(
        `${selectedProviderDef.name} API key is incorrect or empty. Add a valid key and try again.`
      )
      return
    }

    if (!connectivityModel) {
      setConnectivityStatus('error')
      setConnectivityMeta(null)
      setConnectivityDetails(`Provider: ${selectedProviderDef.name}\nEndpoint: ${endpoint}`)
      setShowConnectivityDetails(false)
      setConnectivityMessage('Select a model for this provider before checking.')
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
        const response = await fetch(`${endpoint}/auth/key`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${selectedKey}` },
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`OpenRouter auth failed (${response.status}).`)
        }
      } else if (selectedProviderDef.key === 'groq') {
        const response = await fetch(`${endpoint}/models`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${selectedKey}` },
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Groq check failed (${response.status}).`)
        }
      } else if (selectedProviderDef.key === 'perplexity') {
        const response = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${selectedKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: connectivityModel,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
          }),
          signal: controller.signal,
        })
        if (!response.ok && response.status !== 400) {
          throw new Error(`Perplexity check failed (${response.status}).`)
        }
      } else if (selectedProviderDef.key === 'alibaba') {
        const response = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${selectedKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: connectivityModel,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
          }),
          signal: controller.signal,
        })
        if (!response.ok && response.status !== 400) {
          throw new Error(`Alibaba Cloud check failed (${response.status}).`)
        }
      } else if (selectedProviderDef.key === 'fireworks') {
        const response = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${selectedKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: connectivityModel,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
          }),
          signal: controller.signal,
        })
        if (!response.ok && response.status !== 400) {
          throw new Error(`Fireworks check failed (${response.status}).`)
        }
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
        <div className="flex rounded-md border border-border bg-secondary/60 p-1">
          <button
            type="button"
            onClick={() => setManageMode('providers')}
            className="rounded px-3 py-1.5 text-xs font-medium transition"
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
            className="rounded px-3 py-1.5 text-xs font-medium transition"
            style={{
              background:
                manageMode === 'search-apis' ? 'var(--theme-surface-active)' : 'transparent',
              color: 'var(--theme-text-primary)',
            }}
          >
            Search APIs
          </button>
        </div>
      </div>

      {manageMode === 'providers' && providerView === 'catalog' && (
        <div className="mt-4 min-w-0">
          <Card
            className="settings-section-card provider-hub-base-card min-w-0 overflow-y-auto"
            style={{ background: CATALOG_BASE_BACKGROUND }}
          >
            <ProviderSection
              providers={PROVIDERS}
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
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground">
                  <CircleHelp size={12} />
                </span>
              </div>
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
                          value={getProviderApiKey(selectedProviderDef)}
                          onChange={(e) => {
                            setProviderApiKey(selectedProviderDef, e.target.value)
                            setConnectivityStatus('idle')
                            setConnectivityMeta(null)
                            setConnectivityMessage(
                              'API key changed. Run connectivity check to verify.'
                            )
                            setConnectivityDetails('')
                            setShowConnectivityDetails(false)
                          }}
                          className="border-border bg-secondary pr-10"
                          placeholder={`${selectedProviderDef.name} API Key`}
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
                          setConnectivityStatus('idle')
                          setConnectivityMeta(null)
                          setConnectivityMessage('Proxy URL changed. Run connectivity check again.')
                          setConnectivityDetails('')
                          setShowConnectivityDetails(false)
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
                              setConnectivityStatus('idle')
                              setConnectivityMeta(null)
                              setConnectivityMessage(
                                'Model changed. Run check again to verify this model.'
                              )
                              setConnectivityDetails('')
                              setShowConnectivityDetails(false)
                            }}
                          >
                            <SelectTrigger
                              className="h-10 flex-1 border-border bg-secondary"
                              aria-label="Connectivity check model"
                            >
                              <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                            <SelectContent>
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
                                ? 'rgba(244, 63, 94, 0.55)'
                                : connectivityStatus === 'success'
                                  ? 'rgba(34, 197, 94, 0.4)'
                                  : 'var(--theme-border)',
                            background:
                              connectivityStatus === 'error'
                                ? 'rgba(136, 19, 55, 0.44)'
                                : connectivityStatus === 'success'
                                  ? 'rgba(21, 128, 61, 0.22)'
                                  : 'var(--theme-surface-hover)',
                          }}
                        >
                          <div className="px-4 py-3">
                            <span className="inline-flex items-start gap-2 text-sm leading-6 text-foreground">
                              {connectivityStatus === 'checking' && (
                                <Loader2 size={16} className="mt-0.5 animate-spin" />
                              )}
                              {connectivityStatus === 'success' && (
                                <CheckCircle2 size={16} className="mt-0.5 text-green-400" />
                              )}
                              {connectivityStatus === 'error' && (
                                <AlertCircle size={16} className="mt-0.5 text-rose-300" />
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
                <Lock size={13} />
                <span>
                  Your key and proxy URL will be encrypted using
                  <span className="ml-1 text-cyan-300">AES-GCM</span> encryption algorithm
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

              <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    value={providerModelQuery}
                    onChange={(e) => setProviderModelQuery(e.target.value)}
                    placeholder="Search models..."
                    className="border-border bg-secondary pl-9"
                  />
                </div>
                {(selectedProviderDef.key === 'openrouter' ||
                  selectedProviderDef.key === 'fireworks') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      selectedProviderDef.key === 'openrouter'
                        ? setOpenRouterSearchDialogOpen(true)
                        : setFireworksSearchDialogOpen(true)
                    }
                    className="gap-2"
                  >
                    <Search size={14} />
                    Add from Catalog
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="icon"
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
            className="settings-section-card provider-hub-base-card min-w-0 h-[min(320px,calc(50vh-100px))] overflow-y-auto lg:h-[min(400px,calc(60vh-120px))]"
            style={{ background: CATALOG_BASE_BACKGROUND }}
          >
            <SearchApiSection
              apis={SEARCH_APIS}
              selectedApi={selectedSearchApi}
              tavilyApiKey={tavilyApiKey}
              tavilySearchDepthPreference={tavilySearchDepthPreference}
              onCardClick={(api) => {
                setSelectedSearchApi(api.key)
                setSearchApiView('detail')
              }}
              onTavilyDisable={() => onChange({ tavilyApiKey: '' })}
            />
          </Card>
        </div>
      )}

      {manageMode === 'search-apis' && searchApiView === 'detail' && (
        <SearchApiDetail
          api={SEARCH_APIS.find((a) => a.key === selectedSearchApi)!}
          tavilyApiKey={tavilyApiKey}
          tavilySearchDepthPreference={tavilySearchDepthPreference}
          webSearchIncludeImages={webSearchIncludeImages}
          onBack={() => setSearchApiView('catalog')}
          onChange={onChange}
        />
      )}

      <CreateCustomModelDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreate={(model) => addCustomModel(model, selectedProviderDef.key)}
      />

      <CreateCustomModelDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open)
          if (!open) setModelToEdit(null)
        }}
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
        <DialogContent className="border-border bg-card sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete Model</DialogTitle>
            <DialogDescription>
              {modelToDelete && (
                <>
                  Remove &quot;{modelToDelete.displayName}&quot; from your model list?
                  {modelToDelete.provider === 'ollama' && (
                    <span className="mt-2 block text-muted-foreground">
                      Ollama models will reappear when you refresh the model list.
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  )
}

function ProviderSection({
  providers,
  onCardClick,
  isProviderEnabled,
  setProviderEnabled,
  getApiKey,
  modelMap,
}: {
  providers: ProviderDefinition[]
  onCardClick: (provider: ProviderDefinition) => void
  isProviderEnabled: (provider: ProviderDefinition) => boolean
  setProviderEnabled: (providerKey: ProviderKey, enabled: boolean) => void
  getApiKey: (provider: ProviderDefinition) => string
  modelMap: Record<ProviderKey, ModelBasic[]>
}): React.ReactElement | null {
  if (providers.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-px overflow-hidden rounded-lg border border-white/10">
      {providers.map((provider) => {
        const enabled = isProviderEnabled(provider)
        const hasApiKey = provider.apiKeyField ? getApiKey(provider).trim().length > 0 : true
        const models = modelMap[provider.key] || []
        const modelCount = models.length
        const enabledModelCount = models.filter((m) => m.enabled !== false).length
        return (
          <div
            key={provider.key}
            onClick={() => onCardClick(provider)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onCardClick(provider)
              }
            }}
            role="button"
            tabIndex={0}
            className="flex items-center gap-3 px-3.5 py-3 text-left transition hover:bg-white/[0.04]"
            style={{ background: CATALOG_CARD_BACKGROUND }}
          >
            <div className="flex shrink-0 items-center justify-center">
              <ProviderLogo provider={provider.key} size={20} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">
                  {provider.name}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {provider.description}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium"
                style={{
                  background: hasApiKey ? 'rgba(74, 222, 128, 0.10)' : 'rgba(250, 204, 21, 0.10)',
                  color: hasApiKey ? 'rgb(74, 222, 128)' : 'rgb(250, 204, 21)',
                }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: hasApiKey ? 'rgb(74, 222, 128)' : 'rgb(250, 204, 21)' }}
                />
                {provider.apiKeyField ? (hasApiKey ? 'Key set' : 'No key') : 'Local'}
              </span>
              {modelCount > 0 && (
                <span className="hidden rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-flex">
                  {enabledModelCount}/{modelCount} models
                </span>
              )}
            </div>

            <Switch
              className="provider-hub-toggle"
              checked={enabled}
              onCheckedChange={(checked) => {
                setProviderEnabled(provider.key, checked)
              }}
              aria-label={`Toggle ${provider.name}`}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )
      })}
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
  onEditModel,
  onDeleteModel,
}: {
  title?: string
  models: ModelBasic[]
  selectedProvider: ProviderKey
  onToggleModel: (code: string, checked: boolean) => void
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
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
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`More actions for ${model.displayName}`}
                  >
                    <MoreVertical size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel inset>{model.displayName}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditModel(model)
                    }}
                  >
                    <Edit2 size={14} />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
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
  tavilySearchDepthPreference,
  onCardClick,
  onTavilyDisable,
}: {
  apis: SearchApiDefinition[]
  selectedApi: SearchApiKey
  tavilyApiKey: string
  tavilySearchDepthPreference: TavilySearchDepthPreference
  onCardClick: (api: SearchApiDefinition) => void
  onTavilyDisable: () => void
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

  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <span>Search APIs</span>
        <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
          {apis.length}
        </span>
      </div>
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        }}
      >
        {apis.map((api) => {
          const enabled = Boolean(api.apiKeyField && (tavilyApiKey || '').trim())
          return (
            <div
              key={api.key}
              onClick={() => onCardClick(api)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onCardClick(api)
                }
              }}
              role="button"
              tabIndex={0}
              className="w-full rounded-xl border border-white/15 p-4 text-left transition hover:border-white/30"
              style={{
                background: CATALOG_CARD_BACKGROUND,
                boxShadow: selectedApi === api.key ? 'inset 0 0 0 1px var(--theme-accent)' : 'none',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span style={api.color ? { color: api.color } : undefined}>{api.icon}</span>
                  <span className="truncate text-[15px] font-semibold text-foreground">
                    {api.name}
                  </span>
                  {api.key === 'tavily' && (
                    <span className="shrink-0 rounded bg-[var(--theme-accent)]/20 px-1.5 py-0.5 text-[10px] font-medium text-[var(--theme-accent)]">
                      Recommended
                    </span>
                  )}
                </div>
                <Switch
                  className="provider-hub-toggle"
                  checked={enabled}
                  onCheckedChange={(checked) => {
                    if (!checked) {
                      if (api.apiKeyField === 'tavilyApiKey') onTavilyDisable()
                    } else {
                      onCardClick(api)
                    }
                  }}
                  aria-label={`Toggle ${api.name}`}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <p className="mt-3 min-h-[50px] text-sm text-muted-foreground">
                {api.shortDescription || api.description}
              </p>
              {api.key === 'tavily' && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Default search speed: {getDepthSummary(tavilySearchDepthPreference)}
                </div>
              )}
              <div className="mt-4 border-t border-border pt-2" />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SearchApiDetail({
  api,
  tavilyApiKey,
  tavilySearchDepthPreference,
  webSearchIncludeImages,
  onBack,
  onChange,
}: {
  api: SearchApiDefinition
  tavilyApiKey: string
  tavilySearchDepthPreference: TavilySearchDepthPreference
  webSearchIncludeImages: boolean
  onBack: () => void
  onChange: ProviderHubSectionProps['onChange']
}): React.ReactElement {
  const [showApiKey, setShowApiKey] = useState(false)
  const isEnabled = Boolean(api.apiKeyField && (tavilyApiKey || '').trim())

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
              }
            }}
            aria-label={`Enable ${api.name}`}
          />
        </div>

        <div className="border-t border-border pt-6">
          {api.apiKeyField === 'tavilyApiKey' ? (
            <div className="space-y-6">
              <DetailField
                label="API Key"
                description="Without a key, a limited free fallback is used. Add a key for best results. Only API key is required here."
                control={
                  <div className="relative w-full">
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      value={tavilyApiKey}
                      onChange={(e) => onChange({ tavilyApiKey: e.target.value })}
                      placeholder="tvly-..."
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
                    <SelectContent>
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
                      onCheckedChange={(checked) => onChange({ webSearchIncludeImages: checked })}
                      aria-label="Include web search images"
                    />
                  </div>
                }
              />
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
