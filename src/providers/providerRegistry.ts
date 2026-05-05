import type { ConfiguredModel, SettingsConfig } from '../contexts/SettingsConfigContext'
import { getOpenRouterApiKey } from '../utils/openRouterKey'
import { getTitleEligibleModels } from '../utils/titleGenerationModels'
import type { ActiveProviderId, ProviderId } from './providerTypes'

export interface ProviderCapabilities {
  supportsStreaming: boolean
  supportsTools: boolean
  supportsVisionUploads: boolean
  supportsReasoning: boolean
  supportsImageGeneration: boolean
  supportsNativeSearch: boolean
}

export interface ProviderEndpoints {
  baseUrl?: string
  chatCompletionsUrl?: string
  modelCatalogUrl?: string
  defaultLocalUrl?: string
}

export interface ProviderRetryPolicy {
  maxRetries: number
  initialBackoffMs: number
  backoffMultiplier: number
  retryableStatusCodes: number[]
}

export interface ProviderAuthPolicy {
  hasAccess: (settings: ProviderSettingsLike) => boolean
  getCredentialError: (settings: ProviderSettingsLike) => string | null
}

export interface ProviderModelPolicy {
  settingsModelKey?: ProviderModelListKey
  supportsTools: (model: string) => boolean
}

export interface ProviderDefinition {
  id: ProviderId
  label: string
  description: string
  accentColor: string
  capabilities: ProviderCapabilities
  endpoints: ProviderEndpoints
  retryPolicy: ProviderRetryPolicy
  auth: ProviderAuthPolicy
  models: ProviderModelPolicy
}

export type ProviderModelListKey =
  | 'configuredModels'
  | 'ollamaModels'
  | 'perplexityModels'
  | 'groqModels'
  | 'alibabaModels'
  | 'fireworksModels'
  | 'deepseekModels'

export type ProviderSettingsLike = Partial<
  Pick<
    SettingsConfig,
    | 'providerEnabled'
    | 'openRouterApiKey'
    | 'perplexityApiKey'
    | 'groqApiKey'
    | 'alibabaApiKey'
    | 'fireworksApiKey'
    | 'deepseekApiKey'
    | 'ollamaUrl'
    | 'configuredModels'
    | 'ollamaModels'
    | 'perplexityModels'
    | 'groqModels'
    | 'alibabaModels'
    | 'fireworksModels'
    | 'deepseekModels'
  >
>

export interface ProviderModelOption {
  id: string
  provider: ActiveProviderId
  displayName: string
}

export interface ResolvedProviderModelOption extends ProviderModelOption {
  model: ConfiguredModel
}

const OPENAI_COMPATIBLE_RETRY_POLICY: ProviderRetryPolicy = {
  maxRetries: 0,
  initialBackoffMs: 0,
  backoffMultiplier: 1,
  retryableStatusCodes: [],
}

const OPENROUTER_RETRY_POLICY: ProviderRetryPolicy = {
  maxRetries: 3,
  initialBackoffMs: 1500,
  backoffMultiplier: 2,
  retryableStatusCodes: [429, 502, 503, 529],
}

const PROVIDER_TOOL_MODEL_PREFIXES: Record<ProviderId, string[]> = {
  openrouter: [],
  fireworks: [],
  groq: [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'qwen/qwen3-32b',
    'moonshotai/kimi-k2-instruct-0905',
    'openai/gpt-oss-safeguard-20b',
  ],
  ollama: ['llama3.1', 'llama3.2', 'mistral', 'mixtral'],
  deepseek: [],
  alibaba: [
    'qwen-plus',
    'qwen-max',
    'qwen-turbo',
    'qwen-flash',
    'qwen3-max',
    'qwen3-max-preview',
    'qwen3.5-plus',
    'qwen3.5-flash',
    'qwen3.5-122b',
    'qwen3.5-27b',
    'qwen3.5-35b-a3b',
    'qwen3-32b',
    'qwen3-14b',
    'qwen3-8b',
    'qwen3-next-80b',
    'qwen3-235b',
    'qwen3-30b',
    'qwen3.5-397b',
    'qwen2.5-72b',
    'qwen2.5-32b',
    'qwen2.5-14b',
    'qwen2.5-7b',
    'qwq-plus',
    'qwen3-coder-plus',
    'qwen3-coder-flash',
  ],
  perplexity: [],
}

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434'
export const DEFAULT_ATTACHMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024
export const STREAM_UPDATE_INTERVAL_MS = 120
export const STREAM_RESEARCH_SAFETY_CAP = 50
export const STREAM_MAX_RESEARCH_ROUNDS = 8
export const TITLE_REVEAL_INTERVAL_MS = 24

