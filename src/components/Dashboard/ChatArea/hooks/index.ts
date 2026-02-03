/**
 * ChatArea hooks barrel export
 */

export { useStreamingChat } from './useStreamingChat'
export type { UseStreamingChatOptions, UseStreamingChatReturn } from './useStreamingChat'

export { useIsolatedStreaming } from './useIsolatedStreaming'

// Provider-specific streaming hooks (Requirements: 5.4)
export {
  useOllamaStreaming,
  usePerplexityStreaming,
  useGeminiStreaming,
  useGroqStreaming,
  useMiniMaxStreaming,
  useOpenRouterStreaming,
} from './streaming'

export type {
  StreamingResult,
  ProviderStreamingOptions,
  ToolCallingOptions,
  OpenRouterStreamingOptions,
  UpdateStreamingCallback,
  FlushCallback,
  ToolCallingHook,
  StreamingSettings,
} from './streaming'
