import React, { useCallback, useEffect, useRef } from 'react'

import { Send } from './icons'

export default function PromptPopupView() {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
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
        <div className="prompt-popup-header">
          <div className="prompt-popup-title">Quick Ask</div>
          <div className="prompt-popup-subtitle">Send to the overlay without opening the full app.</div>
        </div>
        <div className="prompt-popup-textarea-wrap">
          <textarea
            ref={textareaRef}
            className="prompt-popup-textarea"
            onKeyDown={handleKeyDown}
            placeholder="Ask ZuraAI..."
            autoFocus
            rows={3}
          />
        </div>
        <div className="prompt-popup-actions">
          <span className="prompt-popup-hint">Enter to send, Shift+Enter for newline</span>
          <button
            type="button"
            className="prompt-popup-send"
            onClick={handleSubmit}
          >
            <Send size={14} />
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  )
}
