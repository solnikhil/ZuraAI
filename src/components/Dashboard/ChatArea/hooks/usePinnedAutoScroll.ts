import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'

interface UsePinnedAutoScrollOptions {
  containerRef: RefObject<HTMLDivElement | null>
  isStreaming: boolean
  streamSessionId?: string | null
  currentSessionId?: string | null
  streamingContent?: string
  streamingThinking?: string
  messageCount: number
  lastMessageId?: string | null
}

const NEAR_BOTTOM_THRESHOLD = 150

export function usePinnedAutoScroll({
  containerRef,
  isStreaming,
  streamSessionId,
  currentSessionId,
  streamingContent,
  streamingThinking,
  messageCount,
  lastMessageId,
}: UsePinnedAutoScrollOptions) {
  const prevMessageCountRef = useRef(messageCount)
  const lastMessageIdRef = useRef<string | null>(lastMessageId ?? null)
  const hasScrolledToNewMessageRef = useRef(false)
  const userScrolledAwayRef = useRef(false)
  const isAutoScrollingRef = useRef(false)
  const lastScrollTopRef = useRef(0)
  const scrollRafRef = useRef<number | null>(null)
  const autoScrollResetTimerRef = useRef<number | null>(null)

  const isNearBottom = useCallback(() => {
    const container = containerRef.current
    if (!container) return true
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <
      NEAR_BOTTOM_THRESHOLD
    )
  }, [containerRef])

  const scrollToBottom = useCallback(
    (smooth = false) => {
      const container = containerRef.current
      if (!container) return

      const scrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
      isAutoScrollingRef.current = true

      if (smooth) {
        container.scrollTo({ top: scrollTop, behavior: 'smooth' })
      } else {
        container.scrollTop = scrollTop
      }

      if (autoScrollResetTimerRef.current !== null) {
        window.clearTimeout(autoScrollResetTimerRef.current)
      }
      autoScrollResetTimerRef.current = window.setTimeout(
        () => {
          isAutoScrollingRef.current = false
          autoScrollResetTimerRef.current = null
        },
        smooth ? 350 : 50
      )
    },
    [containerRef]
  )

  const schedulePinnedScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return

    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null
      if (userScrolledAwayRef.current || !isNearBottom()) return
      scrollToBottom(false)
    })
  }, [isNearBottom, scrollToBottom])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    lastScrollTopRef.current = container.scrollTop

    const handleScroll = () => {
      const previousScrollTop = lastScrollTopRef.current
      const currentScrollTop = container.scrollTop
      const isUserScrollingUp = currentScrollTop < previousScrollTop
      lastScrollTopRef.current = currentScrollTop

      if (isStreaming && isUserScrollingUp) {
        userScrolledAwayRef.current = true
        return
      }

      if (isAutoScrollingRef.current) return

      if (isStreaming && !isNearBottom()) {
        userScrolledAwayRef.current = true
      } else if (isNearBottom() && currentScrollTop >= previousScrollTop) {
        userScrolledAwayRef.current = false
      }
    }

    const handleWheel = (event: WheelEvent) => {
      if (!isStreaming) return
      if (event.deltaY < 0) {
        userScrolledAwayRef.current = true
      }
    }

    container.addEventListener('scroll', handleScroll)
    container.addEventListener('wheel', handleWheel, { passive: true })

    return () => {
      container.removeEventListener('scroll', handleScroll)
      container.removeEventListener('wheel', handleWheel)
    }
  }, [containerRef, isNearBottom, isStreaming])

  useEffect(() => {
    const currentMessageCount = messageCount
    const currentLastMessageId = lastMessageId ?? null

    if (
      currentMessageCount > prevMessageCountRef.current ||
      currentLastMessageId !== lastMessageIdRef.current
    ) {
      hasScrolledToNewMessageRef.current = false
      userScrolledAwayRef.current = false

      window.requestAnimationFrame(() => {
        if (!hasScrolledToNewMessageRef.current) {
          scrollToBottom(false)
          hasScrolledToNewMessageRef.current = true
        }
      })
    }

    prevMessageCountRef.current = currentMessageCount
    lastMessageIdRef.current = currentLastMessageId
  }, [lastMessageId, messageCount, scrollToBottom])

  useEffect(() => {
    if (!isStreaming) return
    if (streamSessionId !== currentSessionId) return
    if (!streamingContent && !streamingThinking) return
    if (userScrolledAwayRef.current) return
    if (!isNearBottom()) {
      userScrolledAwayRef.current = true
      return
    }

    schedulePinnedScroll()
  }, [
    currentSessionId,
    isNearBottom,
    isStreaming,
    schedulePinnedScroll,
    streamSessionId,
    streamingContent,
    streamingThinking,
  ])

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current)
      }
      if (autoScrollResetTimerRef.current !== null) {
        window.clearTimeout(autoScrollResetTimerRef.current)
      }
    }
  }, [])

  return { scrollToBottom }
}
