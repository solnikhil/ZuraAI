import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerVisibility,
} from '@/components/ui/message-scroller'
import { useToast } from '../shared/Toast'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useStreamingState } from '../../contexts/StreamingContext'
import { useQuickSend } from '../../contexts/QuickSendContext'
import { useComposerDraft } from '../../contexts/ComposerDraftContext'
import { useSettings } from '../../contexts/SettingsContext'
import { ToolCallIndicator, ToolResultDisplay } from '../../tools/ui'
import { writeTextToClipboard } from '../../utils/clipboard'

import { MessageRenderer } from './ChatArea/MessageRenderer'
import { StreamingMessage } from './ChatArea/StreamingMessage'
import { InputArea } from './ChatArea/InputArea'
import { shouldHideGenericToolResultCard } from './ChatArea/toolResultVisibility'
import { useStreamingChat, usePromptAutoHide } from './ChatArea/hooks'
import { usePinnedAutoScroll } from './ChatArea/hooks/usePinnedAutoScroll'
import type { AttachedFile } from './ChatArea/attachmentUtils'
import { NORMAL_PLACEHOLDERS, GENZ_PLACEHOLDERS } from './ChatArea/placeholders'
import { CHAT_AREA_STYLES } from './ChatArea/chatAreaStyles'

type NavigationRailMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

function summarizeRailMessage(message: NavigationRailMessage): string {
  const trimmed = message.content.replace(/\s+/g, ' ').trim()
  if (!trimmed) return message.role === 'user' ? 'Your message' : 'Assistant reply'
  return trimmed.length > 64 ? `${trimmed.slice(0, 61)}...` : trimmed
}

function ChatScrollRail({ messages }: { messages: NavigationRailMessage[] }) {
  const { currentAnchorId, visibleMessageIds } = useMessageScrollerVisibility()
  const { scrollToMessage } = useMessageScroller()
  const visibleSet = useMemo(() => new Set(visibleMessageIds), [visibleMessageIds])

  if (messages.length < 3) return null

  return (
    <nav className="chat-scroll-rail" aria-label="Message map">
      <div className="chat-scroll-rail__track">
        {messages.map((message, index) => {
          const isCurrent = message.id === currentAnchorId
          const isVisible = visibleSet.has(message.id)
          const label = `Message ${index + 1}, ${message.role}: ${summarizeRailMessage(message)}`

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
              onClick={() => scrollToMessage(message.id, { block: 'start', behavior: 'smooth' })}
            />
          )
        })}
      </div>
    </nav>
  )
}

