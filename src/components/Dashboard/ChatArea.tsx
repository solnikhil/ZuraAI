/**
 * Primary dashboard chat surface.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { VirtualMessageList } from './ChatArea/VirtualMessageList'
import { InputArea } from './ChatArea/InputArea'
import { shouldHideGenericToolResultCard } from './ChatArea/toolResultVisibility'
import { useStreamingChat, usePromptAutoHide } from './ChatArea/hooks'
import { usePinnedAutoScroll } from './ChatArea/hooks/usePinnedAutoScroll'
import type { AttachedFile } from './ChatArea/attachmentUtils'
import { NORMAL_PLACEHOLDERS, GENZ_PLACEHOLDERS } from './ChatArea/placeholders'
import { CHAT_AREA_STYLES } from './ChatArea/chatAreaStyles'

/**
 * Virtualization threshold - activate virtual scrolling for lists > 50 messages
 */
const VIRTUALIZATION_THRESHOLD = 50

export default function ChatArea() {
  const { sessions, currentSessionId, isSessionLoaded, loadFullSession, switchSession } =
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
  const currentSessionMessageCount = currentSession?.messageCount ?? messages.length
  const currentSessionIsLoading = Boolean(
    currentSessionId && currentSessionMessageCount > 0 && !isSessionLoaded(currentSessionId)
  )

  const useVirtualization = messages.length > VIRTUALIZATION_THRESHOLD

  const { isLoading, toolState, sendMessage, regenerateMessage, stopStreaming } = useStreamingChat({
    onRegenerateStart: () => {
      // Scroll to position the new message in view when regenerating with smooth animation
      requestAnimationFrame(() => {
        scrollToBottom(true)
      })
    },
  })
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
      void loadFullSession(currentSessionId)
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
    messageCount: messages.length,
    lastMessageId: messages[messages.length - 1]?.id || null,
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
    () => toolState.toolResults.filter((result) => !shouldHideGenericToolResultCard(result)),
    [toolState.toolResults]
  )
  const displayActiveToolCalls =
    toolState.activeToolBatch.length > 0 ? toolState.activeToolBatch : toolState.activeToolCalls

  const renderMessage = useCallback(
    (index: number, msg: (typeof messages)[0]) => {
      const isLastAssistant = msg.role === 'assistant' && index === messages.length - 1
      const isStreamingMsg = isLoading && isLastAssistant

      return (
        <div data-message-id={msg.id}>
          {isStreamingMsg ? (
            <StreamingMessage
              message={msg}
              sessionId={currentSessionId!}
              activeToolCalls={displayActiveToolCalls}
              onCopy={handleCopy}
              onRegenerate={(instruction) => regenerateMessage(msg, instruction)}
            />
          ) : (
            <MessageRenderer
              message={msg}
              isStreaming={false}
              sessionId={currentSessionId || undefined}
              onCopy={handleCopy}
              onRegenerate={(instruction) => regenerateMessage(msg, instruction)}
            />
          )}

          {isLastAssistant && !msg.agentRun && visibleLiveToolResults.length > 0 && (
            <div style={{ marginTop: '8px', marginBottom: '24px' }}>
              {visibleLiveToolResults.map((result, i) => (
                <ToolResultDisplay
                  key={i}
                  toolName={result.toolCall.name}
                  result={result.result?.success ? result.result.data : undefined}
                  error={result.result?.success ? undefined : result.result?.error}
                  metadata={result.result?.metadata}
                  sessionId={currentSessionId || undefined}
                  messageId={msg.id}
                  toolResultIndex={i}
                />
              ))}
            </div>
          )}
        </div>
      )
    },
    [
      messages.length,
      isLoading,
      currentSessionId,
      handleCopy,
      regenerateMessage,
      visibleLiveToolResults,
      displayActiveToolCalls,
    ]
  )

  if (!currentSessionId || (messages.length === 0 && !currentSessionIsLoading)) {
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
        minHeight: 0,
        background: 'var(--theme-content-solid)',
        position: 'relative',
      }}
    >
      {useVirtualization ? (
        <VirtualMessageList
          messages={messages}
          sessionId={currentSessionId!}
          isGenerating={isLoading}
          streamingContent={streamingState?.content || ''}
          autoScrollEnabled={true}
          renderMessage={renderMessage}
          footer={
            <>
              {!isLoading &&
                displayActiveToolCalls.map((toolCall, i) => (
                  <div key={`tool-active-${i}`} style={{ marginBottom: '12px', padding: '0 20px' }}>
                    <ToolCallIndicator
                      toolName={toolCall.name}
                      status="executing"
                      arguments={toolCall.arguments}
                    />
                  </div>
                ))}
            </>
          }
        />
      ) : (
        <ScrollArea
          className="flex-1"
          data-select-all-scope="chat"
          style={{ minHeight: 0 }}
          viewportRef={messagesContainerRef}
          viewportStyle={{ padding: '16px 20px 112px 20px', minHeight: 0 }}
        >
          <div
            data-select-all-scope="chat"
            style={{
              width: '100%',
              maxWidth: 'min(735px, 100%)',
              margin: '0 auto',
              minHeight: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {messages.map((msg, idx) => {
              const isLastAssistant = msg.role === 'assistant' && idx === messages.length - 1
              const isStreamingMessage = isLoading && isLastAssistant

              return (
                <div key={msg.id} data-message-id={msg.id}>
                  {isStreamingMessage ? (
                    <StreamingMessage
                      message={msg}
                      sessionId={currentSessionId!}
                      activeToolCalls={displayActiveToolCalls}
                      onCopy={handleCopy}
                      onRegenerate={(instruction) => regenerateMessage(msg, instruction)}
                    />
                  ) : (
                    <MessageRenderer
                      message={msg}
                      isStreaming={false}
                      sessionId={currentSessionId || undefined}
                      onCopy={handleCopy}
                      onRegenerate={(instruction) => regenerateMessage(msg, instruction)}
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
                          sessionId={currentSessionId || undefined}
                          messageId={msg.id}
                          toolResultIndex={i}
                        />
                      ))}
                    </div>
                  )}
                </div>
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

            {isLoading && <div style={{ minHeight: 'calc(100% - 350px)' }} />}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      )}

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
