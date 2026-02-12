/**
 * StreamingContext - Isolated state management for streaming messages
 * 
 * This context provides isolated state for streaming message updates, preventing
 * the entire message list from re-rendering during streaming. Only the actively
 * streaming message component subscribes to this context.
 * 
 * **Validates: Requirements 5.3**
 * **Property 22: Isolated Streaming Updates**
 * - For any streaming message update, only the specific message being updated
 *   SHALL re-render, not the entire message list.
 * 
 * Architecture:
 * 1. Streaming content is stored in this isolated context
 * 2. The main message list renders a placeholder for the streaming message
 * 3. A dedicated StreamingMessage component subscribes to this context
 * 4. When streaming completes, content is committed to the main session
 * 
 * @module StreamingContext
 */

import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react'
import type { ThinkingBlock } from './ChatHistoryContext'

/**
 * Streaming message state - contains all data for the currently streaming message
 */
export interface StreamingMessageState {
  /** Session ID where the message belongs */
  sessionId: string | null
  /** Message ID being streamed */
  messageId: string | null
  /** Current streaming content */
  content: string
  /** Thinking/reasoning content */
  thinking?: string
  /** Thinking duration in ms */
  thinkingDuration?: number
  /** Array of thinking blocks */
  thinkingBlocks?: ThinkingBlock[]
  /** Research status for web search */
  researchStatus?: {
    currentRound: number
    maxRounds: number
    currentSearch?: string
    isSearching: boolean
  }
  /** Tool results from function calls */
  toolResults?: any[]
  /** Model identifier */
  model?: string
  /** Response latency in ms */
  latency?: number
  /** Token usage statistics */
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    thinkingTokens?: number
    tps?: number
    ttft?: number
    cachedInputTokens?: number
    cachedOutputTokens?: number
  }
  /** Whether streaming is currently active */
  isStreaming: boolean
}

/**
 * Initial empty streaming state
 */
const INITIAL_STREAMING_STATE: StreamingMessageState = {
  sessionId: null,
  messageId: null,
  content: '',
  isStreaming: false,
}

/**
 * Context type for streaming operations
 */
interface StreamingContextType {
  /** Current streaming message state */
  streamingState: StreamingMessageState
  /** Start streaming for a new message */
  startStreaming: (sessionId: string, messageId: string) => void
  /** Update streaming content (isolated from main message list) */
  updateStreaming: (updates: Partial<Omit<StreamingMessageState, 'sessionId' | 'messageId' | 'isStreaming'>>) => void
  /** Complete streaming and return final state for committing to session */
  completeStreaming: () => StreamingMessageState
  /** Cancel/abort streaming */
  cancelStreaming: () => void
  /** Check if a specific message is currently streaming */
  isMessageStreaming: (sessionId: string, messageId: string) => boolean
  /** Get streaming content for a specific message (returns null if not streaming) */
  getStreamingContent: (sessionId: string, messageId: string) => StreamingMessageState | null
}

const StreamingContext = createContext<StreamingContextType | undefined>(undefined)

/**
 * StreamingProvider - Provides isolated streaming state management
 * 
 * This provider maintains streaming state separately from the main chat history,
 * allowing streaming updates to occur without triggering re-renders of the
 * entire message list.
 */
