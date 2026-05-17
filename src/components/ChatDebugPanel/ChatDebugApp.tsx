import { useMemo } from 'react'

import { ChatDebugPanelView } from './ChatDebugPanelView'

/**
 * Top-level entry component for the dev-only `#/chat-debug` route.
 *
 * Parses `sessionId` out of the URL hash query string and mounts the
 * standalone panel view. Renders nothing in production builds — the parent
 * `App` already routes around this page in packaged builds, but this guard
 * keeps the safety check local so the file is dead-on-arrival if ever
 * imported through a different code path.
 */
export function ChatDebugApp() {
  const sessionId = useMemo(() => parseSessionIdFromHash(), [])

  if (!import.meta.env.DEV) return null

  if (!sessionId) {
    return (
      <div className="chat-debug-page chat-debug-page--missing">
        <h1 className="chat-debug-panel__title">Chat Debug Logs</h1>
        <p className="chat-debug-page__subtitle">
          No <code>sessionId</code> was provided. Open this window from the command palette
          (Show Chat Debug Logs) instead of navigating to <code>#/chat-debug</code> directly.
        </p>
      </div>
    )
  }

  return <ChatDebugPanelView sessionId={sessionId} />
}

function parseSessionIdFromHash(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash || ''
  const queryIndex = hash.indexOf('?')
  if (queryIndex === -1) return null
  const params = new URLSearchParams(hash.slice(queryIndex + 1))
  const sessionId = params.get('sessionId')
  if (!sessionId || !sessionId.trim()) return null
  return sessionId.trim()
}
