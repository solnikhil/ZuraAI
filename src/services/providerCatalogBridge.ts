import type { ActiveProviderId } from '../providers/providerTypes'

export async function listProviderModelsThroughMain<T>(
  provider: ActiveProviderId,
  signal?: AbortSignal,
  options?: { ollamaUrl?: string }
): Promise<T[] | null> {
  if (typeof window === 'undefined' || !window.providerRuntime) return null
  const requestId = crypto.randomUUID()
  const cancel = () => void window.providerRuntime?.cancel(requestId)
  if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    return (await window.providerRuntime.listModels({ requestId, provider, ...options })) as T[]
  } finally {
    signal?.removeEventListener('abort', cancel)
    void window.providerRuntime.cancel(requestId)
  }
}
