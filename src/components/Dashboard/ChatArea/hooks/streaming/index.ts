/**
 * Provider-specific streaming hooks barrel export
 *
 * These hooks extract provider-specific streaming logic from useStreamingChat
 * to reduce complexity and improve maintainability.
 *
 */

// Types
export type {
  StreamingResult,
  NormalizedStreamEvent,
  NormalizedToolCallDelta,
  NormalizedUsage,
  ProviderStreamClient,
  StreamRequest,
  UpdateStreamingCallback,
  ToolCallingHook,
  StreamingSettings,
} from './types'

export { createProviderStreamClient } from './providerStreamClient'
export { useProviderStreaming } from './useProviderStreaming'
export { formatProviderStreamError } from './streamErrorUtils'
export type {
  ProviderStreamingRunOptions,
  UseProviderStreamingOptions,
  UseProviderStreamingReturn,
} from './useProviderStreaming'

// Tool calling hook for streaming
export { useStreamingToolCalls } from './useStreamingToolCalls'
export type {
  UseStreamingToolCallsOptions,
  UseStreamingToolCallsReturn,
  ToolCallProcessingResult,
} from './useStreamingToolCalls'

// Research mode hook for streaming
export { useResearchMode } from './useResearchMode'
export type {
  UseResearchModeOptions,
  UseResearchModeReturn,
  ResearchModeState,
  ResearchModeConfig,
  ResearchModeSettings,
} from './useResearchMode'