export function StreamingProvider({ children }: { children: React.ReactNode }) {
  // Use state for the streaming message - this is isolated from the main message list
  const [streamingState, setStreamingState] = useState<StreamingMessageState>(INITIAL_STREAMING_STATE)
  
  // Ref to track the latest state without causing re-renders
  const stateRef = useRef<StreamingMessageState>(INITIAL_STREAMING_STATE)
  
  // Keep ref in sync with state
  stateRef.current = streamingState

  /**
   * Start streaming for a new message
   * Resets all streaming state and marks the message as streaming
   */
  const startStreaming = useCallback((sessionId: string, messageId: string) => {
    const newState: StreamingMessageState = {
      sessionId,
      messageId,
      content: '',
      isStreaming: true,
    }
    setStreamingState(newState)
    stateRef.current = newState
  }, [])

  /**
   * Update streaming content
   * This only updates the isolated streaming state, not the main message list
   */
  const updateStreaming = useCallback((
    updates: Partial<Omit<StreamingMessageState, 'sessionId' | 'messageId' | 'isStreaming'>>
  ) => {
    setStreamingState(prev => {
      if (!prev.isStreaming) {
        // Not currently streaming, ignore update
        return prev
      }
      const newState = { ...prev, ...updates }
      stateRef.current = newState
      return newState
    })
  }, [])

  /**
   * Complete streaming and return final state
   * The caller should commit this state to the main session
   */
  const completeStreaming = useCallback((): StreamingMessageState => {
    const finalState = { ...stateRef.current }
    
    // Reset streaming state
    const resetState = INITIAL_STREAMING_STATE
    setStreamingState(resetState)
    stateRef.current = resetState
    
    return finalState
  }, [])

  /**
   * Cancel/abort streaming without committing
   */
  const cancelStreaming = useCallback(() => {
    const resetState = INITIAL_STREAMING_STATE
    setStreamingState(resetState)
    stateRef.current = resetState
  }, [])

  /**
   * Check if a specific message is currently streaming
   */
  const isMessageStreaming = useCallback((sessionId: string, messageId: string): boolean => {
    const current = stateRef.current
    return current.isStreaming && 
           current.sessionId === sessionId && 
           current.messageId === messageId
  }, [])

  /**
   * Get streaming content for a specific message
   * Returns null if the message is not currently streaming
   */
  const getStreamingContent = useCallback((
    sessionId: string, 
    messageId: string
  ): StreamingMessageState | null => {
    const current = stateRef.current
    if (current.isStreaming && 
        current.sessionId === sessionId && 
        current.messageId === messageId) {
      return current
    }
    return null
  }, [])

  const contextValue = useMemo(() => ({
    streamingState,
    startStreaming,
    updateStreaming,
    completeStreaming,
    cancelStreaming,
    isMessageStreaming,
    getStreamingContent,
  }), [
    streamingState,
    startStreaming,
    updateStreaming,
    completeStreaming,
    cancelStreaming,
    isMessageStreaming,
    getStreamingContent,
  ])

  return (
    <StreamingContext.Provider value={contextValue}>
      {children}
    </StreamingContext.Provider>
  )
}

/**
 * Hook to access the streaming context
 */
export function useStreaming(): StreamingContextType {
  const context = useContext(StreamingContext)
  if (context === undefined) {
    throw new Error('useStreaming must be used within a StreamingProvider')
  }
  return context
}

/**
 * Hook to get only the streaming state (for the streaming message component)
 * This hook will cause re-renders when streaming state changes
 */
export function useStreamingState(): StreamingMessageState {
  const { streamingState } = useStreaming()
  return streamingState
}

/**
 * Hook to check if a specific message is streaming
 * Returns the streaming state if the message is streaming, null otherwise
 */
export function useMessageStreamingState(
  sessionId: string | null, 
  messageId: string | null
): StreamingMessageState | null {
  const { streamingState } = useStreaming()
  
  if (!sessionId || !messageId) return null
  
  if (streamingState.isStreaming && 
      streamingState.sessionId === sessionId && 
      streamingState.messageId === messageId) {
    return streamingState
  }
  
  return null
}

/**
 * Hook to get streaming actions without subscribing to state changes
 * Use this in components that need to update streaming but don't need to render streaming content
 */
export function useStreamingActions() {
  const { 
    startStreaming, 
    updateStreaming, 
    completeStreaming, 
    cancelStreaming,
    isMessageStreaming,
    getStreamingContent,
  } = useStreaming()
  
  return {
    startStreaming,
    updateStreaming,
    completeStreaming,
    cancelStreaming,
    isMessageStreaming,
    getStreamingContent,
  }
}

export type { StreamingContextType }
