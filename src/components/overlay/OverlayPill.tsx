import React from 'react'

import { Loader2, Plus, Send, Sparkles } from '../icons'
import { TooltipIconButton } from '../ui/TooltipIconButton'

function MicGlyph(): React.ReactElement {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}

export interface OverlayPillProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  onEscape: () => void
  isLoading: boolean
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  onFocus?: () => void
  onBlur?: () => void
  onActivity?: () => void
  onNewChat?: () => void
  placeholder?: string
}

/**
 * The idle "pill": a Siri/Spotlight-style search bar that is always present at
 * the top of the overlay. The right-side affordance swaps between a mic (idle),
 * a send button (has text), and a loading spinner (streaming).
 */
export function OverlayPill({
  value,
  onChange,
  onSubmit,
  onStop,
  onEscape,
  isLoading,
  inputRef,
  onFocus,
  onBlur,
  onActivity,
  onNewChat,
  placeholder = 'Ask anything…',
}: OverlayPillProps): React.ReactElement {
  const hasText = value.trim().length > 0

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSubmit()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onEscape()
    }
  }

  let actionVariant: 'mic' | 'send' | 'stop'
  if (isLoading) actionVariant = 'stop'
  else if (hasText) actionVariant = 'send'
  else actionVariant = 'mic'

  return (
    <div className="zo-pill">
      <span className="zo-pill__icon" aria-hidden="true">
        <Sparkles size={18} strokeWidth={2} />
      </span>

      <textarea
        ref={inputRef}
        className="zo-pill__input"
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          onActivity?.()
        }}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={1}
        autoFocus
        aria-label="Ask ZuraAI"
      />

      {isLoading || hasText ? (
        <TooltipIconButton
          tooltip={isLoading ? 'Stop' : 'Send'}
          className="zo-pill__action"
          data-variant={actionVariant}
          onClick={() => {
            if (isLoading) {
              onStop()
              return
            }
            onSubmit()
          }}
          aria-label={isLoading ? 'Stop generation' : 'Send message'}
        >
          {isLoading ? (
            <Loader2 className="zo-spinner" aria-hidden="true" />
          ) : (
            <Send size={16} strokeWidth={2.4} />
          )}
        </TooltipIconButton>
      ) : (
        <button
          type="button"
          className="zo-pill__action"
          data-variant={actionVariant}
          onClick={() => {
            onSubmit()
          }}
          aria-label="Voice (coming soon)"
        >
          <MicGlyph />
        </button>
      )}

      {onNewChat ? (
        <TooltipIconButton
          tooltip="New chat"
          className="zo-pill__action"
          onClick={onNewChat}
          aria-label="New chat"
        >
          <Plus size={17} strokeWidth={2.2} />
        </TooltipIconButton>
      ) : null}
    </div>
  )
}

export default OverlayPill