const allowAllToolModels = (provider: ProviderId) =>
  provider === 'openrouter' || provider === 'fireworks' || provider === 'deepseek'

const supportsModelTools = (provider: ProviderId, model: string): boolean => {
  if (allowAllToolModels(provider)) return true

  const supportedModels = PROVIDER_TOOL_MODEL_PREFIXES[provider]
  if (!supportedModels || supportedModels.length === 0) return false

  return supportedModels.some((supported) => model.toLowerCase().includes(supported.toLowerCase()))
}

const providerEnabledByDefault = (_provider: ProviderId) => true

const hasProviderManuallyEnabled = (
  settings: ProviderSettingsLike,
  provider: ProviderId
): boolean => {
  const enabled = settings.providerEnabled?.[provider]
  if (enabled === undefined) return providerEnabledByDefault(provider)
  return enabled !== false
}

const hasConfiguredApiKey = (value?: string | null): boolean => Boolean(value?.trim())

const isConfiguredOllamaUrl = (value?: string | null): boolean => Boolean(value?.trim())

const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'OpenRouter provides access to many frontier models through one API.',
    accentColor: '#a855f7',
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsVisionUploads: true,
      supportsReasoning: true,
      supportsImageGeneration: true,
      supportsNativeSearch: false,
    },
    endpoints: {
      baseUrl: 'https://openrouter.ai/api/v1',
      chatCompletionsUrl: 'https://openrouter.ai/api/v1/chat/completions',
      modelCatalogUrl: 'https://openrouter.ai/api/v1/models',
    },
    retryPolicy: OPENROUTER_RETRY_POLICY,
    auth: {
      hasAccess: (settings) => Boolean(getOpenRouterApiKey(settings.openRouterApiKey)),
      getCredentialError: (settings) =>
        getOpenRouterApiKey(settings.openRouterApiKey)
          ? null
          : 'OpenRouter API key is required. Add it in Settings > Providers and save.',
    },
    models: {
      settingsModelKey: 'configuredModels',
      supportsTools: (model) => supportsModelTools('openrouter', model),
    },
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    description: 'Ultra-low-latency model inference for high-speed chat experiences.',
    accentColor: '#f97316',
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsVisionUploads: true,
      supportsReasoning: false,
      supportsImageGeneration: false,
      supportsNativeSearch: false,
    },
    endpoints: {
      baseUrl: 'https://api.groq.com/openai/v1',
      chatCompletionsUrl: 'https://api.groq.com/openai/v1/chat/completions',
    },
    retryPolicy: OPENAI_COMPATIBLE_RETRY_POLICY,
    auth: {
      hasAccess: (settings) => hasConfiguredApiKey(settings.groqApiKey),
      getCredentialError: (settings) =>
        hasConfiguredApiKey(settings.groqApiKey)
          ? null
          : 'Groq API key is required. Add it in Settings > Providers and save.',
    },
    models: {
      settingsModelKey: 'groqModels',
      supportsTools: (model) => supportsModelTools('groq', model),
    },
  },
  alibaba: {
    id: 'alibaba',
    label: 'Alibaba Cloud',
    description: 'Qwen models via DashScope API (Tongyi).',
    accentColor: '#ff6a00',
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsVisionUploads: true,
      supportsReasoning: true,
      supportsImageGeneration: false,
      supportsNativeSearch: false,
    },
    endpoints: {
      baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      chatCompletionsUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
      modelCatalogUrl: 'https://modelstudio.alibabacloud.com/',
    },
    retryPolicy: OPENAI_COMPATIBLE_RETRY_POLICY,
    auth: {
      hasAccess: (settings) => hasConfiguredApiKey(settings.alibabaApiKey),
      getCredentialError: (settings) =>
        hasConfiguredApiKey(settings.alibabaApiKey)
          ? null
          : 'Alibaba API key is required. Add it in Settings > Providers and save.',
    },
    models: {
      settingsModelKey: 'alibabaModels',
      supportsTools: (model) => supportsModelTools('alibaba', model),
    },
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek V4 Flash and V4 Pro with tool calling and optional thinking mode.',
    accentColor: '#4d6bfe',
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsVisionUploads: false,
      supportsReasoning: true,
      supportsImageGeneration: false,
      supportsNativeSearch: false,
    },
    endpoints: {
      baseUrl: 'https://api.deepseek.com',
      chatCompletionsUrl: 'https://api.deepseek.com/chat/completions',
      modelCatalogUrl: 'https://api.deepseek.com/models',
    },
    retryPolicy: OPENAI_COMPATIBLE_RETRY_POLICY,
    auth: {
      hasAccess: (settings) => hasConfiguredApiKey(settings.deepseekApiKey),
      getCredentialError: (settings) =>
        hasConfiguredApiKey(settings.deepseekApiKey)
          ? null
          : 'DeepSeek API key is required. Add it in Settings > Providers and save.',
    },
    models: {
      settingsModelKey: 'deepseekModels',
      supportsTools: (model) => supportsModelTools('deepseek', model),
    },
  },
  perplexity: {
    id: 'perplexity',
    label: 'Perplexity',
    description: 'Research-focused model provider with search-native reasoning models.',
    accentColor: '#22c55e',
    capabilities: {
      supportsStreaming: true,
      supportsTools: false,
      supportsVisionUploads: false,
      supportsReasoning: false,
      supportsImageGeneration: false,
      supportsNativeSearch: true,
    },
    endpoints: {
      baseUrl: 'https://api.perplexity.ai',
      chatCompletionsUrl: 'https://api.perplexity.ai/chat/completions',
      modelCatalogUrl: 'https://docs.perplexity.ai/api-reference/sonar-post',
    },
    retryPolicy: OPENAI_COMPATIBLE_RETRY_POLICY,
    auth: {
      hasAccess: (settings) => hasConfiguredApiKey(settings.perplexityApiKey),
      getCredentialError: (settings) =>
        hasConfiguredApiKey(settings.perplexityApiKey)
          ? null
          : 'Perplexity API key is required. Add it in Settings > Providers and save.',
    },
    models: {
      settingsModelKey: 'perplexityModels',
      supportsTools: () => false,
    },
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    description: 'Run local models privately on your machine with local networking.',
    accentColor: '#339af0',
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsVisionUploads: true,
      supportsReasoning: true,
      supportsImageGeneration: false,
      supportsNativeSearch: false,
    },
    endpoints: {
      baseUrl: DEFAULT_OLLAMA_URL,
      defaultLocalUrl: DEFAULT_OLLAMA_URL,
    },
    retryPolicy: OPENAI_COMPATIBLE_RETRY_POLICY,
    auth: {
      hasAccess: (settings) => isConfiguredOllamaUrl(settings.ollamaUrl),
      getCredentialError: (settings) =>
        isConfiguredOllamaUrl(settings.ollamaUrl)
          ? null
          : 'Ollama URL is required. Add it in Settings > Providers and save.',
    },
    models: {
      settingsModelKey: 'ollamaModels',
      supportsTools: (model) => supportsModelTools('ollama', model),
    },
  },
  fireworks: {
    id: 'fireworks',
    label: 'Fireworks',
    description: 'Fast inference platform with an official serverless model catalog.',
    accentColor: '#ef4444',
    capabilities: {
      supportsStreaming: true,
      supportsTools: true,
      supportsVisionUploads: false,
      supportsReasoning: false,
      supportsImageGeneration: false,
      supportsNativeSearch: false,
    },
    endpoints: {
      baseUrl: 'https://api.fireworks.ai/inference/v1',
      chatCompletionsUrl: 'https://api.fireworks.ai/inference/v1/chat/completions',
      modelCatalogUrl: 'https://api.fireworks.ai/v1/accounts/fireworks/models',
    },
    retryPolicy: OPENAI_COMPATIBLE_RETRY_POLICY,
    auth: {
      hasAccess: (settings) => hasConfiguredApiKey(settings.fireworksApiKey),
      getCredentialError: (settings) =>
        hasConfiguredApiKey(settings.fireworksApiKey)
          ? null
          : 'Fireworks API key is required. Add it in Settings > Providers and save.',
    },
    models: {
      settingsModelKey: 'fireworksModels',
      supportsTools: (model) => supportsModelTools('fireworks', model),
    },
  },
}

