import { ProviderError, toProviderError } from '@zura/provider-core'
import type { SettingsConfig } from '../contexts/SettingsConfigContext'
import { getProviderRetryPolicy, resolveProviderForModel } from './providerRegistry'
import type { ActiveProviderId } from './providerTypes'
import type {
  NormalizedStreamEvent,
  ProviderRuntimeSettings,
  ProviderRuntimeStreamRequest,
} from './providerRuntimeTypes'
import {
  extractTitleTextFromMessage,
  getProviderRuntimeAdapter,
  providerRuntimeAdapters,
  type LightweightGenerationOptions,
  type ProviderRuntimeAdapter,
  type TitleGenerationSettings,
} from './runtimeAdapters'

export { extractTitleTextFromMessage, getProviderRuntimeAdapter, providerRuntimeAdapters }
export type { LightweightGenerationOptions, ProviderRuntimeAdapter }

async function generateProviderTextThroughMain(
  settings: TitleGenerationSettings,
  provider: ActiveProviderId,
  model: string,
  prompt: string,
  options: LightweightGenerationOptions
): Promise<string> {
  const bridge = window.providerRuntime
  if (!bridge) throw new Error('The provider runtime bridge is unavailable in Electron.')
  const requestId = crypto.randomUUID()
  const cancel = () => void bridge.cancel(requestId)
  if (options.signal?.aborted)
    throw options.signal.reason ?? new DOMException('Aborted', 'AbortError')
  options.signal?.addEventListener('abort', cancel, { once: true })
  try {
    return await bridge.generate({
      requestId,
      provider,
      model,
      prompt,
      maxTokens: options.maxTokens,
      jsonMode: options.jsonMode,
      ollamaUrl: settings.ollamaUrl,
      alibabaRegion: settings.alibabaRegion,
    })
  } finally {
    options.signal?.removeEventListener('abort', cancel)
    void bridge.cancel(requestId)
  }
}

export async function generateProviderTitleText(
  settings: TitleGenerationSettings,
  provider: ActiveProviderId,
  model: string,
  prompt: string,
  options: LightweightGenerationOptions = {}
): Promise<string> {
  if (typeof window !== 'undefined' && window.providerRuntime) {
    return generateProviderTextThroughMain(settings, provider, model, prompt, options)
  }
  if (typeof window !== 'undefined' && window.ipcRenderer) {
    throw new Error('The provider runtime bridge is unavailable in Electron.')
  }
  return getProviderRuntimeAdapter(provider).generateTitle({ settings, model, prompt, options })
}

export async function generateTitleTextForModel(
  settings: TitleGenerationSettings &
    Partial<
      Pick<
        SettingsConfig,
        | 'configuredModels'
        | 'ollamaModels'
        | 'groqModels'
        | 'nvidiaModels'
        | 'alibabaModels'
        | 'codexModels'
        | 'fireworksModels'
        | 'deepseekModels'
        | 'opencodeModels'
      >
    >,
  model: string,
  prompt: string,
  options: LightweightGenerationOptions = {}
): Promise<string> {
  const resolved = resolveProviderForModel(settings, model)
  if (!resolved) throw new Error('Title model not found')
  return generateProviderTitleText(settings, resolved.provider, resolved.id, prompt, options)
}

function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }
    const timeout = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout)
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}

export async function* streamProviderEvents(
  settings: ProviderRuntimeSettings,
  request: ProviderRuntimeStreamRequest
): AsyncGenerator<NormalizedStreamEvent, void, unknown> {
  const policy = getProviderRetryPolicy(request.provider)
  const maxRetries = request.provider === 'openrouter' ? 0 : policy.maxRetries
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let emitted = false
    try {
      for await (const event of getProviderRuntimeAdapter(request.provider).stream({
        settings,
        request,
      })) {
        emitted = true
        yield event
      }
      return
    } catch (error) {
      const providerError = toProviderError(error, request.provider)
      const canRetry =
        !emitted && !request.signal?.aborted && providerError.retryable && attempt < maxRetries
      if (!canRetry) {
        if (emitted && providerError instanceof ProviderError) {
          throw new ProviderError({
            ...providerError.serialize(),
            partialResponse: true,
            cause: providerError,
          })
        }
        throw providerError
      }
      const exponential = policy.initialBackoffMs * Math.pow(policy.backoffMultiplier, attempt)
      const jittered = Math.round(exponential * (0.8 + Math.random() * 0.4))
      await waitForRetry(Math.min(providerError.retryAfterMs ?? jittered, 30_000), request.signal)
    }
  }
}
