import type { ActiveProviderId } from '../../../../../providers'
import { streamProviderEvents } from '../../../../../providers/providerRuntime'
import type { ProviderStreamClient, StreamRequest, StreamingSettings } from './types'

export function createProviderStreamClient(
  settings: StreamingSettings,
  provider: ActiveProviderId
): ProviderStreamClient {
  return {
    stream(request: StreamRequest) {
      return streamProviderEvents(settings, { ...request, provider })
    },
  }
}
