import React, { useCallback, useEffect, useRef } from 'react'

export default function PromptPopupView() {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!window.promptPopup?.onFocus) return

    const unsubscribe = window.promptPopup.onFocus(() => {
      inputRef.current?.focus()
    })

    return unsubscribe
  }, [])

  const handleSubmit = useCallback(() => {
    const content = inputRef.current?.value?.trim()
    if (!content) return

    void window.promptPopup.submit(content)
    inputRef.current!.value = ''
  }, [])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
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
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1710',
        padding: '0 8px',
      }}
    >
      <input
        ref={inputRef}
        type="text"
        onKeyDown={handleKeyDown}
        placeholder="Ask ZuraAI..."
        autoFocus
        style={{
          width: '100%',
          height: 36,
          padding: '0 14px',
          borderRadius: 18,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(255, 255, 255, 0.05)',
          color: '#e8e4dc',
          fontSize: '0.9rem',
          fontFamily: 'inherit',
          outline: 'none',
          caretColor: 'var(--theme-accent, #b26cff)',
        }}
      />
      <style>{`
        input:focus {
          border-color: rgba(178, 108, 255, 0.4);
          box-shadow: 0 0 0 2px rgba(178, 108, 255, 0.15);
        }
        input::placeholder {
          color: rgba(232, 228, 220, 0.35);
        }
      `}</style>
    </div>
  )
}