/**
 * VirtualMessageList - Virtualized message list using react-virtuoso
 *
 * Implements efficient rendering for long chat histories with streaming-aware auto-scroll.
 * Key behaviors:
 * 1. Only renders visible messages (DOM stays light)
 * 2. Smart auto-scroll that doesn't fight user interaction
 * 3. Streaming-aware: keeps pinned during token generation
 * 4. Scroll position is tracked in refs — never re-renders the list on wheel/scroll
 */

import React, { useRef, useCallback, useEffect, useMemo } from 'react'
import { Virtuoso, type VirtuosoHandle, type Components } from 'react-virtuoso'
import type { Message } from '../../../chat/types'

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
  /** Called when the user scrolls near the top (load older messages). */
  onStartReached?: () => void
}

const ITEM_WRAPPER_STYLE: React.CSSProperties = {
  width: '100%',
  maxWidth: 'min(735px, 100%)',
  margin: '0 auto',
  padding: '0 20px',
}

const LIST_SHELL_STYLE: React.CSSProperties = {
  position: 'relative',
  height: '100%',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  // Own compositor layer so acrylic/backdrop chrome doesn't repaint with every scroll frame.
  transform: 'translateZ(0)',
  contain: 'layout paint style',
}

const VIRTUOSO_STYLE: React.CSSProperties = {
  flex: 1,
  overflowX: 'hidden',
  // Smooth wheel scrolling on Windows/Electron without fighting Virtuoso.
  overscrollBehavior: 'contain',
}

const FOOTER_PAD_STYLE: React.CSSProperties = { paddingBottom: '180px' }

// Modest overscan: enough for smooth flings, not enough to rehydrate heavy markdown off-screen.
const VIEWPORT_OVERSCAN = { top: 280, bottom: 360 }

/**
 * VirtualMessageList - Virtualized chat message list with streaming-aware auto-scroll
 *
 * Uses react-virtuoso for efficient rendering of long message lists.
 * Implements the "don't fight the user" pattern for smooth scrolling.
 */
function VirtualMessageListComponent({
  messages,
  sessionId,
  isGenerating,
  streamingContent = '',
  autoScrollEnabled = true,
  renderMessage,
  header,
  footer,
  onStartReached,
}: VirtualMessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const prevLenRef = useRef(messages.length)
  const prevSessionRef = useRef(sessionId)
  const streamingScrollRafRef = useRef<number | null>(null)

  // Scroll interaction state lives in refs so wheel/scroll never re-renders this list.
  const atBottomRef = useRef(true)
  const isScrollingRef = useRef(false)
  const userScrollLockedRef = useRef(false)
  const autoScrollEnabledRef = useRef(autoScrollEnabled)
  const isGeneratingRef = useRef(isGenerating)

  useEffect(() => {
    autoScrollEnabledRef.current = autoScrollEnabled
  }, [autoScrollEnabled])

  useEffect(() => {
    isGeneratingRef.current = isGenerating
  }, [isGenerating])

  /**
   * followOutput callback - only auto-scroll when new messages are added
   * Returns 'auto' when array grows, false otherwise
   * This prevents weird jumps when existing messages update (e.g., streaming)
   */
  const followOutput = useCallback(() => {
    const grew = messages.length > prevLenRef.current
    prevLenRef.current = messages.length
    if (!grew) return false
    if (userScrollLockedRef.current) return false
    if (!atBottomRef.current) return false
    return 'auto'
  }, [messages.length])

  /** Scroll to bottom helper for session resets and pin recovery. */
  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    virtuosoRef.current?.scrollToIndex({
      index: 'LAST',
      align: 'end',
      behavior,
    })
  }, [])

  const scheduleStreamingScrollToBottom = useCallback(() => {
    if (streamingScrollRafRef.current !== null) return

    streamingScrollRafRef.current = requestAnimationFrame(() => {
      streamingScrollRafRef.current = null
      if (!autoScrollEnabledRef.current) return
      if (!isGeneratingRef.current) return
      if (!atBottomRef.current) return
      if (isScrollingRef.current) return
      if (userScrollLockedRef.current) return
      scrollToBottom('auto')
    })
  }, [scrollToBottom])

  /**
   * Reset scroll position when switching sessions
   */
  useEffect(() => {
    if (sessionId !== prevSessionRef.current) {
      prevSessionRef.current = sessionId
      userScrollLockedRef.current = false
      atBottomRef.current = true
      requestAnimationFrame(() => {
        scrollToBottom('auto')
      })
    }
  }, [sessionId, scrollToBottom])

  /**
   * While streaming, keep pinned to bottom when safe.
   * Reads refs so token growth does not depend on scroll-state re-renders.
   */
  useEffect(() => {
    if (!autoScrollEnabled) return
    if (!isGenerating) return
    scheduleStreamingScrollToBottom()
  }, [autoScrollEnabled, isGenerating, streamingContent, scheduleStreamingScrollToBottom])

  useEffect(() => {
    return () => {
      if (streamingScrollRafRef.current !== null) {
        cancelAnimationFrame(streamingScrollRafRef.current)
      }
    }
  }, [])

  const handleAtBottomStateChange = useCallback((nextAtBottom: boolean) => {
    atBottomRef.current = nextAtBottom
    if (nextAtBottom) {
      userScrollLockedRef.current = false
    }
  }, [])

  const handleIsScrolling = useCallback((scrolling: boolean) => {
    isScrollingRef.current = scrolling
  }, [])

  const handleStartReached = useCallback(() => {
    onStartReached?.()
  }, [onStartReached])

  const handleWheelCapture = useCallback((event: React.WheelEvent) => {
    // Only lock auto-follow when the user intentionally scrolls up mid-generation.
    if (!isGeneratingRef.current) return
    if (event.deltaY < 0) {
      userScrollLockedRef.current = true
    }
  }, [])

  const renderItemContent = useCallback(
    (index: number, message: Message) => (
      <div data-message-id={message.id} style={ITEM_WRAPPER_STYLE}>
        {renderMessage(index, message)}
      </div>
    ),
    [renderMessage]
  )

  const computeItemKey = useCallback((_index: number, message: Message) => message.id, [])

  const components = useMemo<Components<Message>>(() => {
    const Header = header ? () => <>{header}</> : undefined
    const Footer = footer
      ? () => <div style={FOOTER_PAD_STYLE}>{footer}</div>
      : () => <div style={FOOTER_PAD_STYLE} />

    return { Header, Footer }
  }, [header, footer])

  // Don't render virtuoso for empty lists
  if (messages.length === 0) {
    return null
  }

  return (
    <div data-select-all-scope="chat" onWheelCapture={handleWheelCapture} style={LIST_SHELL_STYLE}>
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        itemContent={renderItemContent}
        computeItemKey={computeItemKey}
        followOutput={followOutput}
        increaseViewportBy={VIEWPORT_OVERSCAN}
        defaultItemHeight={160}
        initialTopMostItemIndex={messages.length - 1}
        atBottomStateChange={handleAtBottomStateChange}
        isScrolling={handleIsScrolling}
        startReached={handleStartReached}
        // Avoid smooth programmatic scrolls during stream — they stack and feel laggy.
        style={VIRTUOSO_STYLE}
        components={components}
      />
    </div>
  )
}

// Composer edits happen much more frequently than message-list identity
// changes. Keep draft-only parent renders out of react-virtuoso while allowing
// streamingContent and all other viewport props to invalidate normally.
export const VirtualMessageList = React.memo(VirtualMessageListComponent)
VirtualMessageList.displayName = 'VirtualMessageList'

export default VirtualMessageList