export default function ChatArea() {
  const { folders, sessions, currentSessionId, isSessionLoaded, loadFullSession, switchSession } =
    useChatHistory()
  const { settings } = useSettings()
  const { showToast } = useToast()

  const streamingState = useStreamingState()

  const { draftText: input, setDraftText: setInput } = useComposerDraft()
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [promptFocused, setPromptFocused] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  const currentSession = sessions.find((s) => s.id === currentSessionId)
  const messages = currentSession?.messages || []
  const currentFolderName = currentSession?.folderId
    ? folders.find((folder) => folder.id === currentSession.folderId)?.name
    : undefined
  const currentSessionMessageCount = currentSession?.messageCount ?? messages.length
  const currentSessionIsLoading = Boolean(
    currentSessionId && currentSessionMessageCount > 0 && !isSessionLoaded(currentSessionId)
  )
  const lastRenderedSessionRef = useRef<{
    sessionId: string
    messages: typeof messages
  } | null>(null)
  const fallbackSession =
    currentSessionIsLoading && messages.length === 0 ? lastRenderedSessionRef.current : null
  const displayedMessages = fallbackSession?.messages ?? messages
  const displayedSessionId = fallbackSession?.sessionId ?? currentSessionId
  const isShowingLoadingFallback = Boolean(fallbackSession)
  const displayedSessionIsCurrent = displayedSessionId === currentSessionId

  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      lastRenderedSessionRef.current = {
        sessionId: currentSessionId,
        messages,
      }
    }
  }, [currentSessionId, messages])

  const { isLoading, toolState, sendMessage, regenerateMessage, stopStreaming } = useStreamingChat({
    onRegenerateStart: () => {
      // Scroll to position the new message in view when regenerating with smooth animation
      requestAnimationFrame(() => {
        scrollToBottom(true)
      })
    },
  })
  const displayedIsLoading = isLoading && displayedSessionIsCurrent
  const handledChatLinkKeysRef = useRef(new Set<string>())

  const vibe = useMemo(() => {
    const texts = settings.placeholderStyle === 'normal' ? NORMAL_PLACEHOLDERS : GENZ_PLACEHOLDERS
    return texts[Math.floor(Math.random() * texts.length)]
  }, [settings.placeholderStyle])

  const promptAutoHideSettings = settings.promptAutoHide
  const { isPromptHidden, resetTimer, triggerZoneProps } = usePromptAutoHide({
    enabled: promptAutoHideSettings.enabled,
    isLoading,
    isFocused: promptFocused,
    hasInput: input.trim().length > 0,
    hasFiles: attachedFiles.length > 0,
    timeoutSeconds: promptAutoHideSettings.timeout,
    textareaRef: inputTextareaRef as React.RefObject<HTMLTextAreaElement | null>,
  })

  const handlePromptActivity = useCallback(() => {
    resetTimer()
  }, [resetTimer])

  const handlePromptFocusChange = useCallback((focused: boolean) => {
    setPromptFocused(focused)
  }, [])

  const handleTextareaRefCallback = useCallback(
    (ref: React.RefObject<HTMLTextAreaElement | null>) => {
      inputTextareaRef.current = ref.current
    },
    []
  )

  // Quick-send: consume a pending message queued from the command palette
  const { pendingRequest, consumeRequest } = useQuickSend()
  useEffect(() => {
    if (!pendingRequest || isLoading || currentSessionIsLoading) return
    if (pendingRequest.sessionId && pendingRequest.sessionId !== currentSessionId) return

    const request = consumeRequest()
    if (request?.content) {
      sendMessage(request.content, [])
    }
  }, [
    pendingRequest,
    isLoading,
    currentSessionIsLoading,
    currentSessionId,
    consumeRequest,
    sendMessage,
  ])

  useEffect(() => {
    if (currentSessionId && currentSessionIsLoading) {
      // Fast tail load + background full (consistent with global chat loading strategy)
      void loadFullSession(currentSessionId, { limit: 80 })
      setTimeout(() => void loadFullSession(currentSessionId), 150)
    }
  }, [currentSessionId, currentSessionIsLoading, loadFullSession])

  const handleChatLinkRequest = useCallback(
    async (request: { sessionId: string; message: string; receivedAt: number }) => {
      const sessionId = request.sessionId.trim()
      const message = request.message.trim()
      if (!sessionId || !message || isLoading) return false

      const dedupeKey = `${sessionId}:${request.receivedAt}:${message}`
      if (handledChatLinkKeysRef.current.has(dedupeKey)) return true

      let targetSession = sessions.find((session) => session.id === sessionId) ?? null
      if (!targetSession) {
        // Prefer full for deep link continuation
        targetSession = await loadFullSession(sessionId)
      }
      if (!targetSession) {
        showToast('Could not continue chat: session not found.', 'error')
        handledChatLinkKeysRef.current.add(dedupeKey)
        return true
      }

      if (currentSessionId !== sessionId) {
        switchSession(sessionId)
        await loadFullSession(sessionId)
        return false
      }

      if (currentSessionIsLoading) return false

      handledChatLinkKeysRef.current.add(dedupeKey)
      await sendMessage(message, [])
      return true
    },
    [
      currentSessionId,
      currentSessionIsLoading,
      isLoading,
      loadFullSession,
      sendMessage,
      sessions,
      showToast,
      switchSession,
    ]
  )

  useEffect(() => {
    if (!window.chatLinks) return

    let active = true
    const drainPending = async () => {
      if (!active || isLoading || currentSessionIsLoading) return
      const requests = await window.chatLinks!.peekPending()
      for (const request of requests) {
        if (!active) return
        const handled = await handleChatLinkRequest(request)
        if (!handled) return
      }

      if (!active) return
      const remaining = await window.chatLinks!.peekPending()
      const unhandled = remaining.filter((request) => {
        const key = `${request.sessionId}:${request.receivedAt}:${request.message.trim()}`
        return !handledChatLinkKeysRef.current.has(key)
      })
      if (unhandled.length === 0 && remaining.length > 0) {
        await window.chatLinks!.consumePending()
      }
    }

    drainPending().catch(() => undefined)
    const unsubscribe = window.chatLinks.onMessage(() => {
      drainPending().catch(() => undefined)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [currentSessionId, currentSessionIsLoading, handleChatLinkRequest, isLoading])

  useEffect(() => {
    const handlePromptShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return

      const activeElement = document.activeElement as HTMLElement | null
      const tagName = activeElement?.tagName
      const isEditable =
        activeElement?.isContentEditable === true ||
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT'

      if (isEditable) return

      const key = event.key.toLowerCase()
      const isFocusPromptShortcut = (event.metaKey || event.ctrlKey) && key === 'k'
      if (!isFocusPromptShortcut) return

      event.preventDefault()
      inputTextareaRef.current?.focus()
    }

    window.addEventListener('keydown', handlePromptShortcut)
    return () => window.removeEventListener('keydown', handlePromptShortcut)
  }, [])

  const { scrollToBottom } = usePinnedAutoScroll({
    containerRef: messagesContainerRef,
    isStreaming: isLoading && Boolean(streamingState?.isStreaming),
    streamSessionId: streamingState?.sessionId,
    currentSessionId,
    streamingContent: streamingState?.content,
    streamingThinking: streamingState?.thinking,
    messageCount: displayedMessages.length,
    lastMessageId: displayedMessages[displayedMessages.length - 1]?.id || null,
  })

  const handleSendMessage = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || isLoading) return
    await sendMessage(input.trim(), attachedFiles)
  }

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

  const visibleLiveToolResults = useMemo(
    () =>
      isShowingLoadingFallback
        ? []
        : toolState.toolResults.filter((result) => !shouldHideGenericToolResultCard(result)),
    [isShowingLoadingFallback, toolState.toolResults]
  )
  const displayActiveToolCalls = isShowingLoadingFallback
    ? []
    : toolState.activeToolBatch.length > 0
      ? toolState.activeToolBatch
      : toolState.activeToolCalls

  if (!currentSessionId || (displayedMessages.length === 0 && !currentSessionIsLoading)) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: 0,
          background: 'var(--theme-content-solid)',
          padding: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '28px',
            maxWidth: 'min(860px, 100%)',
            width: '100%',
          }}
        >
          <div
            style={{
              fontSize: 'clamp(2rem, 4.2vw, 3.25rem)',
              fontWeight: 500,
              letterSpacing: '-0.035em',
              color: 'var(--theme-text-primary)',
              textAlign: 'center',
              lineHeight: 1.08,
              minHeight: '1.2em',
              maxWidth: '24ch',
            }}
          >
            {vibe}
          </div>
          <div style={{ width: '100%', maxWidth: 'min(860px, 100%)' }}>
            <InputArea
              input={input}
              setInput={setInput}
              onSend={handleSendMessage}
              onStop={stopStreaming}
              isLoading={isLoading}
              attachedFiles={attachedFiles}
              onFilesChange={setAttachedFiles}
              onError={(msg) => showToast(msg, 'error')}
              showContextRing={false}
              layoutVariant="landing"
              folderContextName={currentFolderName}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        background: 'var(--theme-content-solid)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <MessageScrollerProvider autoScroll defaultScrollPosition="end" scrollMargin={16}>
        <MessageScroller data-select-all-scope="chat" className="flex-1">
          <ChatScrollRail messages={displayedMessages} />
          <MessageScrollerViewport
            ref={messagesContainerRef}
            data-select-all-scope="chat"
            className="chat-message-scroller-viewport"
          >
            <MessageScrollerContent className="chat-message-scroller-content">
              {displayedMessages.map((msg, idx) => {
                const isLastAssistant = msg.role === 'assistant' && idx === displayedMessages.length - 1
                const isStreamingMessage = displayedIsLoading && isLastAssistant

                return (
                  <MessageScrollerItem
                    key={msg.id}
                    messageId={msg.id}
                    scrollAnchor={msg.role === 'user'}
                    className="chat-message-scroller-item"
                  >
                    <div data-message-id={msg.id}>
                      {isStreamingMessage ? (
                        <StreamingMessage
                          message={msg}
                          sessionId={displayedSessionId!}
                          activeToolCalls={displayActiveToolCalls}
                          onCopy={handleCopy}
                          onRegenerate={(instruction) => {
                            if (displayedSessionIsCurrent) regenerateMessage(msg, instruction)
                          }}
                        />
                      ) : (
                        <MessageRenderer
                          message={msg}
                          isStreaming={false}
                          sessionId={displayedSessionId || undefined}
                          onCopy={handleCopy}
                          onRegenerate={(instruction) => {
                            if (displayedSessionIsCurrent) regenerateMessage(msg, instruction)
                          }}
                        />
                      )}

                      {isLastAssistant && visibleLiveToolResults.length > 0 && (
                        <div style={{ marginTop: '8px', marginBottom: '24px' }}>
                          {visibleLiveToolResults.map((result, i) => (
                            <ToolResultDisplay
                              key={i}
                              toolName={result.toolCall.name}
                              result={result.result.success ? result.result.data : undefined}
                              error={result.result.success ? undefined : result.result.error}
                              metadata={result.result?.metadata}
                              toolArguments={result.toolCall.arguments}
                              executionTime={result.result?.executionTime}
                              sessionId={displayedSessionId || undefined}
                              messageId={msg.id}
                              toolResultIndex={i}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </MessageScrollerItem>
                )
              })}

              {!isLoading &&
                displayActiveToolCalls.map((toolCall, i) => (
                  <div key={`tool-active-${i}`} style={{ marginBottom: '12px' }}>
                    <ToolCallIndicator
                      toolName={toolCall.name}
                      status="executing"
                      arguments={toolCall.arguments}
                    />
                  </div>
                ))}

              {displayedIsLoading && <div style={{ minHeight: 'calc(100% - 350px)' }} />}

              <div ref={messagesEndRef} />
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <motion.div
        className="chat-input-overlay"
        animate={isPromptHidden ? { y: '100%', opacity: 0 } : { y: 0, opacity: 1 }}
        initial={false}
        transition={{ type: 'tween', duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        style={{ willChange: 'transform, opacity' }}
        aria-hidden={isPromptHidden}
      >
        <div
          className="chat-input-overlay__inner"
          style={{ pointerEvents: isPromptHidden ? 'none' : undefined }}
        >
          <InputArea
            input={input}
            setInput={setInput}
            onSend={handleSendMessage}
            onStop={stopStreaming}
            isLoading={isLoading}
            attachedFiles={attachedFiles}
            onFilesChange={setAttachedFiles}
            onError={(msg) => showToast(msg, 'error')}
            showContextRing={true}
            folderContextName={currentFolderName}
            onActivity={handlePromptActivity}
            onFocusChange={handlePromptFocusChange}
            textareaRefCallback={handleTextareaRefCallback}
          />
        </div>
      </motion.div>

      <AnimatePresence>
        {isPromptHidden && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            {...triggerZoneProps}
            style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '100%',
              maxWidth: 'min(735px, 100%)',
              height: '48px',
              cursor: 'pointer',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '4px',
                borderRadius: '2px',
                background: 'var(--theme-text-muted)',
                opacity: 0.4,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <style>{CHAT_AREA_STYLES}</style>
    </div>
  )
}
