import { getProviderDefinitions, type ProviderModelListKey } from './providerRegistry'
import type { ProviderId } from './providerTypes'

export type ProviderSecretField =
  | 'openRouterApiKey'
  | 'perplexityApiKey'
  | 'groqApiKey'
  | 'alibabaApiKey'
  | 'fireworksApiKey'
  | 'nvidiaApiKey'
  | 'deepseekApiKey'
  | 'opencodeGoApiKey'

export type ProviderCatalogDialogKind =
  | 'openrouter'
  | 'alibaba'
  | 'fireworks'
  | 'nvidia'
  | 'perplexity'
  | 'deepseek'
  | 'opencode'

export interface ProviderSettingsDefinition {
  id: ProviderId
  label: string
  description: string
  accentColor: string
  baseUrl?: string
  secretKeyField?: ProviderSecretField
  modelListField?: ProviderModelListKey
  enabledByDefault: boolean
  dashboardUrl?: string
  settingsVisible: boolean
  pickerVisible: boolean
  logoVisible: boolean
  supportsCatalogDialog: boolean
  catalogDialogKind?: ProviderCatalogDialogKind
  settingsOrder: number
  pickerOrder: number
}

const PROVIDER_SETTINGS_EXTRAS: Record<
  ProviderId,
  Omit<ProviderSettingsDefinition, 'label' | 'description' | 'accentColor' | 'baseUrl'>
> = {
  openrouter: {
    id: 'openrouter',
    secretKeyField: 'openRouterApiKey',
    modelListField: 'configuredModels',
    enabledByDefault: true,
    dashboardUrl: 'https://openrouter.ai/settings/keys',
    settingsVisible: true,
    pickerVisible: true,
    logoVisible: true,
    supportsCatalogDialog: true,
    catalogDialogKind: 'openrouter',
    settingsOrder: 0,
    pickerOrder: 0,
  },
  groq: {
    id: 'groq',
    secretKeyField: 'groqApiKey',
    modelListField: 'groqModels',
    enabledByDefault: true,
    dashboardUrl: 'https://console.groq.com/keys',
    settingsVisible: true,
    pickerVisible: true,
    logoVisible: true,
    supportsCatalogDialog: false,
    settingsOrder: 1,
    pickerOrder: 3,
  },
  alibaba: {
    id: 'alibaba',
    secretKeyField: 'alibabaApiKey',
    modelListField: 'alibabaModels',
    enabledByDefault: true,
    dashboardUrl: 'https://dashscope.console.aliyun.com/apiKey',
    settingsVisible: true,
    pickerVisible: true,
    logoVisible: true,
    supportsCatalogDialog: true,
    catalogDialogKind: 'alibaba',
    settingsOrder: 2,
    pickerOrder: 5,
  },
  deepseek: {
    id: 'deepseek',
    secretKeyField: 'deepseekApiKey',
    modelListField: 'deepseekModels',
    enabledByDefault: true,
    dashboardUrl: 'https://platform.deepseek.com/api_keys',
    settingsVisible: true,
    pickerVisible: true,
    logoVisible: true,
    supportsCatalogDialog: true,
    catalogDialogKind: 'deepseek',
    settingsOrder: 3,
    pickerOrder: 1,
  },
  perplexity: {
    id: 'perplexity',
    secretKeyField: 'perplexityApiKey',
    modelListField: 'perplexityModels',
    enabledByDefault: true,
    dashboardUrl: 'https://www.perplexity.ai/settings/api',
    settingsVisible: true,
    pickerVisible: true,
    logoVisible: true,
    supportsCatalogDialog: true,
    catalogDialogKind: 'perplexity',
    settingsOrder: 4,
    pickerOrder: 2,
  },
  ollama: {
    id: 'ollama',
    modelListField: 'ollamaModels',
    enabledByDefault: true,
    dashboardUrl: 'https://ollama.com/download',
    settingsVisible: true,
    pickerVisible: true,
    logoVisible: true,
    supportsCatalogDialog: false,
    settingsOrder: 5,
    pickerOrder: 6,
  },
  fireworks: {
    id: 'fireworks',
    secretKeyField: 'fireworksApiKey',
    modelListField: 'fireworksModels',
    enabledByDefault: true,
    dashboardUrl: 'https://fireworks.ai/account/api-keys',
    settingsVisible: true,
    pickerVisible: true,
    logoVisible: true,
    supportsCatalogDialog: true,
    catalogDialogKind: 'fireworks',
    settingsOrder: 6,
    pickerOrder: 4,
  },
  nvidia: {
    id: 'nvidia',
    secretKeyField: 'nvidiaApiKey',
    modelListField: 'nvidiaModels',
    enabledByDefault: true,
    dashboardUrl: 'https://build.nvidia.com/settings/api-keys',
    settingsVisible: true,
    pickerVisible: true,
    logoVisible: true,
    supportsCatalogDialog: true,
    catalogDialogKind: 'nvidia',
    settingsOrder: 7,
    pickerOrder: 7,
  },
  opencode: {
    id: 'opencode',
    secretKeyField: 'opencodeGoApiKey',
    modelListField: 'opencodeModels',
    enabledByDefault: true,
    dashboardUrl: 'https://opencode.ai/go',
    settingsVisible: true,
    pickerVisible: true,
    logoVisible: true,
    supportsCatalogDialog: true,
    catalogDialogKind: 'opencode',
    settingsOrder: 8,
    pickerOrder: 8,
  },
}

