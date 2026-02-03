/**
 * StreamingMessage - Isolated component for rendering streaming messages
 * 
 * This component subscribes only to the StreamingContext, not the main ChatHistoryContext.
 * This ensures that streaming updates only cause this component to re-render,
 * not the entire message list.
 * 
 * **Validates: Requirements 5.3**
 * **Property 22: Isolated Streaming Updates**
 * - For any streaming message update, only the specific message being updated
 *   SHALL re-render, not the entire message list.
 * 
 * @module StreamingMessage
 */

import React, { memo, useMemo } from 'react'
import { useMessageStreamingState } from '../../../contexts/StreamingContext'
import { MessageRenderer, type MessageRendererProps } from './MessageRenderer'
import type { Message } from '../../../contexts/ChatHistoryContext'

interface StreamingMessageProps {
  /** The base message from the session (may have stale content during streaming) */
  message: Message & {
    thinking?: string
    thinkingDuration?: number
    thinkingBlocks?: any[]
    researchStatus?: {
      currentRound: number
      maxRounds: number
      currentSearch?: string
      isSearching: boolean
    }
    responseVersions?: any[]
    currentVersionIndex?: number
    toolResults?: any[]
  }
  /** Session ID for checking streaming state */
  sessionId: string
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
    
    // Streaming - merge streaming state with base message
    return {
      ...message,
      content: streamingState.content || message.content,
      thinking: streamingState.thinking ?? message.thinking,
      thinkingDuration: streamingState.thinkingDuration ?? message.thinkingDuration,
      thinkingBlocks: streamingState.thinkingBlocks ?? message.thinkingBlocks,
      researchStatus: streamingState.researchStatus ?? message.researchStatus,
      toolResults: streamingState.toolResults ?? message.toolResults,
      model: streamingState.model ?? message.model,
      latency: streamingState.latency ?? message.latency,
      usage: streamingState.usage ?? message.usage,
    }
  }, [message, streamingState])
  
  // Determine if this message is actively streaming
  const isStreaming = streamingState?.isStreaming ?? false
  
  return (
    <MessageRenderer
      message={displayMessage}
      isStreaming={isStreaming}
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
  
  // Compare tool results length (deep comparison would be expensive)
  const prevToolResults = prevProps.message.toolResults || []
  const nextToolResults = nextProps.message.toolResults || []
  if (prevToolResults.length !== nextToolResults.length) {
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
