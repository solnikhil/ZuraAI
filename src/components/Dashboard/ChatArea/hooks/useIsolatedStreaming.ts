/**
 * Bridges the isolated streaming store with persisted chat history updates.
 */

import { useCallback, useRef } from 'react'
import {
  useStreamingActions,
  type StreamingMessageState,
} from '../../../../contexts/StreamingContext'
import { useChatHistory, type Message } from '../../../../contexts/ChatHistoryContext'

interface UseIsolatedStreamingReturn {
  /** Start isolated streaming for a new message */
  startIsolatedStreaming: (sessionId: string, messageId: string) => void
  /** Update streaming content (isolated from main message list) */
  updateIsolatedStreaming: (
    updates: Partial<Omit<StreamingMessageState, 'sessionId' | 'messageId' | 'isStreaming'>>
  ) => void
  /** Commit streaming content to the session and end streaming */
  commitStreaming: () => void
  /** Cancel streaming without committing */
  cancelIsolatedStreaming: () => void
  /** Check if a specific message is currently streaming */
  isMessageStreaming: (sessionId: string, messageId: string) => boolean
  /** Get the current streaming session/message IDs */
  getStreamingIds: () => { sessionId: string | null; messageId: string | null }
}

/**
 * Hook for managing isolated streaming updates
 *
 * This hook wraps the StreamingContext actions and provides integration
 * with the ChatHistoryContext for committing final content.
 */
export function useIsolatedStreaming(): UseIsolatedStreamingReturn {
  const {
    startStreaming,
    updateStreaming,
    completeStreaming,
    cancelStreaming,
    isMessageStreaming,
  } = useStreamingActions()

  const { updateStreamingMessage } = useChatHistory()

  // Track current streaming IDs for getStreamingIds
  const currentIdsRef = useRef<{ sessionId: string | null; messageId: string | null }>({
    sessionId: null,
    messageId: null,
  })

  /**
   * Start isolated streaming for a new message
   * This initializes the streaming context without affecting the main message list
   */
  const startIsolatedStreaming = useCallback(
    (sessionId: string, messageId: string) => {
      currentIdsRef.current = { sessionId, messageId }
      startStreaming(sessionId, messageId)
    },
    [startStreaming]
  )

  /**
   * Update streaming content in the isolated context
   * This does NOT update the main message list - only the streaming context
   */
  const updateIsolatedStreaming = useCallback(
    (updates: Partial<Omit<StreamingMessageState, 'sessionId' | 'messageId' | 'isStreaming'>>) => {
      updateStreaming(updates)
    },
    [updateStreaming]
  )

  /**
   * Commit streaming content to the session
   * This transfers the final content from the streaming context to the main session
   */
  const commitStreaming = useCallback(() => {
    const finalState = completeStreaming()

    if (finalState.sessionId && finalState.messageId) {
      // Commit the final content to the session
      const updates: Partial<Message> = {
        content: finalState.content,
      }

      // Include optional fields if present
      if (finalState.thinking !== undefined) {
        updates.thinking = finalState.thinking
      }
      if (finalState.thinkingDuration !== undefined) {
        updates.thinkingDuration = finalState.thinkingDuration
      }
      if (finalState.thinkingBlocks !== undefined) {
        updates.thinkingBlocks = finalState.thinkingBlocks
      }
      if (finalState.researchStatus !== undefined) {
        updates.researchStatus = finalState.researchStatus
      }
      if (finalState.toolResults !== undefined) {
        updates.toolResults = finalState.toolResults
      }
      if (finalState.model !== undefined) {
        updates.model = finalState.model
      }
      if (finalState.latency !== undefined) {
        updates.latency = finalState.latency
      }
      if (finalState.usage !== undefined) {
        updates.usage = finalState.usage
      }

      // Update the session with final content
      updateStreamingMessage(finalState.sessionId, finalState.messageId, updates)
    }

    // Clear tracking
    currentIdsRef.current = { sessionId: null, messageId: null }
  }, [completeStreaming, updateStreamingMessage])

  /**
   * Cancel streaming without committing
   */
  const cancelIsolatedStreaming = useCallback(() => {
    cancelStreaming()
    currentIdsRef.current = { sessionId: null, messageId: null }
  }, [cancelStreaming])

  /**
   * Get the current streaming session/message IDs
   */
  const getStreamingIds = useCallback(() => {
    return { ...currentIdsRef.current }
  }, [])

  return {
    startIsolatedStreaming,
    updateIsolatedStreaming,
    commitStreaming,
    cancelIsolatedStreaming,
    isMessageStreaming,
    getStreamingIds,
  }
}

export default useIsolatedStreaming
