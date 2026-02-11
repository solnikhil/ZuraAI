import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowUpDown,
  CircleHelp,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Globe,
  GripVertical,
  Layers,
  Loader2,
  Lock,
  MoreVertical,
  Plus,
  RefreshCcw,
  Search,
  Wrench,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ProviderLogo } from '@/components/shared'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { CreateCustomModelDialog } from './CreateCustomModelDialog'
import { OpenRouterModelSearchDialog } from './OpenRouterModelSearchDialog'
import {
  getCapabilitiesFromModel,
  CAPABILITY_BADGES,
} from '../../../utils/modelUtils'

type ManageMode = 'providers' | 'search-apis'
type ProviderView = 'catalog' | 'detail'
type ProviderKey = 'openrouter' | 'perplexity' | 'gemini' | 'groq' | 'minimax' | 'ollama'
type ConnectivityStatus = 'idle' | 'checking' | 'success' | 'error'

interface ProviderDefinition {
  key: ProviderKey
  name: string
  description: string
  apiKeyField?: keyof Pick<ProviderHubSectionProps,
    'openRouterApiKey' | 'perplexityApiKey' | 'geminiApiKey' | 'groqApiKey' | 'minimaxApiKey'
  >
}

const PROVIDERS: ProviderDefinition[] = [
  {
    key: 'openrouter',
    name: 'OpenRouter',
    description: 'OpenRouter provides access to many frontier models through one API.',
    apiKeyField: 'openRouterApiKey',
  },
  {
    key: 'gemini',
    name: 'Gemini',
    description: 'Google Gemini models with strong multimodal and long-context support.',
    apiKeyField: 'geminiApiKey',
  },
  {
    key: 'groq',
    name: 'Groq',
    description: 'Ultra-low-latency model inference for high-speed chat experiences.',
    apiKeyField: 'groqApiKey',
  },
  {
    key: 'perplexity',
    name: 'Perplexity',
    description: 'Research-focused model provider with search-native reasoning models.',
    apiKeyField: 'perplexityApiKey',
  },
  {
    key: 'minimax',
    name: 'MiniMax',
    description: 'Reasoning-capable provider with streaming and interleaved thinking.',
    apiKeyField: 'minimaxApiKey',
  },
  {
    key: 'ollama',
    name: 'Ollama',
    description: 'Run local models privately on your machine with local networking.',
  },
]

const PROVIDER_ENDPOINTS: Record<ProviderKey, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  perplexity: 'https://api.perplexity.ai',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  groq: 'https://api.groq.com/openai/v1',
  minimax: 'https://api.minimax.io/v1',
  ollama: 'http://localhost:11434',
}

interface ModelBasic {
  code: string
  displayName: string
  enabled?: boolean
}

function mergeOrderKeys(current: ProviderKey[], available: ProviderKey[]): ProviderKey[] {
  const currentFiltered = current.filter((key) => available.includes(key))
  const missing = available.filter((key) => !currentFiltered.includes(key))
  return [...currentFiltered, ...missing]
}

function sortByOrder(items: ProviderDefinition[], orderedKeys: ProviderKey[]): ProviderDefinition[] {
  const indexMap = new Map<ProviderKey, number>()
  orderedKeys.forEach((key, index) => indexMap.set(key, index))
  return [...items].sort((a, b) => {
    const aIndex = indexMap.get(a.key)
    const bIndex = indexMap.get(b.key)
    if (aIndex === undefined && bIndex === undefined) return 0
    if (aIndex === undefined) return 1
    if (bIndex === undefined) return -1
    return aIndex - bIndex
  })
}

export interface ProviderHubSectionProps {
  openRouterApiKey: string
  perplexityApiKey: string
  geminiApiKey: string
  groqApiKey: string
  minimaxApiKey: string
  tavilyApiKey: string
  ollamaUrl: string
  toolsEnabled: boolean
  webSearchEnabled: boolean
  deepResearchEnabled: boolean
  aiModel: string
  modelProvider: 'openrouter' | 'ollama' | 'perplexity' | 'gemini' | 'groq' | 'minimax'
  configuredModels: ConfiguredModel[]
  perplexityModels: ModelBasic[]
  geminiModels: ModelBasic[]
  groqModels: ModelBasic[]
  minimaxModels: ModelBasic[]
  ollamaModels: ModelBasic[]
  maxTokens: number
  titleModel: string
  onChange: (changes: Partial<{
    openRouterApiKey: string
    perplexityApiKey: string
    geminiApiKey: string
    groqApiKey: string
    minimaxApiKey: string
    tavilyApiKey: string
    ollamaUrl: string
    toolsEnabled: boolean
    webSearchEnabled: boolean
    deepResearchEnabled: boolean
    configuredModels: ConfiguredModel[]
    perplexityModels: ConfiguredModel[]
    geminiModels: ConfiguredModel[]
    groqModels: ConfiguredModel[]
    minimaxModels: ConfiguredModel[]
    ollamaModels: ConfiguredModel[]
    maxTokens: number
    titleModel: string
    aiModel: string
    modelProvider: 'openrouter' | 'ollama' | 'perplexity' | 'gemini' | 'groq' | 'minimax'
  }>) => void
}

