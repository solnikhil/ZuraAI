import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useChatHistory } from '../contexts/ChatHistoryContext'
import { useSettings } from '../contexts/SettingsContext'
import { useStreamingState } from '../contexts/StreamingContext'
import { useToast } from './shared/Toast'
import { useStreamingChat } from './Dashboard/ChatArea/hooks'
import { usePromptAutoHide } from './Dashboard/ChatArea/hooks/usePromptAutoHide'
import { shouldHideGenericToolResultCard } from './Dashboard/ChatArea/toolResultVisibility'
import { writeTextToClipboard } from '@/utils/clipboard'
import type { Message } from '@/chat/types'

import { OverlayShell } from './overlay/OverlayShell'
import { OverlayPill } from './overlay/OverlayPill'
import { OverlayCard } from './overlay/OverlayCard'
import { useOverlayAutoHeight } from './overlay/useOverlayAutoHeight'
import './overlay/overlay.css'

export default function OverlayView() {
  const { sessions, currentSessionId, createSession, isSessionLoaded, loadFullSession } = useChatHistory()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const streamingState = useStreamingState()
  const [input, setInput] = useState('')
  const [promptFocused, setPromptFocused] = useState(false)
  const inputTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const hasInput = input.trim().length > 0

  const currentSession = sessions.find((session) => session.id === currentSessionId) || null
  const messages = (currentSession?.messages || []) as Message[]
  const currentSessionMessageCount = currentSession?.messageCount ?? messages.length
  const currentSessionIsLoading = Boolean(
    currentSessionId && currentSessionMessageCount > 0 && !isSessionLoaded(currentSessionId)
  )

  const { isLoading, toolState, sendMessage, regenerateMessage, stopStreaming } = useStreamingChat()

  const visibleLiveToolResults = useMemo(
    () => toolState.toolResults.filter((result) => !shouldHideGenericToolResultCard(result)),
    [toolState.toolResults]
  )
  const displayActiveToolCalls =
    toolState.activeToolBatch.length > 0 ? toolState.activeToolBatch : toolState.activeToolCalls

  const hasConversation =
    messages.length > 0 || currentSessionIsLoading || isLoading || visibleLiveToolResults.length > 0
  const isExpanded = hasConversation

  const overlayPromptAutoHideEnabled = settings.overlay.promptAutoHideEnabled ?? false
  const overlayPromptAutoHideTimeout = settings.overlay.promptAutoHideTimeout ?? 120
  const { isPromptHidden, resetTimer } = usePromptAutoHide({
    enabled: isExpanded && overlayPromptAutoHideEnabled,
    isLoading,
    isFocused: promptFocused,
    hasInput,
    hasFiles: false,
    timeoutSeconds: overlayPromptAutoHideTimeout,
    textareaRef: inputTextareaRef as React.RefObject<HTMLTextAreaElement | null>,
  })
  const pillDimmed = isPromptHidden && !promptFocused

  // Keep the OS window height fitted to the measured content (pill -> card growth).
  useOverlayAutoHeight(measureRef, true)

  const handleSend = useCallback(async () => {
    const content = input.trim()
    if (!content || isLoading) return
    setInput('')
    resetTimer()
    await sendMessage(content, [])
  }, [input, isLoading, resetTimer, sendMessage])

  const handleHide = useCallback(async () => {
    try {
      await window.overlay.hide()
    } catch {
      showToast('Unable to hide the Overlay right now.', 'error')
    }
  }, [showToast])

  const handleCopy = useCallback(
    async (content: string) => {
      const copiedSuccessfully = await writeTextToClipboard(content)
      if (!copiedSuccessfully) {
        showToast('Unable to copy message right now.', 'error')
      }
      return copiedSuccessfully
    },
    [showToast]
  )

  const handleRegenerate = useCallback(
    (message: Message, instruction: string) => regenerateMessage(message, instruction),
    [regenerateMessage]
  )

  const handleNewChat = useCallback(() => {
    createSession()
    setInput('')
    resetTimer()
    inputTextareaRef.current?.focus()
  }, [createSession, resetTimer])

  // Keep the overlay window background transparent so the glass shell can frost.
  useEffect(() => {
    const previousBodyBackground = document.body.style.background
    const previousBodyBackgroundColor = document.body.style.backgroundColor
    const previousDocumentBackground = document.documentElement.style.background
    const previousDocumentBackgroundColor = document.documentElement.style.backgroundColor
    const root = document.getElementById('root')
    const previousRootBackground = root?.style.background
    const previousRootBackgroundColor = root?.style.backgroundColor

    document.body.style.background = 'transparent'
    document.body.style.backgroundColor = 'transparent'
    document.documentElement.style.background = 'transparent'
    document.documentElement.style.backgroundColor = 'transparent'
    if (root) {
      root.style.background = 'transparent'
      root.style.backgroundColor = 'transparent'
    }

    return () => {
      document.body.style.background = previousBodyBackground
      document.body.style.backgroundColor = previousBodyBackgroundColor
      document.documentElement.style.background = previousDocumentBackground
      document.documentElement.style.backgroundColor = previousDocumentBackgroundColor
      if (root) {
        root.style.background = previousRootBackground ?? ''
        root.style.backgroundColor = previousRootBackgroundColor ?? ''
      }
    }
  }, [])

  useEffect(() => {
    if (currentSessionId && currentSessionIsLoading) {
      void loadFullSession(currentSessionId, { limit: 80 })
      setTimeout(() => void loadFullSession(currentSessionId), 150)
    }
  }, [currentSessionId, currentSessionIsLoading, loadFullSession])

  // Auto-send a prompt relayed from another surface (e.g. command palette).
  useEffect(() => {
    if (!window.overlay?.onPendingPrompt) return

    const unsubscribe = window.overlay.onPendingPrompt((prompt: string) => {
      if (prompt.trim() && !isLoading) {
        void sendMessage(prompt.trim(), [])
      }
    })

    return unsubscribe
  }, [isLoading, sendMessage])

  // Escape hides the overlay from anywhere in the surface.
  useEffect(() => {
    const handleEscapeClose = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      void handleHide()
    }

    window.addEventListener('keydown', handleEscapeClose)
    return () => window.removeEventListener('keydown', handleEscapeClose)
  }, [handleHide])

  return (
    <div className="zo-root">
      <OverlayShell isExpanded={isExpanded} onMouseMove={isExpanded ? resetTimer : undefined}>
        <div ref={measureRef} className="zo-measure">
          <div
            className={`zo-pill-wrap${pillDimmed ? ' is-dimmed' : ''}`}
            onMouseEnter={isExpanded ? resetTimer : undefined}
          >
            <OverlayPill
              value={input}
              onChange={setInput}
              onSubmit={() => void handleSend()}
              onStop={stopStreaming}
              onEscape={() => void handleHide()}
              isLoading={isLoading}
              inputRef={inputTextareaRef}
              onFocus={() => setPromptFocused(true)}
              onBlur={() => setPromptFocused(false)}
              onActivity={isExpanded ? resetTimer : undefined}
              onNewChat={isExpanded ? handleNewChat : undefined}
            />
          </div>

          {isExpanded ? (
            <OverlayCard
              messages={messages}
              currentSessionId={currentSessionId}
              isLoading={isLoading}
              activeToolCalls={displayActiveToolCalls}
              visibleLiveToolResults={visibleLiveToolResults}
              streamingContent={streamingState?.content}
              onCopy={handleCopy}
              onRegenerate={handleRegenerate}
            />
          ) : (
            <div className="zo-empty-hint">
              Ask without opening the dashboard — same providers, tools, and history.
            </div>
          )}
        </div>
      </OverlayShell>
    </div>
  )
}