const PROVIDER_SETTINGS_DEFINITIONS: ProviderSettingsDefinition[] = getProviderDefinitions()
  .map((provider) => {
    const extras = PROVIDER_SETTINGS_EXTRAS[provider.id]
    return {
      label: provider.label,
      description: provider.description,
      accentColor: provider.accentColor,
      baseUrl: provider.endpoints.baseUrl,
      ...extras,
    }
  })
  .sort((left, right) => left.settingsOrder - right.settingsOrder)

export function getProviderSettingsDefinitions(): ProviderSettingsDefinition[] {
  return PROVIDER_SETTINGS_DEFINITIONS
}

export function getProviderSettingsDefinition(
  providerId: ProviderId
): ProviderSettingsDefinition | undefined {
  return PROVIDER_SETTINGS_DEFINITIONS.find((provider) => provider.id === providerId)
}

export function getSettingsVisibleProviders(): ProviderSettingsDefinition[] {
  return PROVIDER_SETTINGS_DEFINITIONS.filter((provider) => provider.settingsVisible)
}

export function getPickerVisibleProviders(): ProviderSettingsDefinition[] {
  return [...PROVIDER_SETTINGS_DEFINITIONS]
    .filter((provider) => provider.pickerVisible)
    .sort((left, right) => left.pickerOrder - right.pickerOrder)
}

export function getLogoVisibleProviderIds(): ProviderId[] {
  return PROVIDER_SETTINGS_DEFINITIONS.filter((provider) => provider.logoVisible).map(
    (provider) => provider.id
  )
}

export function getProviderSecretFields(): ProviderSecretField[] {
  return PROVIDER_SETTINGS_DEFINITIONS.flatMap((provider) =>
    provider.secretKeyField ? [provider.secretKeyField] : []
  )
}

export function getProviderModelListField(
  providerId: ProviderId
): ProviderModelListKey | undefined {
  return getProviderSettingsDefinition(providerId)?.modelListField
}

export function getProviderModelListFields(): ProviderModelListKey[] {
  return PROVIDER_SETTINGS_DEFINITIONS.flatMap((provider) =>
    provider.modelListField ? [provider.modelListField] : []
  )
}

export function getProviderDashboardUrl(providerId: ProviderId): string | undefined {
  return getProviderSettingsDefinition(providerId)?.dashboardUrl
}

export function getProviderEnabledDefaults(): Partial<Record<ProviderId, boolean>> {
  return Object.fromEntries(
    PROVIDER_SETTINGS_DEFINITIONS.map((provider) => [provider.id, provider.enabledByDefault])
  ) as Partial<Record<ProviderId, boolean>>
}
