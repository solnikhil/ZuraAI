import { useCallback, useEffect, useRef, useState } from 'react'

import type { ChatDiagnosticEvent } from './chatDiagnostics'

/**
 * Cap on in-memory events held by the panel hook. Independent from the
 * 500-event JSONL cap on disk — the panel can show a different (larger)
 * window because it's pure renderer state.
 */
export const CHAT_DIAGNOSTICS_BUFFER_LIMIT = 1000

export interface UseChatDiagnosticsStreamResult {
  events: ChatDiagnosticEvent[]
  clear: () => void
  isAvailable: boolean
}

/**
 * Subscribe to the dev-only diagnostic event firehose for a single chat session.
 *
 * Loads persisted history on mount via `window.chatDiagnostics.listEvents`,
 * then appends live events filtered by `sessionId`. Caps the in-memory buffer
 * (FIFO drop oldest) so a long session can't grow without bound.
 *
 * Returns `{ events: [], clear: noop, isAvailable: false }` if the bridge is
 * missing (e.g. production build, or non-Electron preview), so callers don't
 * need to null-check before calling `clear()`.
 */
export function useChatDiagnosticsStream(
  sessionId: string | null | undefined
): UseChatDiagnosticsStreamResult {
  const [events, setEvents] = useState<ChatDiagnosticEvent[]>([])
  // Track the active sessionId in a ref so the live-event listener (which is
  // set up once) can compare against the latest sessionId without re-subscribing.
  const sessionIdRef = useRef<string | null | undefined>(sessionId)
  sessionIdRef.current = sessionId

  const isAvailable =
    typeof window !== 'undefined' && Boolean(window.chatDiagnostics?.listEvents)

  const clear = useCallback(() => {
    setEvents([])
  }, [])

  useEffect(() => {
    if (!isAvailable) {
      setEvents([])
      return
    }
    if (!sessionId) {
      setEvents([])
      return
    }

    let cancelled = false
    const bridge = window.chatDiagnostics
    if (!bridge) return

    void bridge
      .listEvents(sessionId)
      .then((history) => {
        if (cancelled) return
        const trimmed =
          history.length > CHAT_DIAGNOSTICS_BUFFER_LIMIT
            ? history.slice(-CHAT_DIAGNOSTICS_BUFFER_LIMIT)
            : history
        setEvents(trimmed)
      })
      .catch((error) => {
        // Don't crash the panel if the underlying file read fails.
        console.warn('[chat-diagnostics] failed to load history', error)
      })

    const unsubscribe = bridge.onEvent((event) => {
      if (!event || event.sessionId !== sessionIdRef.current) return
      setEvents((current) => {
        const next = current.length + 1 > CHAT_DIAGNOSTICS_BUFFER_LIMIT
          ? [...current.slice(current.length + 1 - CHAT_DIAGNOSTICS_BUFFER_LIMIT), event]
          : [...current, event]
        return next
      })
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [isAvailable, sessionId])

  return { events, clear, isAvailable }
}
