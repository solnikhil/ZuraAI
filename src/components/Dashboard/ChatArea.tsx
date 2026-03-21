/**
 * Primary dashboard chat surface.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import GradientText from '../GradientText'
import { useToast } from '../shared/Toast'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useStreamingState } from '../../contexts/StreamingContext'
import { useQuickSend } from '../../contexts/QuickSendContext'
import { useSettings } from '../../contexts/SettingsContext'
import { ToolCallIndicator, ToolResultDisplay } from '../../tools/ui'

import { MessageRenderer } from './ChatArea/MessageRenderer'
import { StreamingMessage } from './ChatArea/StreamingMessage'
import { VirtualMessageList } from './ChatArea/VirtualMessageList'
import { InputArea } from './ChatArea/InputArea'
import { useStreamingChat, usePromptAutoHide } from './ChatArea/hooks'
import type { AttachedFile } from './ChatArea/attachmentUtils'

/**
 * Virtualization threshold - activate virtual scrolling for lists > 50 messages
 */
const VIRTUALIZATION_THRESHOLD = 50

export default function ChatArea() {
  const { sessions, currentSessionId } = useChatHistory()
  const { settings } = useSettings()
  const { showToast } = useToast()

  const streamingState = useStreamingState()

  const [input, setInput] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [promptFocused, setPromptFocused] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  const currentSession = sessions.find((s) => s.id === currentSessionId)
  const messages = currentSession?.messages || []

  const useVirtualization = messages.length > VIRTUALIZATION_THRESHOLD

  const prevMessageCountRef = useRef(messages.length)
  const lastMessageIdRef = useRef<string | null>(null)
  const hasScrolledToNewMessageRef = useRef(false)
  const userScrolledAwayRef = useRef(false)

  const { isLoading, toolState, sendMessage, regenerateMessage, stopStreaming } = useStreamingChat({
    onMessageSent: () => {
      setInput('')
      setAttachedFiles([])
    },
    onRegenerateStart: () => {
      // Scroll to position the new message in view when regenerating with smooth animation
      requestAnimationFrame(() => {
        scrollToNewMessage(true)
      })
    },
  })

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
  const { pendingMessage, consumeMessage } = useQuickSend()
  useEffect(() => {
    if (!pendingMessage || isLoading) return
    const message = consumeMessage()
    if (message) {
      sendMessage(message, [])
    }
  }, [pendingMessage, isLoading, consumeMessage, sendMessage])

  useEffect(() => {
    const handlePromptShortcut = (event: KeyboardEvent) => {
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

  const scrollToNewMessage = (smooth = false) => {
    const container = messagesContainerRef.current
    if (!container) return
    const scrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    if (smooth) {
      container.scrollTo({ top: scrollTop, behavior: 'smooth' })
    } else {
      container.scrollTop = scrollTop
    }
  }

  const isNearBottom = () => {
    if (!messagesContainerRef.current) return true
    const container = messagesContainerRef.current
    const threshold = 150
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold
  }

  // Track user scroll during streaming
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      if (isLoading && !isNearBottom()) {
        userScrolledAwayRef.current = true
      } else if (isNearBottom()) {
        userScrolledAwayRef.current = false
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [isLoading])

  // Handle new message detection and scroll
  useEffect(() => {
    const currentMessageCount = messages.length
    const lastMessage = messages[messages.length - 1]
    const lastMessageId = lastMessage?.id || null

    if (
      currentMessageCount > prevMessageCountRef.current ||
      lastMessageId !== lastMessageIdRef.current
    ) {
      hasScrolledToNewMessageRef.current = false
      userScrolledAwayRef.current = false

      requestAnimationFrame(() => {
        if (!hasScrolledToNewMessageRef.current) {
          scrollToNewMessage()
          hasScrolledToNewMessageRef.current = true
        }
      })
    }

    prevMessageCountRef.current = currentMessageCount
    lastMessageIdRef.current = lastMessageId
  }, [messages.length, messages[messages.length - 1]?.id])

  const handleSendMessage = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || isLoading) return
    await sendMessage(input.trim(), attachedFiles)
  }

  const handleCopy = useCallback((content: string) => {
    void navigator.clipboard.writeText(content)
  }, [])

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
              activeToolCalls={toolState.activeToolCalls}
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

          {isLastAssistant && toolState.toolResults.length > 0 && (
            <div style={{ marginTop: '8px', marginBottom: '24px' }}>
              {toolState.toolResults
                .map((result, i) =>
                  result.toolCall.name === 'web_search' ? null : (
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
                  )
                )}
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
      toolState.toolResults,
      toolState.activeToolCalls,
    ]
  )

  if (!currentSessionId || messages.length === 0) {
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
          background: 'var(--theme-background)',
          padding: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            maxWidth: 'min(720px, 100%)',
            width: '100%',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <GradientText
              animationSpeed={4}
              showBorder={false}
              useThemeAccent={true}
              className="zura-title"
            >
              zura
            </GradientText>
          </div>

          <div style={{ width: '100%' }}>
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
            />
          </div>
        </div>

        <style>{`
          .zura-title {
            font-size: 4rem;
            font-weight: 800;
            letter-spacing: -0.03em;
          }
        `}</style>
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
        background: 'var(--theme-background)',
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
                toolState.activeToolCalls.map((toolCall, i) => (
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
          style={{ minHeight: 0 }}
          viewportRef={messagesContainerRef}
          viewportStyle={{ padding: '16px 20px 180px 20px', minHeight: 0 }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 'min(860px, 100%)',
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
                      activeToolCalls={toolState.activeToolCalls}
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

                  {isLastAssistant && toolState.toolResults.length > 0 && (
                    <div style={{ marginTop: '8px', marginBottom: '24px' }}>
                      {toolState.toolResults
                        .map((result, i) =>
                          result.toolCall.name === 'web_search' ? null : (
                            <ToolResultDisplay
                              key={i}
                              toolName={result.toolCall.name}
                              result={result.result.success ? result.result.data : undefined}
                              error={result.result.success ? undefined : result.result.error}
                              metadata={result.result?.metadata}
                              sessionId={currentSessionId || undefined}
                              messageId={msg.id}
                              toolResultIndex={i}
                            />
                          )
                        )}
                    </div>
                  )}
                </div>
              )
            })}

            {!isLoading &&
              toolState.activeToolCalls.map((toolCall, i) => (
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
        transition={{ type: 'tween', duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
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
            transition={{ duration: 0.18 }}
            {...triggerZoneProps}
            style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '100%',
              maxWidth: 'min(860px, 100%)',
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

      <style>{`
        .typing-indicator {
          display: flex;
          gap: 4px;
        }
        .typing-indicator span {
          width: 8px;
          height: 8px;
          background: #555;
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out both;
        }
        .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
        .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
        .empty-state-title {
          font-size: 2rem;
          font-weight: 600;
          color: var(--theme-text-primary);
          margin-bottom: 8px;
        }
        .chat-input-overlay {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          padding: 0 20px 20px;
          pointer-events: none;
          background: transparent;
        }
        .chat-input-overlay__inner {
          width: 100%;
          max-width: min(860px, 100%);
          margin: 0 auto;
          pointer-events: auto;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
