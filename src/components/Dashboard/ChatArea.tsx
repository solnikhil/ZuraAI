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
import {
  WorkspaceArtifactsPanel,
  type WorkspaceArtifact,
} from './ChatArea/WorkspaceArtifactsPanel'
import { shouldHideGenericToolResultCard } from './ChatArea/toolResultVisibility'
import { useStreamingChat, usePromptAutoHide } from './ChatArea/hooks'
import type { AttachedFile } from './ChatArea/attachmentUtils'
import { NORMAL_PLACEHOLDERS, GENZ_PLACEHOLDERS } from './ChatArea/placeholders'
import { CHAT_AREA_STYLES } from './ChatArea/chatAreaStyles'
import { PanelLeft } from 'lucide-react'

/**
 * Virtualization threshold - activate virtual scrolling for lists > 50 messages
 */
const VIRTUALIZATION_THRESHOLD = 50

export default function ChatArea() {
  const { sessions, currentSessionId, isSessionLoaded, loadFullSession } = useChatHistory()
  const { settings } = useSettings()
  const { showToast } = useToast()

  const streamingState = useStreamingState()

  const { draftText: input, setDraftText: setInput } = useComposerDraft()
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [promptFocused, setPromptFocused] = useState(false)
  const [artifactsOpen, setArtifactsOpen] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  const currentSession = sessions.find((s) => s.id === currentSessionId)
  const messages = currentSession?.messages || []
  const currentSessionMessageCount = currentSession?.messageCount ?? messages.length
  const currentSessionIsLoading =
    Boolean(currentSessionId && currentSessionMessageCount > 0 && !isSessionLoaded(currentSessionId))

  const useVirtualization = messages.length > VIRTUALIZATION_THRESHOLD

  const prevMessageCountRef = useRef(messages.length)
  const lastMessageIdRef = useRef<string | null>(null)
  const hasScrolledToNewMessageRef = useRef(false)
  const userScrolledAwayRef = useRef(false)
  const isAutoScrollingRef = useRef(false)
  const lastScrollTopRef = useRef(0)

  const { isLoading, toolState, sendMessage, regenerateMessage, stopStreaming } = useStreamingChat({
    onRegenerateStart: () => {
      // Scroll to position the new message in view when regenerating with smooth animation
      requestAnimationFrame(() => {
        scrollToNewMessage(true)
      })
    },
  })

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
  const { pendingMessage, consumeMessage } = useQuickSend()
  useEffect(() => {
    if (!pendingMessage || isLoading) return
    const message = consumeMessage()
    if (message) {
      sendMessage(message, [])
    }
  }, [pendingMessage, isLoading, consumeMessage, sendMessage])

  useEffect(() => {
    if (currentSessionId && currentSessionIsLoading) {
      void loadFullSession(currentSessionId)
    }
  }, [currentSessionId, currentSessionIsLoading, loadFullSession])

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

  const scrollToNewMessage = (smooth = false) => {
    const container = messagesContainerRef.current
    if (!container) return
    const scrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    isAutoScrollingRef.current = true
    if (smooth) {
      container.scrollTo({ top: scrollTop, behavior: 'smooth' })
    } else {
      container.scrollTop = scrollTop
    }
    window.setTimeout(() => {
      isAutoScrollingRef.current = false
    }, smooth ? 350 : 50)
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
    lastScrollTopRef.current = container.scrollTop

    const handleScroll = () => {
      const previousScrollTop = lastScrollTopRef.current
      const currentScrollTop = container.scrollTop
      const isUserScrollingUp = currentScrollTop < previousScrollTop
      lastScrollTopRef.current = currentScrollTop

      if (isLoading && isUserScrollingUp) {
        userScrolledAwayRef.current = true
        return
      }

      if (isAutoScrollingRef.current) return

      if (isLoading && !isNearBottom()) {
        userScrolledAwayRef.current = true
      } else if (isNearBottom() && currentScrollTop >= previousScrollTop) {
        userScrolledAwayRef.current = false
      }
    }

    const handleWheel = (event: WheelEvent) => {
      if (!isLoading) return
      if (event.deltaY < 0) {
        userScrolledAwayRef.current = true
      }
    }

    container.addEventListener('scroll', handleScroll)
    container.addEventListener('wheel', handleWheel, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      container.removeEventListener('wheel', handleWheel)
    }
  }, [isLoading])

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

  useEffect(() => {
    if (!isLoading || !streamingState?.isStreaming) return
    if (streamingState.sessionId !== currentSessionId) return
    if (!streamingState.content && !streamingState.thinking) return
    if (userScrolledAwayRef.current) return
    if (!isNearBottom()) {
      userScrolledAwayRef.current = true
      return
    }

    requestAnimationFrame(() => {
      if (!userScrolledAwayRef.current && isNearBottom()) {
        scrollToNewMessage()
      }
    })
  }, [
    currentSessionId,
    isLoading,
    streamingState?.content,
    streamingState?.isStreaming,
    streamingState?.sessionId,
    streamingState?.thinking,
  ])

  const handleSendMessage = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || isLoading) return
    await sendMessage(input.trim(), attachedFiles)
  }

  const handleRequestArtifactEdit = useCallback(
    async (artifact: WorkspaceArtifact, instruction: string) => {
      if (isLoading) return

      const prompt = [
        `Please edit the Markdown artifact titled "${artifact.title}" using this instruction:`,
        '',
        instruction,
        '',
        'Return the revised artifact as Markdown only. Preserve the useful structure unless the instruction says otherwise.',
        '',
        'Current artifact:',
        '',
        artifact.content,
      ].join('\n')

      await sendMessage(prompt, [])
    },
    [isLoading, sendMessage]
  )

  const handleCopy = useCallback(async (content: string) => {
    const copiedSuccessfully = await writeTextToClipboard(content)
    if (!copiedSuccessfully) {
      showToast('Unable to copy message right now.', 'error')
    }
    return copiedSuccessfully
  }, [showToast])

  const visibleLiveToolResults = useMemo(
    () => toolState.toolResults.filter((result) => !shouldHideGenericToolResultCard(result)),
    [toolState.toolResults]
  )
  const displayActiveToolCalls = toolState.activeToolBatch.length > 0
    ? toolState.activeToolBatch
    : toolState.activeToolCalls

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

  if (currentSessionIsLoading) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--theme-text-muted)',
          background: 'var(--theme-content-solid)',
        }}
      >
        Loading chat...
      </div>
    )
  }

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
        height: '100%',
        minHeight: 0,
        background: 'var(--theme-content-solid)',
        position: 'relative',
      }}
    >
      <div className="chat-workspace-stage">
        {!artifactsOpen && (
          <button
            type="button"
            className="workspace-artifacts-toggle"
            onClick={() => setArtifactsOpen(true)}
            aria-label="Open workspace artifacts"
          >
            <PanelLeft size={15} />
            <span>Artifacts</span>
          </button>
        )}

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
      </div>

      {artifactsOpen && (
        <WorkspaceArtifactsPanel
          messages={messages}
          onClose={() => setArtifactsOpen(false)}
          onRequestEdit={handleRequestArtifactEdit}
          isRequestingEdit={isLoading}
        />
      )}

      <style>{CHAT_AREA_STYLES}</style>
    </div>
  )
}
