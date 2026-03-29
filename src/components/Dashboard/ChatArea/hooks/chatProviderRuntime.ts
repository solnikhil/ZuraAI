import type { SettingsConfig } from '../../../../contexts/SettingsConfigContext'
import {
  getAvailableModelOptions as getRegistryModelOptions,
  getProviderCredentialError as getRegistryCredentialError,
  normalizeActiveProviderId,
  type ActiveProviderId,
  type ProviderModelOption,
  type ProviderSettingsLike,
} from '../../../../providers'

export type ChatModelProvider = SettingsConfig['modelProvider']

type ModelOptionSource = ProviderSettingsLike

export interface ModelOption extends ProviderModelOption {
  provider: ActiveProviderId
}

export function resolveChatProvider(provider: string): ActiveProviderId {
  return normalizeActiveProviderId(provider)
}

export function getProviderCredentialError(
  settings: Pick<
    SettingsConfig,
    | 'modelProvider'
    | 'openRouterApiKey'
    | 'perplexityApiKey'
    | 'groqApiKey'
    | 'alibabaApiKey'
    | 'fireworksApiKey'
    | 'ollamaUrl'
  >
): string | null {
  return getRegistryCredentialError(settings, settings.modelProvider)
}

export function getAvailableModelOptions(settings: ModelOptionSource): ModelOption[] {
  return getRegistryModelOptions(settings)
}
