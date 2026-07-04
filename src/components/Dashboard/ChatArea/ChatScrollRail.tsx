import React, { useMemo, useState } from 'react'

import {
  useMessageScroller,
  useMessageScrollerVisibility,
} from '@/components/ui/message-scroller'

export type NavigationRailMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

function summarizeRailMessage(message: NavigationRailMessage): string {
  const trimmed = message.content.replace(/\s+/g, ' ').trim()
  if (!trimmed) return message.role === 'user' ? 'Your message' : 'Assistant reply'
  return trimmed.length > 64 ? `${trimmed.slice(0, 61)}...` : trimmed
}

export function ChatScrollRail({ messages }: { messages: NavigationRailMessage[] }) {
  const { currentAnchorId, visibleMessageIds } = useMessageScrollerVisibility()
  const { scrollToMessage } = useMessageScroller()
  const [railHover, setRailHover] = useState<{ index: number; yPercent: number } | null>(null)
  const visibleSet = useMemo(() => new Set(visibleMessageIds), [visibleMessageIds])

  if (messages.length < 3) return null

  const handleRailPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const markerSlotHeight = rect.height / messages.length
    if (markerSlotHeight <= 0) return

    const pointerY = Math.min(rect.height, Math.max(0, event.clientY - rect.top))
    const nextIndex = Math.min(
      messages.length - 1,
      Math.max(0, pointerY / markerSlotHeight - 0.5)
    )
    setRailHover({
      index: nextIndex,
      yPercent: (pointerY / rect.height) * 100,
    })
  }

  return (
    <nav className="chat-scroll-rail" aria-label="Message map">
      <div
        className="chat-scroll-rail__track"
        style={
          {
            '--rail-lens-y': railHover ? `${railHover.yPercent.toFixed(2)}%` : '50%',
          } as React.CSSProperties
        }
        onPointerMove={handleRailPointerMove}
        onPointerLeave={() => setRailHover(null)}
      >
        {messages.map((message, index) => {
          const isCurrent = message.id === currentAnchorId
          const isVisible = visibleSet.has(message.id)
          const label = `Message ${index + 1}, ${message.role}: ${summarizeRailMessage(message)}`
          const cursorProximity =
            railHover === null ? 0 : Math.max(0, 1 - Math.abs(index - railHover.index) / 5)
          const cursorInfluence = cursorProximity * cursorProximity * (3 - 2 * cursorProximity)
          const markerStyle = {
            '--rail-marker-translate-x': `${(cursorInfluence * 7).toFixed(2)}px`,
            '--rail-marker-scale-y': (1 + cursorInfluence * 0.55).toFixed(3),
            '--rail-marker-scale-x': (1 + cursorInfluence * 1.25).toFixed(3),
            '--rail-marker-hover-opacity': (0.48 + cursorInfluence * 0.52).toFixed(3),
          } as React.CSSProperties

          return (
            <button
              key={message.id}
              type="button"
              className={[
                'chat-scroll-rail__marker',
                isVisible ? 'is-visible' : '',
                isCurrent ? 'is-current' : '',
                message.role === 'user' ? 'is-user' : '',
                message.role === 'assistant' ? 'is-assistant' : '',
              ].filter(Boolean).join(' ')}
              aria-current={isCurrent ? 'location' : undefined}
              aria-label={label}
              title={label}
              style={markerStyle}
              onClick={() => scrollToMessage(message.id, { block: 'start', behavior: 'smooth' })}
            />
          )
        })}
      </div>
    </nav>
  )
}
