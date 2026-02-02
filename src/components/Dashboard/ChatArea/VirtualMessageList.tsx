/**
 * VirtualMessageList - Virtualized message list using react-virtuoso
 * 
 * Implements efficient rendering for long chat histories with streaming-aware auto-scroll.
 * Key behaviors:
 * 1. Only renders visible messages (DOM stays light)
 * 2. Smart auto-scroll that doesn't fight user interaction
 * 3. Streaming-aware: keeps pinned during token generation
 * 4. "Back to bottom" button when scrolled up
 * 
 * Requirements: 4.3, 5.5, 5.6
 * 
 * @module VirtualMessageList
 */

import React, { useRef, useState, useCallback, useEffect } from 'react'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { ChevronDown } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  model?: string
  image?: string
  thinking?: string
  toolResults?: any[]
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

interface VirtualMessageListProps {
  /** Array of messages to render */
  messages: Message[]
  /** Current session ID - used to reset scroll on session change */
  sessionId: string
  /** Whether AI is currently generating a response */
  isGenerating: boolean
  /** Current streaming content (for detecting content growth) */
  streamingContent?: string
  /** User preference for auto-scroll (default: true) */
  autoScrollEnabled?: boolean
  /** Render function for each message */
  renderMessage: (index: number, message: Message) => React.ReactNode
  /** Optional header component */
  header?: React.ReactNode
  /** Optional footer component */
  footer?: React.ReactNode
}

/**
 * VirtualMessageList - Virtualized chat message list with streaming-aware auto-scroll
 * 
 * Uses react-virtuoso for efficient rendering of long message lists.
 * Implements the "don't fight the user" pattern for smooth scrolling.
 */
export function VirtualMessageList({
  messages,
  sessionId,
  isGenerating,
  streamingContent = '',
  autoScrollEnabled = true,
  renderMessage,
  header,
  footer
}: VirtualMessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const prevLenRef = useRef(messages.length)
  const prevSessionRef = useRef(sessionId)
  
  // Track scroll state
  const [atBottom, setAtBottom] = useState(true)
  const [isScrolling, setIsScrolling] = useState(false)
  
  /**
   * followOutput callback - only auto-scroll when new messages are added
   * Returns 'auto' when array grows, false otherwise
   * This prevents weird jumps when existing messages update (e.g., streaming)
   */
  const followOutput = useCallback(() => {
    const grew = messages.length > prevLenRef.current
    prevLenRef.current = messages.length
    return grew ? 'auto' : false
  }, [messages.length])
  
  /**
   * Scroll to bottom - used for "Back to bottom" button
   */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    virtuosoRef.current?.scrollToIndex({
      index: 'LAST',
      align: 'end',
      behavior
    })
  }, [])
  
  /**
   * Reset scroll position when switching sessions
   */
  useEffect(() => {
    if (sessionId !== prevSessionRef.current) {
      prevSessionRef.current = sessionId
      // Small delay to ensure messages are loaded
      requestAnimationFrame(() => {
        scrollToBottom('auto')
        setAtBottom(true)
      })
    }
  }, [sessionId, scrollToBottom])
  
  /**
   * KEY: While streaming, keep pinned to bottom (only when safe)
   * 
   * This solves the classic trap where streaming updates (token-by-token text growth)
   * increase the height of the last bubble and you slowly drift upward.
   * 
   * Only re-scroll if:
   * - autoScrollEnabled is true
   * - User is already at bottom
   * - AI is generating
   * - User is not actively scrolling
   */
  useEffect(() => {
    if (!autoScrollEnabled) return
    if (atBottom && isGenerating && !isScrolling) {
      virtuosoRef.current?.scrollToIndex({
        index: 'LAST',
        align: 'end',
        behavior: 'auto'
      })
    }
  }, [atBottom, isGenerating, isScrolling, streamingContent, autoScrollEnabled])
  
  // Calculate overscan - 3x viewport height for smooth fling-scroll
  const overscan = typeof window !== 'undefined' ? window.innerHeight * 3 : 900
  
  // Don't render virtuoso for empty lists
  if (messages.length === 0) {
    return null
  }
  
  return (
    <div style={{ 
      position: 'relative', 
      height: '100%', 
      width: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        itemContent={(index, message) => (
          <div 
            key={message.id} 
            data-message-id={message.id}
            style={{ 
              width: '100%', 
              maxWidth: 'min(860px, 100%)', 
              margin: '0 auto',
              padding: '0 20px'
            }}
          >
            {renderMessage(index, message)}
          </div>
        )}
        followOutput={followOutput}
        increaseViewportBy={overscan}
        initialTopMostItemIndex={messages.length - 1}
        atBottomStateChange={setAtBottom}
        isScrolling={setIsScrolling}
        style={{ flex: 1 }}
        components={{
          Header: header ? () => <>{header}</> : undefined,
          Footer: footer ? () => (
            <div style={{ paddingBottom: '180px' }}>
              {footer}
            </div>
          ) : () => <div style={{ paddingBottom: '180px' }} />
        }}
      />
      
      {/* Back to bottom button - appears when user scrolls up */}
      {!atBottom && (
        <button
          onClick={() => scrollToBottom('smooth')}
          style={{
            position: 'absolute',
            right: 24,
            bottom: 200,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'var(--theme-surface)',
            border: '1px solid var(--theme-border)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            zIndex: 10
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--theme-surface-hover)'
            e.currentTarget.style.transform = 'scale(1.05)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--theme-surface)'
            e.currentTarget.style.transform = 'scale(1)'
          }}
          aria-label="Scroll to bottom"
        >
          <ChevronDown 
            size={20} 
            style={{ color: 'var(--theme-text-primary)' }} 
          />
        </button>
      )}
    </div>
  )
}

export default VirtualMessageList
