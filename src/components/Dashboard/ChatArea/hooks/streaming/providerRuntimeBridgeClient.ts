import { ProviderError } from '@zura/provider-core'
import type {
  ProviderRuntimeBridgeEvent,
  ProviderRuntimeStartRequest,
} from '../../../../../electron/types'
import type { NormalizedStreamEvent } from './types'

function deserializeProviderError(
  error: Extract<ProviderRuntimeBridgeEvent, { type: 'error' }>['error']
): ProviderError {
  return new ProviderError(error)
}

export async function* streamProviderEventsThroughMain(
  request: Omit<ProviderRuntimeStartRequest, 'requestId'>,
  signal?: AbortSignal
): AsyncGenerator<NormalizedStreamEvent, void, unknown> {
  if (!window.providerRuntime) {
    throw new Error('The main-process provider runtime bridge is unavailable.')
  }
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Secure provider request identifiers are unavailable.')
  }

  const requestId = globalThis.crypto.randomUUID()
  const queue: ProviderRuntimeBridgeEvent[] = []
  let wake: (() => void) | null = null
  let terminal = false

  const unsubscribe = window.providerRuntime.onEvent((event) => {
    if (event.requestId !== requestId || terminal) return
    queue.push(event)
    wake?.()
    wake = null
  })
  const wakeOnAbort = () => {
    wake?.()
    wake = null
  }
  signal?.addEventListener('abort', wakeOnAbort, { once: true })

  try {
    if (signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError')
    await window.providerRuntime.start({ ...request, requestId })

    while (!terminal) {
      if (signal?.aborted) {
        await window.providerRuntime.cancel(requestId)
        throw new DOMException('The request was aborted.', 'AbortError')
      }
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve
        })
        continue
      }

      const next = queue.shift()!
      if (next.type === 'event') {
        yield next.event
      } else if (next.type === 'error') {
        terminal = true
        throw deserializeProviderError(next.error)
      } else {
        terminal = true
      }
    }
  } finally {
    terminal = true
    signal?.removeEventListener('abort', wakeOnAbort)
    unsubscribe()
    await window.providerRuntime.cancel(requestId).catch(() => false)
  }
}
