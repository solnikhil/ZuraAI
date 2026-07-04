/**
 * ChatArea hooks barrel export
 */

export { useStreamingChat } from './useStreamingChat'
export type { UseStreamingChatOptions, UseStreamingChatReturn } from './useStreamingChat'

export { useIsolatedStreaming } from './useIsolatedStreaming'

export { usePromptAutoHide } from './usePromptAutoHide'
export type { UsePromptAutoHideOptions, UsePromptAutoHideReturn } from './usePromptAutoHide'

export { createProviderStreamClient, useProviderStreaming } from './streaming'

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
} from './streaming'