export function normalizeProviderId(provider: string | null | undefined): ProviderId {
  if (!provider) return 'openrouter'
  return Object.prototype.hasOwnProperty.call(PROVIDERS, provider)
    ? (provider as ProviderId)
    : 'openrouter'
}

export function normalizeActiveProviderId(provider: string | null | undefined): ActiveProviderId {
  return normalizeProviderId(provider)
}

export function getProviderDefinition(provider: string | null | undefined): ProviderDefinition {
  return PROVIDERS[normalizeProviderId(provider)]
}

export function getProviderDefinitions(): ProviderDefinition[] {
  return Object.values(PROVIDERS) as ProviderDefinition[]
}

export function getActiveProviderDefinitions(): ProviderDefinition[] {
  return getProviderDefinitions()
}

export function getActiveProviderIds(): ActiveProviderId[] {
  return getActiveProviderDefinitions().map((provider) => provider.id as ActiveProviderId)
}

export function getProviderEndpoint(
  provider: string | null | undefined,
  key: keyof ProviderEndpoints
): string | undefined {
  return getProviderDefinition(provider).endpoints[key]
}

export function getProviderRetryPolicy(provider: string | null | undefined): ProviderRetryPolicy {
  return getProviderDefinition(provider).retryPolicy
}

export function getProviderModels(
  settings: ProviderSettingsLike,
  provider: string | null | undefined
): ConfiguredModel[] {
  const modelKey = getProviderDefinition(provider).models.settingsModelKey
  const models = modelKey ? settings[modelKey] : undefined
  return Array.isArray(models) ? models : []
}

