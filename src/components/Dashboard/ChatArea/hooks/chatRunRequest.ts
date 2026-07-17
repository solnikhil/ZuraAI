import type { Settings } from '../../../../contexts/settingsStore'
import { normalizeActiveProviderId } from '../../../../providers'
import type { ContextOptimizationTrace } from '../../../../utils/tokenUtils'
import { buildProviderRunCapabilities, buildStreamingSettings } from './streaming/chatRunConfig'
import type { ProviderStreamingMessages } from './streaming/providerStreamingSupport'
import type { ProviderStreamingRunOptions } from './streaming/useProviderStreaming'
import type { ChatRunController } from './chatRunController'

export interface BuildChatRunRequestOptions {
  run: ChatRunController
  settings: Settings
  sessionId: string
  messageId: string
  messages: ProviderStreamingMessages
  contextTrace?: ContextOptimizationTrace
  providerStartTime?: number
  researchMaxRounds: number
  forceWebSearch?: boolean
  enableTools: boolean
  syncToStreamingContext: boolean
  includeImageModalities?: boolean
  toolEventCallbacks?: ProviderStreamingRunOptions['toolEventCallbacks']
}

/** Shared request builder for send and regenerate runs. */
export function buildChatRunRequest({
  run,
  settings,
  includeImageModalities,
  ...options
}: BuildChatRunRequestOptions): ProviderStreamingRunOptions {
  return {
    runId: run.id,
    provider: normalizeActiveProviderId(settings.modelProvider),
    model: settings.aiModel,
    settingsOverride: buildStreamingSettings(settings),
    sessionId: options.sessionId,
    messageId: options.messageId,
    messages: options.messages,
    contextTrace: options.contextTrace,
    startTime: options.providerStartTime ?? run.startedAt,
    researchMaxRounds: options.researchMaxRounds,
    forceWebSearch: options.forceWebSearch,
    signal: run.signal,
    enableTools: options.enableTools,
    syncToStreamingContext: options.syncToStreamingContext,
    ...buildProviderRunCapabilities(settings, { includeImageModalities }),
    toolEventCallbacks: options.toolEventCallbacks,
  }
}
