import type { ActiveProviderId } from '../providerTypes'
import { alibabaAdapter } from './alibaba'
import { codexAdapter } from './codex'
import { deepseekAdapter } from './deepseek'
import { fireworksAdapter } from './fireworks'
import { groqAdapter } from './groq'
import { nvidiaAdapter } from './nvidia'
import { ollamaAdapter } from './ollama'
import { opencodeAdapter } from './opencode'
import { openrouterAdapter } from './openrouter'
import type { ProviderRuntimeAdapter } from './types'

export const providerRuntimeAdapters = {
  alibaba: alibabaAdapter,
  codex: codexAdapter,
  deepseek: deepseekAdapter,
  fireworks: fireworksAdapter,
  groq: groqAdapter,
  nvidia: nvidiaAdapter,
  ollama: ollamaAdapter,
  opencode: opencodeAdapter,
  openrouter: openrouterAdapter,
} satisfies { [P in ActiveProviderId]: ProviderRuntimeAdapter<P> }

export function getProviderRuntimeAdapter<P extends ActiveProviderId>(
  provider: P
): ProviderRuntimeAdapter<P> {
  return providerRuntimeAdapters[provider] as ProviderRuntimeAdapter<P>
}

export type {
  LightweightGenerationOptions,
  ProviderRuntimeAdapter,
  TitleGenerationSettings,
} from './types'
export { extractTitleTextFromMessage } from './shared'