export function ProviderHubSection({
  openRouterApiKey,
  perplexityApiKey,
  geminiApiKey,
  groqApiKey,
  minimaxApiKey,
  tavilyApiKey,
  ollamaUrl,
  toolsEnabled,
  webSearchEnabled,
  deepResearchEnabled,
  aiModel,
  modelProvider,
  configuredModels,
  perplexityModels,
  geminiModels,
  groqModels,
  minimaxModels,
  ollamaModels,
  titleModel,
  onChange,
}: ProviderHubSectionProps): React.ReactElement {
  const [manageMode, setManageMode] = useState<ManageMode>('providers')
  const [providerView, setProviderView] = useState<ProviderView>('catalog')
  const [query, setQuery] = useState('')
  const [catalogFilter, setCatalogFilter] = useState<'all' | ProviderKey>('all')
  const [sidebarExpandedGroups, setSidebarExpandedGroups] = useState<{ enabled: boolean; disabled: boolean }>({
    enabled: true,
    disabled: true,
  })
  const [sidebarActiveGroup, setSidebarActiveGroup] = useState<'enabled' | 'disabled'>('enabled')
  const [customOrderDialogOpen, setCustomOrderDialogOpen] = useState(false)
  const [customOrderDialogGroup, setCustomOrderDialogGroup] = useState<'enabled' | 'disabled'>('enabled')
  const [customOrderDraft, setCustomOrderDraft] = useState<ProviderDefinition[]>([])
  const [draggedProviderIndex, setDraggedProviderIndex] = useState<number | null>(null)
  const [providerOrder, setProviderOrder] = useState<{ enabled: ProviderKey[]; disabled: ProviderKey[] }>({
    enabled: [],
    disabled: [],
  })
  const [providerModelQuery, setProviderModelQuery] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>('openrouter')
  const [selectedSearchCard, setSelectedSearchCard] = useState<'tavily' | 'runtime'>('tavily')
  const [showApiKey, setShowApiKey] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [openRouterSearchDialogOpen, setOpenRouterSearchDialogOpen] =
    useState(false)
  const [connectivityModel, setConnectivityModel] = useState('')
  const [modelListFilter, setModelListFilter] = useState<'all' | 'chat'>('all')
  const [providerProxyUrls, setProviderProxyUrls] = useState<Record<ProviderKey, string>>(PROVIDER_ENDPOINTS)
  const [connectivityStatus, setConnectivityStatus] = useState<ConnectivityStatus>('idle')
  const [connectivityMessage, setConnectivityMessage] = useState('Select a model, then test your connection.')
  const [connectivityMeta, setConnectivityMeta] = useState<{ latencyMs: number; checkedAt: string } | null>(null)
  const [connectivityDetails, setConnectivityDetails] = useState('')
  const [showConnectivityDetails, setShowConnectivityDetails] = useState(false)

  useEffect(() => {
    if (manageMode !== 'providers') {
      setProviderView('catalog')
    }
  }, [manageMode])

  const providerModelMap: Record<ProviderKey, ModelBasic[]> = {
    openrouter: configuredModels,
    perplexity: perplexityModels,
    gemini: geminiModels,
    groq: groqModels,
    minimax: minimaxModels,
    ollama: ollamaModels,
  }

  const selectedProviderDef = PROVIDERS.find((provider) => provider.key === selectedProvider) ?? PROVIDERS[0]
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
    if (provider.apiKeyField === 'openRouterApiKey') return openRouterApiKey
    if (provider.apiKeyField === 'perplexityApiKey') return perplexityApiKey
    if (provider.apiKeyField === 'geminiApiKey') return geminiApiKey
    if (provider.apiKeyField === 'groqApiKey') return groqApiKey
    if (provider.apiKeyField === 'minimaxApiKey') return minimaxApiKey
    return ''
  }

  const isProviderEnabled = (provider: ProviderDefinition): boolean => {
    if (provider.key === 'ollama') return Boolean(ollamaUrl.trim())
    return Boolean(getProviderApiKey(provider).trim())
  }

  const setProviderApiKey = (provider: ProviderDefinition, value: string) => {
    if (!provider.apiKeyField) return
    if (provider.apiKeyField === 'openRouterApiKey') onChange({ openRouterApiKey: value })
    if (provider.apiKeyField === 'perplexityApiKey') onChange({ perplexityApiKey: value })
    if (provider.apiKeyField === 'geminiApiKey') onChange({ geminiApiKey: value })
    if (provider.apiKeyField === 'groqApiKey') onChange({ groqApiKey: value })
    if (provider.apiKeyField === 'minimaxApiKey') onChange({ minimaxApiKey: value })
  }

  const clearProvider = (provider: ProviderDefinition) => {
    if (provider.key === 'ollama') {
      onChange({ ollamaUrl: '' })
      return
    }
    if (!provider.apiKeyField) return
    if (provider.apiKeyField === 'openRouterApiKey') onChange({ openRouterApiKey: '' })
    if (provider.apiKeyField === 'perplexityApiKey') onChange({ perplexityApiKey: '' })
    if (provider.apiKeyField === 'geminiApiKey') onChange({ geminiApiKey: '' })
    if (provider.apiKeyField === 'groqApiKey') onChange({ groqApiKey: '' })
    if (provider.apiKeyField === 'minimaxApiKey') onChange({ minimaxApiKey: '' })
  }

  const addCustomModel = (model: ConfiguredModel) => {
    const exists = configuredModels.some((item) => item.code === model.code)
    if (exists) {
      onChange({
        configuredModels: configuredModels.map((item) => (item.code === model.code ? { ...item, ...model } : item)),
      })
      return
    }
    onChange({ configuredModels: [...configuredModels, model] })
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
    if (provider === 'gemini') updates.geminiModels = updatedModels
    if (provider === 'groq') updates.groqModels = updatedModels
    if (provider === 'minimax') updates.minimaxModels = updatedModels
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

  const filteredProviders = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return PROVIDERS
    return PROVIDERS.filter((provider) => {
      return (
        provider.name.toLowerCase().includes(normalized) ||
        provider.description.toLowerCase().includes(normalized)
      )
    })
  }, [query])

  const enabledProvidersBase = useMemo(() => {
    return filteredProviders.filter((provider) => isProviderEnabled(provider))
  }, [filteredProviders])

  const disabledProvidersBase = useMemo(() => {
    return filteredProviders.filter((provider) => !isProviderEnabled(provider))
  }, [filteredProviders])

  useEffect(() => {
    const enabledKeys = enabledProvidersBase.map((provider) => provider.key)
    const disabledKeys = disabledProvidersBase.map((provider) => provider.key)

    setProviderOrder((previous) => {
      const nextEnabled = mergeOrderKeys(previous.enabled, enabledKeys)
      const nextDisabled = mergeOrderKeys(previous.disabled, disabledKeys)

      const enabledSame = nextEnabled.length === previous.enabled.length && nextEnabled.every((key, index) => key === previous.enabled[index])
      const disabledSame = nextDisabled.length === previous.disabled.length && nextDisabled.every((key, index) => key === previous.disabled[index])
      if (enabledSame && disabledSame) {
        return previous
      }

      return {
        enabled: nextEnabled,
        disabled: nextDisabled,
      }
    })
  }, [enabledProvidersBase, disabledProvidersBase])

  const enabledProvidersForSidebar = useMemo(() => {
    return sortByOrder(enabledProvidersBase, providerOrder.enabled)
  }, [enabledProvidersBase, providerOrder.enabled])

  const disabledProvidersForSidebar = useMemo(() => {
    return sortByOrder(disabledProvidersBase, providerOrder.disabled)
  }, [disabledProvidersBase, providerOrder.disabled])

  const catalogProviders = useMemo(() => {
    if (catalogFilter === 'all') return filteredProviders
    return filteredProviders.filter((provider) => provider.key === catalogFilter)
  }, [filteredProviders, catalogFilter])

  const enabledProviders = useMemo(() => {
    const filtered = enabledProvidersForSidebar.filter((provider) => catalogProviders.includes(provider))
    return filtered
  }, [enabledProvidersForSidebar, catalogProviders])

  const disabledProviders = useMemo(() => {
    const filtered = disabledProvidersForSidebar.filter((provider) => catalogProviders.includes(provider))
    return filtered
  }, [disabledProvidersForSidebar, catalogProviders])

  const openCustomOrderDialog = (group: 'enabled' | 'disabled') => {
    setSidebarActiveGroup(group)
    setCustomOrderDialogGroup(group)
    setCustomOrderDraft(group === 'enabled' ? enabledProvidersForSidebar : disabledProvidersForSidebar)
    setDraggedProviderIndex(null)
    setCustomOrderDialogOpen(true)
  }

  const updateCustomOrder = () => {
    const orderedKeys = customOrderDraft.map((provider) => provider.key)
    setProviderOrder((previous) => ({
      ...previous,
      [customOrderDialogGroup]: orderedKeys,
    }))
    setCustomOrderDialogOpen(false)
  }

  const moveCustomOrderItem = (toIndex: number) => {
    if (draggedProviderIndex === null || draggedProviderIndex === toIndex) return
    setCustomOrderDraft((previous) => {
      const next = [...previous]
      const [moved] = next.splice(draggedProviderIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
    setDraggedProviderIndex(toIndex)
  }

  const runConnectivityCheck = async () => {
    const selectedKey = getProviderApiKey(selectedProviderDef).trim()
    const endpoint = providerProxyUrls[selectedProviderDef.key] || PROVIDER_ENDPOINTS[selectedProviderDef.key]

    if (!selectedKey) {
      setConnectivityStatus('error')
      setConnectivityMeta(null)
      setConnectivityDetails(`Provider: ${selectedProviderDef.name}\nModel: ${connectivityModel || 'none'}\nEndpoint: ${endpoint}`)
      setShowConnectivityDetails(false)
      setConnectivityMessage(`${selectedProviderDef.name} API key is incorrect or empty. Add a valid key and try again.`)
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
      } else if (selectedProviderDef.key === 'gemini') {
        const response = await fetch(`${endpoint}/models/${connectivityModel}:generateContent?key=${selectedKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'ping' }] }],
            generationConfig: { maxOutputTokens: 1 },
          }),
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Gemini check failed (${response.status}).`)
        }
      } else if (selectedProviderDef.key === 'minimax') {
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
          throw new Error(`MiniMax check failed (${response.status}).`)
        }
      }

      const latencyMs = Math.max(1, Date.now() - startedAt)
      setConnectivityStatus('success')
      setConnectivityMeta({ latencyMs, checkedAt: new Date().toLocaleTimeString() })
      setConnectivityMessage('Connection successful. API key and model are reachable.')
      setConnectivityDetails(`Provider: ${selectedProviderDef.name}\nModel: ${connectivityModel}\nEndpoint: ${endpoint}\nStatus: 200 OK`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connectivity check failed.'
      setConnectivityStatus('error')
      setConnectivityMeta(null)
      setConnectivityMessage(`${selectedProviderDef.name} API key appears invalid or endpoint is unreachable.`)
      setConnectivityDetails(`Provider: ${selectedProviderDef.name}\nModel: ${connectivityModel}\nEndpoint: ${endpoint}\nError: ${message}`)
    } finally {
      clearTimeout(timeout)
    }
  }

  return (
    <div style={{ padding: '32px', paddingBottom: 100 }}>
      <div className="page-header flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="page-title">Providers</h2>
          <div className="page-subtitle">Manage model providers, API keys, and search APIs in one place.</div>
        </div>
        <div className="flex rounded-md border border-border bg-secondary/60 p-1">
          <button
            type="button"
            onClick={() => setManageMode('providers')}
            className="rounded px-3 py-1.5 text-xs font-medium transition"
            style={{
              background: manageMode === 'providers' ? 'var(--theme-surface-active)' : 'transparent',
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
              background: manageMode === 'search-apis' ? 'var(--theme-surface-active)' : 'transparent',
              color: 'var(--theme-text-primary)',
            }}
          >
            Search APIs
          </button>
        </div>
      </div>

      {manageMode === 'providers' && providerView === 'catalog' && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[280px_1fr]">
          <Card className="settings-section-card h-[min(780px,calc(100vh-230px))] overflow-hidden">
            <div className="flex h-full flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search Providers..."
                    className="border-border bg-secondary pl-9"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setAddDialogOpen(true)}
                  aria-label="Add custom model"
                >
                  <Plus size={16} />
                </Button>
              </div>

              <button
                type="button"
                onClick={() => setCatalogFilter('all')}
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm transition"
                style={{
                  background: catalogFilter === 'all' ? 'var(--theme-surface-active)' : 'transparent',
                  color: 'var(--theme-text-primary)',
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Layers size={15} />
                  All
                </span>
              </button>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <SidebarGroupHeader
                  label="Enabled"
                  count={enabledProvidersForSidebar.length}
                  active={sidebarActiveGroup === 'enabled'}
                  expanded={sidebarExpandedGroups.enabled}
                  onToggle={() => {
                    setSidebarActiveGroup('enabled')
                    setSidebarExpandedGroups((previous) => ({ ...previous, enabled: !previous.enabled }))
                  }}
                  onOpenCustomOrder={() => openCustomOrderDialog('enabled')}
                />
                {sidebarExpandedGroups.enabled && (
                  <div className="mt-1 space-y-1">
                    {enabledProvidersForSidebar.map((provider) => (
                      <ProviderSidebarItem
                        key={`enabled-${provider.key}`}
                        provider={provider}
                        active={catalogFilter === provider.key}
                        enabled={true}
                        onClick={() => {
                          setSidebarActiveGroup('enabled')
                          setCatalogFilter(provider.key)
                          setSelectedProvider(provider.key)
                        }}
                      />
                    ))}
                  </div>
                )}

                <div className="mt-3" />
                <SidebarGroupHeader
                  label="Disabled"
                  count={disabledProvidersForSidebar.length}
                  active={sidebarActiveGroup === 'disabled'}
                  expanded={sidebarExpandedGroups.disabled}
                  onToggle={() => {
                    setSidebarActiveGroup('disabled')
                    setSidebarExpandedGroups((previous) => ({ ...previous, disabled: !previous.disabled }))
                  }}
                  onOpenCustomOrder={() => openCustomOrderDialog('disabled')}
                />
                {sidebarExpandedGroups.disabled && (
                  <div className="mt-1 space-y-1">
                    {disabledProvidersForSidebar.map((provider) => (
                      <ProviderSidebarItem
                        key={`disabled-${provider.key}`}
                        provider={provider}
                        active={catalogFilter === provider.key}
                        enabled={false}
                        onClick={() => {
                          setSidebarActiveGroup('disabled')
                          setCatalogFilter(provider.key)
                          setSelectedProvider(provider.key)
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card className="settings-section-card h-[min(780px,calc(100vh-230px))] overflow-y-auto">
            <ProviderSection
              title="Enabled"
              providers={enabledProviders}
              onCardClick={(provider) => {
                setSelectedProvider(provider.key)
                setCatalogFilter(provider.key)
                setProviderView('detail')
              }}
              isProviderEnabled={isProviderEnabled}
              clearProvider={clearProvider}
            />

            <ProviderSection
              title="Disabled"
              providers={disabledProviders}
              onCardClick={(provider) => {
                setSelectedProvider(provider.key)
                setCatalogFilter(provider.key)
                setProviderView('detail')
              }}
              isProviderEnabled={isProviderEnabled}
              clearProvider={clearProvider}
            />
          </Card>
        </div>
      )}

      {manageMode === 'providers' && providerView === 'detail' && (
        <Card className="settings-section-card" style={{ marginTop: 16 }}>
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
                <span className="text-[28px] leading-none text-foreground">{selectedProviderDef.name}</span>
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground">
                  <CircleHelp size={12} />
                </span>
              </div>
              <Switch
                checked={isProviderEnabled(selectedProviderDef)}
                onCheckedChange={(checked) => {
                  if (!checked) clearProvider(selectedProviderDef)
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
                    control={(
                      <div className="relative">
                        <Input
                          type={showApiKey ? 'text' : 'password'}
                          value={getProviderApiKey(selectedProviderDef)}
                          onChange={(e) => {
                            setProviderApiKey(selectedProviderDef, e.target.value)
                            setConnectivityStatus('idle')
                            setConnectivityMeta(null)
                            setConnectivityMessage('API key changed. Run connectivity check to verify.')
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
                    )}
                  />

                  <DetailField
                    label="API Proxy URL"
                    description="Must include http(s)://"
                    control={(
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
                    )}
                  />

                  <DetailField
                    label="Connectivity Check"
                    description="Test if API key and proxy URL are correctly configured"
                    control={(
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <select
                            value={connectivityModel}
                            onChange={(e) => {
                              setConnectivityModel(e.target.value)
                              setConnectivityStatus('idle')
                              setConnectivityMeta(null)
                              setConnectivityMessage('Model changed. Run check again to verify this model.')
                              setConnectivityDetails('')
                              setShowConnectivityDetails(false)
                            }}
                            className="h-10 flex-1 rounded-md border border-border bg-secondary px-3 text-sm text-foreground"
                          >
                            {providerModels.map((model) => (
                              <option key={model.code} value={model.code}>
                                {model.code}
                              </option>
                            ))}
                          </select>
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
                            ) : 'Check'}
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
                              {connectivityStatus === 'checking' && <Loader2 size={16} className="mt-0.5 animate-spin" />}
                              {connectivityStatus === 'success' && <CheckCircle2 size={16} className="mt-0.5 text-green-400" />}
                              {connectivityStatus === 'error' && <AlertCircle size={16} className="mt-0.5 text-rose-300" />}
                              {connectivityStatus === 'idle' && <Globe size={16} className="mt-0.5 text-muted-foreground" />}
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
                    )}
                  />
                </div>
              ) : (
                <DetailField
                  label="Ollama Endpoint"
                  description="Set your local Ollama endpoint URL"
                  control={(
                    <Input
                      value={ollamaUrl}
                      onChange={(e) => onChange({ ollamaUrl: e.target.value })}
                      className="border-border bg-secondary"
                      placeholder="http://localhost:11434"
                    />
                  )}
                />
              )}

              <p className="mt-5 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Lock size={13} />
                <span>
                  Your key and proxy URL will be encrypted using
                  <span className="ml-1 text-cyan-300">AES-GCM</span>
                  {' '}encryption algorithm
                </span>
              </p>
            </div>

            <div className="space-y-3 border-t border-border pt-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">Model List</h3>
                <span className="text-sm text-muted-foreground">{providerModels.length} models available</span>
              </div>

              <div className="flex items-center gap-4 pb-1">
                <button
                  type="button"
                  onClick={() => setModelListFilter('all')}
                  className="text-sm"
                  style={{ color: modelListFilter === 'all' ? 'var(--theme-text-primary)' : 'var(--theme-text-secondary)' }}
                >
                  All ({visibleProviderModels.length})
                </button>
                <button
                  type="button"
                  onClick={() => setModelListFilter('chat')}
                  className="text-sm"
                  style={{ color: modelListFilter === 'chat' ? 'var(--theme-text-primary)' : 'var(--theme-text-secondary)' }}
                >
                  Chat ({visibleChatModels.length})
                </button>
              </div>

              <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={providerModelQuery}
                    onChange={(e) => setProviderModelQuery(e.target.value)}
                    placeholder="Search models..."
                    className="border-border bg-secondary pl-9"
                  />
                </div>
                <Button variant="outline" className="gap-1">
                  <RefreshCcw size={14} />
                  Fetch models
                </Button>
                {selectedProviderDef.key === 'openrouter' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOpenRouterSearchDialogOpen(true)}
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
                <Button variant="outline" size="icon" aria-label="More model actions">
                  <MoreVertical size={16} />
                </Button>
              </div>

              <div className="max-h-[640px] overflow-y-auto rounded-md border border-border bg-secondary/35">
                {enabledModels.length > 0 && (
                  <ModelGroup
                    title="Enabled"
                    models={enabledModels}
                    selectedProvider={selectedProviderDef.key}
                    aiModel={aiModel}
                    modelProvider={modelProvider}
                    onToggleModel={(code, checked) => toggleModelEnabled(selectedProviderDef.key, code, checked)}
                  />
                )}

                <ModelGroup
                  title={enabledModels.length > 0 ? 'Disabled' : 'Available'}
                  models={disabledModels}
                  selectedProvider={selectedProviderDef.key}
                  aiModel={aiModel}
                  modelProvider={modelProvider}
                  onToggleModel={(code, checked) => toggleModelEnabled(selectedProviderDef.key, code, checked)}
                />
              </div>
            </div>

            <div className="grid gap-4 border-t border-border pt-5 md:grid-cols-1">
              <DetailField
                label="Title Generation Model"
                description="Model used to auto-generate chat titles."
                control={(
                  <select
                    value={titleModel}
                    onChange={(e) => onChange({ titleModel: e.target.value })}
                    className="h-10 w-full rounded-md border border-border bg-secondary px-3 text-sm text-foreground"
                  >
                    {providerModels.map((model) => (
                      <option key={model.code} value={model.code}>{model.displayName}</option>
                    ))}
                    {!providerModels.some((model) => model.code === titleModel) && (
                      <option value={titleModel}>{titleModel}</option>
                    )}
                  </select>
                )}
              />
            </div>
          </div>
        </Card>
      )}

      {manageMode === 'search-apis' && (
        <>
          <Card className="settings-section-card" style={{ marginTop: 16 }}>
            <div className="grid gap-3 md:grid-cols-2">
              <SearchCard
                title="Tavily"
                description="Add search API key for web_search tool execution."
                selected={selectedSearchCard === 'tavily'}
                enabled={Boolean(tavilyApiKey.trim())}
                icon={<Globe size={17} className="text-foreground" />}
                onSelect={() => setSelectedSearchCard('tavily')}
                onDisable={() => onChange({ tavilyApiKey: '' })}
              />

              <SearchCard
                title="Search Runtime"
                description="Control web search and deep research availability."
                selected={selectedSearchCard === 'runtime'}
                enabled={toolsEnabled}
                icon={<Wrench size={17} className="text-foreground" />}
                onSelect={() => setSelectedSearchCard('runtime')}
                onDisable={() => onChange({ toolsEnabled: false })}
              />
            </div>
          </Card>

          <Card className="settings-section-card" style={{ marginTop: 16 }}>
            {selectedSearchCard === 'tavily' ? (
              <DetailField
                label="Tavily API Key"
                description="Only API key is required here."
                control={(
                  <Input
                    type="password"
                    value={tavilyApiKey}
                    onChange={(e) => onChange({ tavilyApiKey: e.target.value })}
                    placeholder="tvly-..."
                    className="border-border bg-secondary"
                  />
                )}
              />
            ) : (
              <div className="space-y-3">
                <ToggleRow
                  label="Enable Tools"
                  checked={toolsEnabled}
                  onCheckedChange={(checked) => onChange({ toolsEnabled: checked })}
                />
                <ToggleRow
                  label="Enable Web Search"
                  checked={webSearchEnabled}
                  onCheckedChange={(checked) => {
                    onChange({ webSearchEnabled: checked, ...(checked ? {} : { deepResearchEnabled: false }) })
                  }}
                />
                <ToggleRow
                  label="Enable Deep Research"
                  checked={deepResearchEnabled}
                  onCheckedChange={(checked) => {
                    onChange({ deepResearchEnabled: checked, ...(checked ? { webSearchEnabled: true } : {}) })
                  }}
                />
              </div>
            )}
          </Card>
        </>
      )}

      <Dialog open={customOrderDialogOpen} onOpenChange={setCustomOrderDialogOpen}>
        <DialogContent className="border-border bg-card sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Custom Order</DialogTitle>
            <DialogDescription>
              Drag providers to set display order for the {customOrderDialogGroup} list.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
            {customOrderDraft.map((provider, index) => (
              <div
                key={`order-${provider.key}`}
                draggable
                onDragStart={() => setDraggedProviderIndex(index)}
                onDragOver={(e) => {
                  e.preventDefault()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  moveCustomOrderItem(index)
                }}
                className="flex items-center justify-between rounded-md border border-transparent px-2 py-2 hover:border-border"
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <ProviderLogo provider={provider.key} size={18} />
                  <span className="truncate text-sm text-foreground">{provider.name}</span>
                </span>
                <GripVertical size={16} className="text-muted-foreground" />
              </div>
            ))}
          </div>

          <Button onClick={updateCustomOrder}>Update</Button>
        </DialogContent>
      </Dialog>

      <CreateCustomModelDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreate={addCustomModel}
      />

      {selectedProviderDef.key === 'openrouter' && (
        <OpenRouterModelSearchDialog
          open={openRouterSearchDialogOpen}
          onOpenChange={setOpenRouterSearchDialogOpen}
          onAddModel={addCustomModel}
          apiKey={openRouterApiKey}
          existingModelCodes={configuredModels.map((m) => m.code)}
        />
      )}
    </div>
  )
}

function ProviderSection({
  title,
  providers,
  onCardClick,
  isProviderEnabled,
  clearProvider,
}: {
  title: string
  providers: ProviderDefinition[]
  onCardClick: (provider: ProviderDefinition) => void
  isProviderEnabled: (provider: ProviderDefinition) => boolean
  clearProvider: (provider: ProviderDefinition) => void
}): React.ReactElement {
  if (providers.length === 0) {
    return (
      <div className="mt-3">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <span>{title}</span>
          <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">0</span>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <span>{title}</span>
        <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{providers.length}</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {providers.map((provider) => {
          const enabled = isProviderEnabled(provider)
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
              className="w-full rounded-xl border border-border bg-secondary/35 p-4 text-left transition hover:border-[var(--theme-border-hover)]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ProviderLogo provider={provider.key} size={18} />
                  <span className="truncate text-[15px] font-semibold text-foreground">{provider.name}</span>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) => {
                    if (!checked) {
                      clearProvider(provider)
                    }
                  }}
                  aria-label={`Toggle ${provider.name}`}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              <p className="mt-3 min-h-[50px] text-sm text-muted-foreground">{provider.description}</p>
              <div className="mt-4 border-t border-border pt-2" />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProviderSidebarItem({
  provider,
  active,
  enabled,
  onClick,
}: {
  provider: ProviderDefinition
  active: boolean
  enabled: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition"
      style={{
        background: active ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
        color: 'var(--theme-text-primary)',
      }}
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        <ProviderLogo provider={provider.key} size={16} />
        <span className="truncate">{provider.name}</span>
      </span>
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: enabled ? '#b8f221' : '#4b5563' }}
      />
    </button>
  )
}

function SidebarGroupHeader({
  label,
  count,
  active,
  expanded,
  onToggle,
  onOpenCustomOrder,
}: {
  label: string
  count: number
  active: boolean
  expanded: boolean
  onToggle: () => void
  onOpenCustomOrder: () => void
}): React.ReactElement {
  return (
    <div
      className="flex items-center justify-between rounded-md px-2 py-2"
      style={{
        background: active ? 'var(--theme-surface-active)' : 'var(--theme-surface-hover)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1 text-sm font-medium text-foreground"
      >
        <span>{label}</span>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{count}</span>
      </button>

      <button
        type="button"
        onClick={onOpenCustomOrder}
        className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        aria-label={`Custom order for ${label.toLowerCase()} providers`}
      >
        <ArrowUpDown size={14} />
      </button>
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
    <div className="grid gap-3 md:grid-cols-[220px_1fr] md:items-start">
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="mt-1 text-xs text-muted-foreground">{description}</div>
      </div>
      <div>{control}</div>
    </div>
  )
}

function ModelGroup({
  title,
  models,
  selectedProvider,
  aiModel,
  modelProvider,
  onToggleModel,
}: {
  title: string
  models: ModelBasic[]
  selectedProvider: ProviderKey
  aiModel: string
  modelProvider: string
  onToggleModel: (code: string, checked: boolean) => void
}): React.ReactElement {
  if (models.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground">No models in this section.</div>
    )
  }

  return (
    <div>
      <div className="px-4 py-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">{title}</div>
      {models.map((model) => {
        const isCurrentModel =
          model.code === aiModel && modelProvider === selectedProvider
        const enabled = model.enabled !== false
        const capabilities = getCapabilitiesFromModel(model as ConfiguredModel)
        return (
          <div
            key={`${selectedProvider}-${model.code}`}
            className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 first:border-t-0"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {model.displayName}
                </div>
                {isCurrentModel && (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground shrink-0">
                    Current
                  </span>
                )}
              </div>
              <div className="mt-1 inline-flex rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground mb-2">
                {model.code}
              </div>
              {capabilities.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {capabilities.map((capKey) => {
                    const badgeConfig = CAPABILITY_BADGES[capKey]
                    if (!badgeConfig) return null
                    const Icon = badgeConfig.icon
                    return (
                      <div
                        key={capKey}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-muted/60 text-muted-foreground"
                        title={badgeConfig.label}
                      >
                        <Icon size={10} />
                        <span>{badgeConfig.label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(checked) => onToggleModel(model.code, checked)}
              aria-label={`Toggle ${model.displayName}`}
            />
          </div>
        )
      })}
    </div>
  )
}

function SearchCard({
  title,
  description,
  selected,
  enabled,
  icon,
  onSelect,
  onDisable,
}: {
  title: string
  description: string
  selected: boolean
  enabled: boolean
  icon: React.ReactNode
  onSelect: () => void
  onDisable: () => void
}): React.ReactElement {
  return (
    <div
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      role="button"
      tabIndex={0}
      className="w-full rounded-xl border border-border bg-secondary/35 p-4 text-left transition hover:border-[var(--theme-border-hover)]"
      style={{ boxShadow: selected ? 'inset 0 0 0 1px var(--theme-accent)' : 'none' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[15px] font-semibold text-foreground">{title}</span>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            if (!checked) onDisable()
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Toggle ${title}`}
        />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-secondary/50 px-3 py-2">
      <span className="text-sm text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  )
}

export default ProviderHubSection
