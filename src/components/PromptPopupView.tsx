import React, { useCallback, useEffect, useRef } from 'react'

import { FlaskConical, Globe, Plus } from './icons'

function VoiceGlyph(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M6 11a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 21h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function UpArrowGlyph(): React.ReactElement {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 17V7M12 7l-4.5 4.5M12 7l4.5 4.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function PromptPopupView() {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const previousBodyBackground = document.body.style.background
    const previousBodyBackgroundColor = document.body.style.backgroundColor
    const previousDocumentBackground = document.documentElement.style.background
    const previousDocumentBackgroundColor = document.documentElement.style.backgroundColor
    document.body.style.background = 'transparent'
    document.body.style.backgroundColor = 'transparent'
    document.documentElement.style.background = 'transparent'
    document.documentElement.style.backgroundColor = 'transparent'
    textareaRef.current?.focus()

    return () => {
      document.body.style.background = previousBodyBackground
      document.body.style.backgroundColor = previousBodyBackgroundColor
      document.documentElement.style.background = previousDocumentBackground
      document.documentElement.style.backgroundColor = previousDocumentBackgroundColor
    }
  }, [])

  useEffect(() => {
    if (!window.promptPopup?.onFocus) return

    const unsubscribe = window.promptPopup.onFocus(() => {
      textareaRef.current?.focus()
    })

    return unsubscribe
  }, [])

  const handleSubmit = useCallback(() => {
    const content = textareaRef.current?.value?.trim()
    if (!content) return

    void window.promptPopup.submit(content)
    textareaRef.current!.value = ''
  }, [])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        handleSubmit()
      }

      if (event.key === 'Escape') {
        void window.promptPopup.hide()
      }
    },
    [handleSubmit]
  )

  return (
    <div className="prompt-popup-root">
      <div className="prompt-popup-composer">
        <div className="prompt-popup-actions">
          <div className="prompt-popup-tools">
            <button
              type="button"
              className="prompt-popup-tool-button"
              aria-label="Add attachment"
              title="Add attachment"
            >
              <Plus size={21} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              className="prompt-popup-tool-button"
              aria-label="Browse the web"
              title="Browse the web"
            >
              <Globe size={19} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              className="prompt-popup-tool-button"
              aria-label="Thinking mode"
              title="Thinking mode"
            >
              <FlaskConical size={19} strokeWidth={1.9} />
            </button>
            <div className="prompt-popup-model-badge">5.4 Thinking</div>
          </div>
          <div className="prompt-popup-textarea-wrap">
            <textarea
              ref={textareaRef}
              className="prompt-popup-textarea"
              onKeyDown={handleKeyDown}
              placeholder="Ask anything"
              autoFocus
              rows={1}
            />
          </div>
          <div className="prompt-popup-submit-cluster">
            <button
              type="button"
              className="prompt-popup-voice-button"
              aria-label="Voice input"
              title="Voice input"
            >
              <VoiceGlyph />
            </button>
            <button
              type="button"
              className="prompt-popup-send"
              onClick={handleSubmit}
              aria-label="Send"
              title="Send"
            >
              <UpArrowGlyph />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
