import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { Plus, FlaskConical, Globe } from './icons'
import { Send } from 'lucide-react'

function truncateModelName(name: string, maxLen: number = 12): string {
  if (!name) return 'Auto'
  return name.length > maxLen ? name.slice(0, maxLen - 1) + '…' : name
}

export default function PromptPopupView() {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const { settings } = useSettings()

  const modelName = useMemo(() => {
    const allModels: Array<{ code: string; displayName: string }> = [
      ...(settings.ollamaModels || []),
      ...(settings.perplexityModels || []),
      ...(settings.configuredModels || []),
      ...(settings.groqModels || []),
      ...(settings.alibabaModels || []),
      ...(settings.fireworksModels || []),
    ]
    const match = allModels.find((m) => m.code === settings.aiModel)
    const raw = match?.displayName || settings.aiModel?.split('/').pop() || 'Auto'
    return truncateModelName(raw.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim(), 12)
  }, [settings.aiModel, settings.ollamaModels, settings.perplexityModels, settings.configuredModels, settings.groqModels, settings.alibabaModels, settings.fireworksModels])

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

  const handleOpenModelSelector = useCallback(() => {
    void window.promptPopup.hide()
    window.promptPopup.openModelSelector()
  }, [])

  const handleTextareaInput = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 80) + 'px'
  }, [])

  return (
    <div className="prompt-popup-root">
      <div className="prompt-popup-composer">
        <textarea
          ref={textareaRef}
          className="prompt-popup-textarea"
          onKeyDown={handleKeyDown}
          onInput={handleTextareaInput}
          placeholder="Ask anything…"
          autoFocus
          rows={1}
        />
        <div className="prompt-popup-footer">
          <div className="prompt-popup-footer-left">
            <button
              type="button"
              className="prompt-popup-plus"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Actions"
              title="Actions"
            >
              <Plus size={14} strokeWidth={2.5} />
            </button>
            {menuOpen && (
              <div className="prompt-popup-menu">
                <button
                  type="button"
                  className="prompt-popup-menu-item"
                  onClick={() => setMenuOpen(false)}
                >
                  <Globe size={14} />
                  <span>Add file</span>
                </button>
                <button
                  type="button"
                  className="prompt-popup-menu-item"
                  onClick={() => setMenuOpen(false)}
                >
                  <FlaskConical size={14} />
                  <span>Manage MCPs</span>
                </button>
                <button
                  type="button"
                  className="prompt-popup-menu-item"
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="prompt-popup-menu-icon-spark">✦</span>
                  <span>Manage Skills</span>
                </button>
              </div>
            )}
            <button
              type="button"
              className="prompt-popup-model"
              onClick={() => { handleOpenModelSelector() }}
              aria-label="Change model"
              title={modelName}
            >
              {modelName}
            </button>
          </div>
          <button
            type="button"
            className="prompt-popup-send"
            onClick={handleSubmit}
            aria-label="Send"
            title="Send"
          >
            <Send size={15} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  )
}