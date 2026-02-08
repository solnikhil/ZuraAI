/**
 * Provider-specific streaming hooks barrel export
 * 
 * These hooks extract provider-specific streaming logic from useStreamingChat
 * to reduce complexity and improve maintainability.
 * 
 * Requirements: 5.4 - Refactor useStreamingChat into smaller, focused hooks
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
export type { UsePerplexityStreamingOptions, UsePerplexityStreamingReturn } from './usePerplexityStreaming'

export { useGeminiStreaming } from './useGeminiStreaming'
export type { UseGeminiStreamingOptions, UseGeminiStreamingReturn } from './useGeminiStreaming'

export { useGroqStreaming } from './useGroqStreaming'
export type { UseGroqStreamingOptions, UseGroqStreamingReturn } from './useGroqStreaming'

export { useMiniMaxStreaming } from './useMiniMaxStreaming'
export type { UseMiniMaxStreamingOptions, UseMiniMaxStreamingReturn } from './useMiniMaxStreaming'

export { useOpenRouterStreaming } from './useOpenRouterStreaming'
export type { UseOpenRouterStreamingOptions, UseOpenRouterStreamingReturn } from './useOpenRouterStreaming'

// Tool calling hook for streaming
export { useStreamingToolCalls } from './useStreamingToolCalls'
export type {
  UseStreamingToolCallsOptions,
  UseStreamingToolCallsReturn,
  ToolCallAccumulatorItem,
  ToolCallAccumulatorState,
  ToolCallProcessingResult,
  ResearchStatus,
  ProcessToolCallsOptions,
  ProcessToolCallsResult,
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
