import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import {
  getProviderModelListField,
  getSettingsVisibleProviders,
  type ProviderId,
  type ProviderModelListKey,
  type ProviderSecretField,
} from '@/providers'

export interface ProviderHubDefinition {
  key: ProviderId
  name: string
  description: string
  apiKeyField?: ProviderSecretField
  supportsCatalogDialog: boolean
  setupKind: 'api-key' | 'account' | 'local'
}

export const PROVIDER_HUB_DEFINITIONS: readonly ProviderHubDefinition[] =
  getSettingsVisibleProviders().map((provider) => ({
    key: provider.id,
    name: provider.label,
    description: provider.description,
    apiKeyField: provider.secretKeyField,
    supportsCatalogDialog: provider.supportsCatalogDialog,
    setupKind: provider.setupKind,
  }))

export interface ProviderModelCollections {
  configuredModels: ConfiguredModel[]
  codexModels: ConfiguredModel[]
  groqModels: ConfiguredModel[]
  alibabaModels: ConfiguredModel[]
  deepseekModels: ConfiguredModel[]
  opencodeModels: ConfiguredModel[]
  fireworksModels: ConfiguredModel[]
  nvidiaModels: ConfiguredModel[]
  ollamaModels: ConfiguredModel[]
}

export type ProviderModelMap = Record<ProviderId, ConfiguredModel[]>

export type ProviderModelSettingsUpdate = Partial<Record<ProviderModelListKey, ConfiguredModel[]>>

export type BrowserConnectivityDescriptor =
  | { kind: 'bearer-get'; path: string; failurePrefix: string }
  | { kind: 'chat-completions'; failurePrefix: string }
  | { kind: 'unsupported' }

const BROWSER_CONNECTIVITY: Record<ProviderId, BrowserConnectivityDescriptor> = {
  openrouter: { kind: 'bearer-get', path: '/auth/key', failurePrefix: 'OpenRouter auth failed' },
  groq: { kind: 'bearer-get', path: '/models', failurePrefix: 'Groq check failed' },
  alibaba: { kind: 'chat-completions', failurePrefix: 'Alibaba Cloud check failed' },
  fireworks: { kind: 'chat-completions', failurePrefix: 'Fireworks check failed' },
  deepseek: { kind: 'chat-completions', failurePrefix: 'DeepSeek check failed' },
  opencode: { kind: 'chat-completions', failurePrefix: 'OpenCode Go check failed' },
  nvidia: { kind: 'chat-completions', failurePrefix: 'NVIDIA NIM check failed' },
  codex: { kind: 'unsupported' },
  ollama: { kind: 'unsupported' },
}

export function createProviderModelMap(collections: ProviderModelCollections): ProviderModelMap {
  return {
    openrouter: collections.configuredModels,
    codex: collections.codexModels,
    groq: collections.groqModels,
    alibaba: collections.alibabaModels,
    deepseek: collections.deepseekModels,
    opencode: collections.opencodeModels,
    fireworks: collections.fireworksModels,
    nvidia: collections.nvidiaModels,
    ollama: collections.ollamaModels,
  }
}

export function buildProviderModelUpdate(
  provider: ProviderId,
  models: ConfiguredModel[]
): ProviderModelSettingsUpdate {
  const field = getProviderModelListField(provider)
  if (!field) throw new Error(`Provider ${provider} does not define a model-list setting`)
  return { [field]: models }
}

export function getBrowserConnectivityDescriptor(
  provider: ProviderId
): BrowserConnectivityDescriptor {
  return BROWSER_CONNECTIVITY[provider]
}
