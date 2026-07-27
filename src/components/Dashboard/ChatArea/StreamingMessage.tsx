/**
 * Renders the active assistant message from the isolated streaming store.
 */

import { memo, useMemo } from 'react'
import { useMessageStreamingState, type StreamingPhase } from '../../../contexts/StreamingContext'
import { MessageRenderer } from './MessageRenderer'
import type {
  Message,
  ToolCallResult,
  ThinkingBlock,
  ResponseVersion,
} from '../../../contexts/ChatHistoryContext'
import type { AgentRun } from '../../../chat/types'
import { getAgentRunMemoKey } from './agentRunMemo'

interface StreamingMessageProps {
  /** The base message from the session (may have stale content during streaming) */
  message: Message & {
    thinking?: string
    thinkingDuration?: number
    thinkingBlocks?: ThinkingBlock[]
    researchStatus?: {
      currentRound: number
      maxRounds: number
      currentSearch?: string
      currentSearches?: string[]
      isSearching: boolean
    }
    researchPlan?: {
      topic: string
      steps: Array<{ stepNumber: number; query: string; rationale?: string }>
    }
    researchProgress?: { currentStep: number; totalSteps: number; currentQuery?: string }
    responseVersions?: ResponseVersion[]
    currentVersionIndex?: number
    toolResults?: ToolCallResult[]
    agentRun?: AgentRun
  }
  /** Session ID for checking streaming state */
  sessionId: string
  /** Active tool calls during streaming (for in-message tool calling animation) */
  activeToolCalls?: Array<{ name: string; arguments?: Record<string, unknown> }>
  /** Ephemeral streaming phase for the active message */
  streamPhase?: StreamingPhase
  /** Stops the active Agent run. */
  onStop?: () => void
  /** Callback when content is copied */
  onCopy?: (content: string) => void
  /** Callback when regenerate is requested */
  onRegenerate?: (instruction: string) => void
}

/**
 * StreamingMessage - Renders a message that may be actively streaming
 *
 * This component checks if the message is currently streaming and merges
 * the streaming state with the base message. It subscribes to StreamingContext
 * for streaming updates, isolating re-renders from the main message list.
 *
 * The component is memoized to prevent unnecessary re-renders when parent
 * components re-render with unchanged props.
 */
function StreamingMessageComponent({
  message,
  sessionId,
  activeToolCalls,
  onStop,
  onCopy,
  onRegenerate,
}: StreamingMessageProps) {
  // Subscribe to streaming state for this specific message
  // This will cause re-renders only when this message's streaming state changes
  const streamingState = useMessageStreamingState(sessionId, message.id)

  // Merge streaming state with base message
  // If streaming, use streaming content; otherwise use base message content
  const displayMessage = useMemo(() => {
    if (!streamingState) {
      // Not streaming - return base message as-is
      return message
    }

    const hasStreamingField = <K extends keyof typeof streamingState>(key: K) =>
      Object.prototype.hasOwnProperty.call(streamingState, key)

    // Streaming - merge streaming state with base message
    return {
      ...message,
      content: streamingState.content || message.content,
      thinking: hasStreamingField('thinking') ? streamingState.thinking : message.thinking,
      thinkingDuration: hasStreamingField('thinkingDuration')
        ? streamingState.thinkingDuration
        : message.thinkingDuration,
      thinkingBlocks: hasStreamingField('thinkingBlocks')
        ? streamingState.thinkingBlocks
        : message.thinkingBlocks,
      researchStatus: hasStreamingField('researchStatus')
        ? streamingState.researchStatus
        : message.researchStatus,
      researchPlan: hasStreamingField('researchPlan')
        ? streamingState.researchPlan
        : message.researchPlan,
      researchProgress: hasStreamingField('researchProgress')
        ? streamingState.researchProgress
        : message.researchProgress,
      toolResults: hasStreamingField('toolResults')
        ? streamingState.toolResults
        : message.toolResults,
      agentRun: hasStreamingField('agentRun') ? streamingState.agentRun : message.agentRun,
      model: hasStreamingField('model') ? streamingState.model : message.model,
      latency: hasStreamingField('latency') ? streamingState.latency : message.latency,
      usage: hasStreamingField('usage') ? streamingState.usage : message.usage,
    }
  }, [message, streamingState])

  // Determine if this message is actively streaming
  const isStreaming = streamingState?.isStreaming ?? false

  return (
    <MessageRenderer
      message={displayMessage}
      isStreaming={isStreaming}
      sessionId={sessionId}
      activeToolCalls={activeToolCalls}
      streamPhase={streamingState?.phase}
      onStop={onStop}
      onCopy={onCopy}
      onRegenerate={onRegenerate}
    />
  )
}

/**
 * Custom comparison function for memoization
 *
 * Only re-render if:
 * - Message ID changes
 * - Session ID changes
 * - Callbacks change (should be stable via useCallback)
 *
 * Note: Streaming state changes are handled by the useMessageStreamingState hook,
 * not by prop changes, so we don't need to compare message content here.
 */
function arePropsEqual(
  prevProps: StreamingMessageProps,
  nextProps: StreamingMessageProps
): boolean {
  // Compare message ID - if different, definitely re-render
  if (prevProps.message.id !== nextProps.message.id) {
    return false
  }

  // Compare session ID
  if (prevProps.sessionId !== nextProps.sessionId) {
    return false
  }

  // Compare callbacks by reference (should be stable)
  if (prevProps.onCopy !== nextProps.onCopy) {
    return false
  }
  if (prevProps.onRegenerate !== nextProps.onRegenerate) {
    return false
  }
  if (prevProps.onStop !== nextProps.onStop) {
    return false
  }

  // For non-streaming messages, compare content
  // This handles the case where the message is updated after streaming completes
  if (prevProps.message.content !== nextProps.message.content) {
    return false
  }

  // Compare other message properties that might change
  if (prevProps.message.thinking !== nextProps.message.thinking) {
    return false
  }
  if (prevProps.message.model !== nextProps.message.model) {
    return false
  }
  if (prevProps.message.latency !== nextProps.message.latency) {
    return false
  }
  if (
    getAgentRunMemoKey(prevProps.message.agentRun) !==
    getAgentRunMemoKey(nextProps.message.agentRun)
  ) {
    return false
  }

  // Compare tool results length (deep comparison would be expensive)
  const prevToolResults = prevProps.message.toolResults || []
  const nextToolResults = nextProps.message.toolResults || []
  if (prevToolResults.length !== nextToolResults.length) {
    return false
  }

  // Compare activeToolCalls (for tool calling animation)
  const prevActive = prevProps.activeToolCalls || []
  const nextActive = nextProps.activeToolCalls || []
  if (prevActive.length !== nextActive.length) {
    return false
  }

  // Props are equal - don't re-render
  return true
}

/**
 * Memoized StreamingMessage component
 *
 * This component is memoized with a custom comparison function to prevent
 * unnecessary re-renders. Streaming updates are handled internally via
 * the useMessageStreamingState hook.
 */
export const StreamingMessage = memo(StreamingMessageComponent, arePropsEqual)

export default StreamingMessage
