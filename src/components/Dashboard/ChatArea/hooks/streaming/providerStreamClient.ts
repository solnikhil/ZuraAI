import type { ActiveProviderId } from '../../../../../providers'
import { streamProviderEvents } from '../../../../../providers/providerRuntime'
import type { ProviderStreamClient, StreamRequest, StreamingSettings } from './types'
import { streamProviderEventsThroughMain } from './providerRuntimeBridgeClient'

export function createProviderStreamClient(
  settings: StreamingSettings,
  provider: ActiveProviderId
): ProviderStreamClient {
  return {
    stream(request: StreamRequest) {
      if (typeof window !== 'undefined' && window.providerRuntime) {
        const { signal, ...serializableRequest } = request
        return streamProviderEventsThroughMain(
          {
            ...serializableRequest,
            provider,
            ollamaUrl: settings.ollamaUrl,
            alibabaRegion: settings.alibabaRegion,
            openRouterDebug: settings.openRouterDebug,
          },
          signal
        )
      }
      if (typeof window !== 'undefined' && window.ipcRenderer) {
        throw new Error('The provider runtime bridge is unavailable in Electron.')
      }
      return streamProviderEvents(settings, { ...request, provider })
    },
  }
}