export function providerSupportsTools(provider: string | null | undefined): boolean {
  return getProviderDefinition(provider).capabilities.supportsTools
}

export function providerSupportsVisionUploads(provider: string | null | undefined): boolean {
  return getProviderDefinition(provider).capabilities.supportsVisionUploads
}

export function providerUsesNativeSearch(provider: string | null | undefined): boolean {
  return getProviderDefinition(provider).capabilities.supportsNativeSearch
}

export function modelSupportsTools(provider: string | null | undefined, model: string): boolean {
  return getProviderDefinition(provider).models.supportsTools(model)
}

export function hasProviderAccess(
  settings: ProviderSettingsLike,
  provider: string | null | undefined
): boolean {
  const normalized = normalizeProviderId(provider)
  if (!hasProviderManuallyEnabled(settings, normalized)) return false
  return getProviderDefinition(normalized).auth.hasAccess(settings)
}

export function getProviderCredentialError(
  settings: ProviderSettingsLike,
  provider?: string | null
): string | null {
  return getProviderDefinition(provider).auth.getCredentialError(settings)
}

export function getProviderAccentColor(provider: string | null | undefined): string {
  return getProviderDefinition(provider).accentColor
}

export function getAvailableModelOptions(settings: ProviderSettingsLike): ProviderModelOption[] {
  const models: ProviderModelOption[] = []

  for (const provider of getActiveProviderDefinitions()) {
    if (!hasProviderAccess(settings, provider.id)) continue

    getProviderModels(settings, provider.id)
      .filter((model) => model.enabled !== false)
      .forEach((model) => {
        models.push({
          id: model.code,
          provider: provider.id as ActiveProviderId,
          displayName: model.displayName,
        })
      })
  }

  return models
}

export function getAvailableTitleModelOptions(
  settings: ProviderSettingsLike
): ResolvedProviderModelOption[] {
  const models: ResolvedProviderModelOption[] = []

  for (const provider of getActiveProviderDefinitions()) {
    if (!hasProviderAccess(settings, provider.id)) continue

    const providerModels = getProviderModels(settings, provider.id).filter(
      (model): model is ConfiguredModel =>
        Boolean(model && typeof model.code === 'string' && model.code.trim().length > 0)
    )
    const enabledModels = providerModels.filter((model) => model.enabled !== false)
    const candidateModels = enabledModels.length > 0 ? enabledModels : providerModels

    for (const model of getTitleEligibleModels(candidateModels)) {
      models.push({
        id: model.code,
        provider: provider.id as ActiveProviderId,
        displayName: model.displayName,
        model,
      })
    }
  }

  return models
}

export function resolveProviderForModel(
  settings: ProviderSettingsLike,
  modelCode: string
): ResolvedProviderModelOption | null {
  const normalizedCode = modelCode.trim()
  if (!normalizedCode) return null

  return (
    getAvailableTitleModelOptions(settings).find((option) => option.id.trim() === normalizedCode) ?? null
  )
}
