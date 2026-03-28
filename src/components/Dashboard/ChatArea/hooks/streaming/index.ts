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
  ProviderStreamingOptions,
  ToolCallingOptions,
  OpenRouterStreamingOptions,
  UpdateStreamingCallback,
  FlushCallback,
  ToolCallingHook,
  StreamingSettings,
} from './types'

// Provider-specific streaming hooks
export { useOllamaStreaming } from './useOllamaStreaming'
export type { UseOllamaStreamingOptions, UseOllamaStreamingReturn } from './useOllamaStreaming'

export { usePerplexityStreaming } from './usePerplexityStreaming'
export type {
  UsePerplexityStreamingOptions,
  UsePerplexityStreamingReturn,
} from './usePerplexityStreaming'

export { useGroqStreaming } from './useGroqStreaming'
export type { UseGroqStreamingOptions, UseGroqStreamingReturn } from './useGroqStreaming'

export { useOpenRouterStreaming } from './useOpenRouterStreaming'
export type {
  UseOpenRouterStreamingOptions,
  UseOpenRouterStreamingReturn,
} from './useOpenRouterStreaming'

export { useAlibabaStreaming } from './useAlibabaStreaming'
export type { UseAlibabaStreamingOptions, UseAlibabaStreamingReturn } from './useAlibabaStreaming'

export { useFireworksStreaming } from './useFireworksStreaming'
export type { UseFireworksStreamingOptions, UseFireworksStreamingReturn } from './useFireworksStreaming'

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
