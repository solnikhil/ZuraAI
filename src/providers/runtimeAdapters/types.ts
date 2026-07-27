import type { ChatMessage } from '../../services/types'
import type { ActiveProviderId } from '../providerTypes'
import type {
  NormalizedStreamEvent,
  ProviderRuntimeSettings,
  ProviderRuntimeStreamRequest,
} from '../providerRuntimeTypes'

export type TitleGenerationSettings = Pick<
  ProviderRuntimeSettings,
  | 'alibabaApiKey'
  | 'alibabaRegion'
  | 'deepseekApiKey'
  | 'opencodeGoApiKey'
  | 'fireworksApiKey'
  | 'groqApiKey'
  | 'nvidiaApiKey'
  | 'ollamaUrl'
  | 'openRouterApiKey'
>

export interface LightweightGenerationOptions {
  signal?: AbortSignal
  maxTokens?: number
  jsonMode?: boolean
}

export interface ProviderRuntimeAdapterContext {
  settings: TitleGenerationSettings
  model: string
  prompt: string
  options: LightweightGenerationOptions
}

export interface ProviderRuntimeStreamContext {
  settings: ProviderRuntimeSettings
  request: ProviderRuntimeStreamRequest
}

export interface ProviderRuntimeAdapter<P extends ActiveProviderId = ActiveProviderId> {
  readonly provider: P
  generateTitle(context: ProviderRuntimeAdapterContext): Promise<string>
  stream(
    context: ProviderRuntimeStreamContext
  ): AsyncGenerator<NormalizedStreamEvent, void, unknown>
}

export function titleMessages(prompt: string): ChatMessage[] {
  return [{ role: 'user', content: prompt }]
}
