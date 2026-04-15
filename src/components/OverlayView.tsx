import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { ToolCallIndicator, ToolResultDisplay } from '@/tools/ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { useChatHistory } from '../contexts/ChatHistoryContext'
import { useSettings } from '../contexts/SettingsContext'
import { useStreamingState } from '../contexts/StreamingContext'
import { useToast } from './shared/Toast'
import { MessageRenderer } from './Dashboard/ChatArea/MessageRenderer'
import { StreamingMessage } from './Dashboard/ChatArea/StreamingMessage'
import { useStreamingChat } from './Dashboard/ChatArea/hooks'
import { shouldHideGenericToolResultCard } from './Dashboard/ChatArea/toolResultVisibility'
import { Plus, Send, Square, X } from './icons'
import { usePromptAutoHide } from './Dashboard/ChatArea/hooks/usePromptAutoHide'

export default function OverlayView() {
  const { sessions, currentSessionId, createSession } = useChatHistory()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const streamingState = useStreamingState()
  const [input, setInput] = useState('')
  const [overlayMode, setOverlayMode] = useState<'compact' | 'expanded'>('expanded')
  const [promptFocused, setPromptFocused] = useState(false)
  const inputTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const hasInput = input.trim().length > 0

  const currentSession = sessions.find((session) => session.id === currentSessionId) || null
  const messages = currentSession?.messages || []

  const { isLoading, toolState, sendMessage, regenerateMessage, stopStreaming } = useStreamingChat({
    onMessageSent: () => {
      setInput('')
    },
  })

  const visibleLiveToolResults = useMemo(
    () => toolState.toolResults.filter((result) => !shouldHideGenericToolResultCard(result)),
    [toolState.toolResults]
  )
  const isCompact = overlayMode === 'compact'
  const hasConversation = messages.length > 0 || isLoading || visibleLiveToolResults.length > 0

  const overlayPromptAutoHideEnabled = settings.overlay.promptAutoHideEnabled ?? false
  const overlayPromptAutoHideTimeout = settings.overlay.promptAutoHideTimeout ?? 120
  const { isPromptHidden, resetTimer, triggerZoneProps } = usePromptAutoHide({
    enabled: !isCompact && overlayPromptAutoHideEnabled,
    isLoading,
    isFocused: promptFocused,
    hasInput,
    hasFiles: false,
    timeoutSeconds: overlayPromptAutoHideTimeout,
    textareaRef: inputTextareaRef as React.RefObject<HTMLTextAreaElement | null>,
  })

  const syncOverlayMode = useCallback(async () => {
    try {
      const state = await window.overlay.getState()
      if (state.mode === 'expanded') {
        setOverlayMode(state.mode)
      }
    } catch {
      // Overlay mode is optional UI state; keep the existing layout if the bridge fails.
    }
  }, [])

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

  const handleCreateChat = useCallback(() => {
    createSession()
    setInput('')
    resetTimer()
  }, [createSession, resetTimer])

  const handleCopy = useCallback((content: string) => {
    void navigator.clipboard.writeText(content)
  }, [])

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
    void syncOverlayMode()
  }, [syncOverlayMode])

  useEffect(() => {
    if (!window.overlay?.onPendingPrompt) return

    const unsubscribe = window.overlay.onPendingPrompt((prompt: string) => {
      if (prompt.trim() && !isLoading) {
        void sendMessage(prompt.trim(), [])
      }
    })

    return unsubscribe
  }, [isLoading, sendMessage])

  useEffect(() => {
    const handleEscapeClose = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      void handleHide()
    }

    window.addEventListener('keydown', handleEscapeClose)
    return () => window.removeEventListener('keydown', handleEscapeClose)
  }, [handleHide])

  if (isCompact) {
    return (
      <div className="prompt-popup-root" style={{ color: 'var(--theme-text-primary)', outline: 'none' }}>
        <div className="prompt-popup-composer">
          {hasConversation ? (
            <div
              style={{
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                maxHeight: 190,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <ScrollArea
                className="flex-1"
                viewportStyle={{ padding: '12px 14px 10px', minHeight: 0 }}
                style={{ maxHeight: 190, minHeight: 0 }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {messages.map((message, index) => {
                    const isLastAssistant = message.role === 'assistant' && index === messages.length - 1
                    const isStreamingMessage = isLoading && isLastAssistant

                    return (
                      <div key={message.id}>
                        {isStreamingMessage ? (
                          <StreamingMessage
                            message={message}
                            sessionId={currentSessionId!}
                            activeToolCalls={toolState.activeToolCalls}
                            onCopy={handleCopy}
                            onRegenerate={(instruction) => regenerateMessage(message, instruction)}
                          />
                        ) : (
                          <MessageRenderer
                            message={message}
                            isStreaming={false}
                            sessionId={currentSessionId || undefined}
                            onCopy={handleCopy}
                            onRegenerate={(instruction) => regenerateMessage(message, instruction)}
                          />
                        )}

                        {isLastAssistant && visibleLiveToolResults.length > 0 && (
                          <div style={{ marginTop: 8, marginBottom: 14 }}>
                            {visibleLiveToolResults.map((result, resultIndex) => (
                              <ToolResultDisplay
                                key={`${message.id}-tool-${resultIndex}`}
                                toolName={result.toolCall.name}
                                result={result.result.success ? result.result.data : undefined}
                                error={result.result.success ? undefined : result.result.error}
                                metadata={result.result?.metadata}
                                toolArguments={result.toolCall.arguments}
                                executionTime={result.result?.executionTime}
                                sessionId={currentSessionId || undefined}
                                messageId={message.id}
                                toolResultIndex={resultIndex}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {!isLoading &&
                    toolState.activeToolCalls.map((toolCall, index) => (
                      <div key={`active-tool-${index}`}>
                        <ToolCallIndicator
                          toolName={toolCall.name}
                          status="executing"
                          arguments={toolCall.arguments}
                        />
                      </div>
                    ))}

                  {isLoading && streamingState?.content ? (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--theme-text-muted)',
                        letterSpacing: '0.02em',
                      }}
                    >
                      Streaming response...
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </div>
          ) : null}

          <div
            style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(14, 14, 16, 0.88)',
            }}
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void handleSend()
                }

                if (event.key === 'Escape') {
                  void handleHide()
                }
              }}
              placeholder="Ask anything..."
              rows={2}
              className="prompt-popup-textarea"
              style={{
                minHeight: 52,
              }}
            />

            <div className="prompt-popup-footer" style={{ justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)', paddingLeft: 6 }}>
                {isLoading ? 'Working...' : hasConversation ? 'Continue here' : 'Enter to send'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleHide}
                  className="prompt-popup-send"
                  aria-label="Hide overlay"
                  title="Hide overlay"
                >
                  <X size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isLoading) {
                      stopStreaming()
                      return
                    }
                    void handleSend()
                  }}
                  className="prompt-popup-send"
                >
                  {isLoading ? 'Stop' : <Send size={15} strokeWidth={2.2} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={!isCompact ? 'overlay__glass-shell' : undefined}
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        padding: isCompact ? '10px' : undefined,
        background: isCompact
          ? 'transparent'
          : 'linear-gradient(180deg, rgba(14, 18, 26, 0.56) 0%, rgba(12, 16, 24, 0.66) 100%)',
        backdropFilter: isCompact ? undefined : 'blur(18px) saturate(128%)',
        WebkitBackdropFilter: isCompact ? undefined : 'blur(18px) saturate(128%)',
        border: 'none',
        borderRadius: isCompact ? undefined : 16,
        boxShadow: isCompact
          ? undefined
          : 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 18px 42px rgba(0, 0, 0, 0.34)',
        color: 'var(--theme-text-primary)',
        outline: 'none',
      }}
    >
      {!isCompact ? (
        <div
          aria-hidden="true"
          className="overlay__drag-strip"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 18,
            WebkitAppRegion: 'drag',
            cursor: 'move',
            zIndex: 2,
          } as React.CSSProperties}
        />
      ) : null}

      <ScrollArea
        className="flex-1"
        viewportStyle={{
          padding: isCompact ? '0 12px 10px' : '18px 10px 16px',
          minHeight: 0,
        }}
        style={{
          minHeight: 0,
          background: isCompact
            ? 'rgba(18, 18, 20, 0.96)'
            : 'linear-gradient(180deg, rgba(8, 10, 14, 0.18) 0%, rgba(8, 10, 14, 0.3) 100%)',
          borderLeft: isCompact ? '1px solid rgba(255, 255, 255, 0.1)' : undefined,
          borderRight: isCompact ? '1px solid rgba(255, 255, 255, 0.1)' : undefined,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            textShadow: '0 1px 1px rgba(0, 0, 0, 0.42)',
          }}
        >
          {!hasConversation ? (
            <div
              style={{
                padding: isCompact ? '6px 2px 2px' : 18,
                minHeight: isCompact ? 84 : undefined,
              }}
            >
              {!isCompact ? (
                <>
                  <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 6 }}>
                    Ask without opening the dashboard
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--theme-text-muted)' }}>
                    The overlay reuses your current providers, tools, MCP servers, and chat history.
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            messages.map((message, index) => {
              const isLastAssistant = message.role === 'assistant' && index === messages.length - 1
              const isStreamingMessage = isLoading && isLastAssistant

              return (
                <div key={message.id}>
                  {isStreamingMessage ? (
                    <StreamingMessage
                      message={message}
                      sessionId={currentSessionId!}
                      activeToolCalls={toolState.activeToolCalls}
                      onCopy={handleCopy}
                      onRegenerate={(instruction) => regenerateMessage(message, instruction)}
                    />
                  ) : (
                    <MessageRenderer
                      message={message}
                      isStreaming={false}
                      sessionId={currentSessionId || undefined}
                      onCopy={handleCopy}
                      onRegenerate={(instruction) => regenerateMessage(message, instruction)}
                    />
                  )}

                  {isLastAssistant && visibleLiveToolResults.length > 0 && (
                    <div style={{ marginTop: 8, marginBottom: 18 }}>
                      {visibleLiveToolResults.map((result, resultIndex) => (
                        <ToolResultDisplay
                          key={`${message.id}-tool-${resultIndex}`}
                          toolName={result.toolCall.name}
                          result={result.result.success ? result.result.data : undefined}
                          error={result.result.success ? undefined : result.result.error}
                          metadata={result.result?.metadata}
                          toolArguments={result.toolCall.arguments}
                          executionTime={result.result?.executionTime}
                          sessionId={currentSessionId || undefined}
                          messageId={message.id}
                          toolResultIndex={resultIndex}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}

          {!isLoading &&
            toolState.activeToolCalls.map((toolCall, index) => (
              <div key={`active-tool-${index}`}>
                <ToolCallIndicator
                  toolName={toolCall.name}
                  status="executing"
                  arguments={toolCall.arguments}
                />
              </div>
            ))}

          {isLoading && streamingState?.content ? (
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--theme-text-muted)',
                letterSpacing: '0.02em',
              }}
            >
              Streaming response...
            </div>
          ) : null}
        </div>
      </ScrollArea>

      {!isCompact && isPromptHidden ? (
        <div
          {...triggerZoneProps}
          style={{
            position: 'absolute',
            bottom: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '100%',
            maxWidth: '100%',
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
              opacity: 0.36,
            }}
          />
        </div>
      ) : null}

      <div
        style={{
          padding: isCompact ? '0 10px 10px' : '4px 10px 10px',
          borderTop: 'none',
          background: 'transparent',
          transform: !isCompact && isPromptHidden ? 'translateY(118%)' : undefined,
          opacity: !isCompact && isPromptHidden ? 0 : 1,
          pointerEvents: !isCompact && isPromptHidden ? 'none' : undefined,
          transition: !isCompact
            ? 'transform 360ms cubic-bezier(0.22, 1, 0.36, 1), opacity 280ms cubic-bezier(0.22, 1, 0.36, 1)'
            : undefined,
        }}
        onMouseMove={!isCompact ? resetTimer : undefined}
      >
        <div
          className={isCompact ? 'prompt-popup-composer' : undefined}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: isCompact ? 10 : '8px 10px 8px',
            borderRadius: isCompact ? 18 : 20,
            border: isCompact ? undefined : '1px solid rgba(255, 255, 255, 0.14)',
            background: isCompact
              ? undefined
              : 'linear-gradient(180deg, rgba(10, 14, 22, 0.72) 0%, rgba(8, 12, 20, 0.8) 100%)',
            backdropFilter: isCompact ? undefined : 'blur(10px) saturate(120%)',
            WebkitBackdropFilter: isCompact ? undefined : 'blur(10px) saturate(120%)',
            position: 'relative',
            overflow: 'visible',
          }}
          onMouseEnter={() => {
            if (!isCompact) {
              resetTimer()
            }
          }}
        >
          <textarea
            ref={inputTextareaRef}
            value={input}
            onChange={(event) => {
              setInput(event.target.value)
              if (!isCompact) {
                resetTimer()
              }
            }}
            onFocus={() => setPromptFocused(true)}
            onBlur={() => setPromptFocused(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleSend()
                return
              }

              if (event.key === 'Escape') {
                event.preventDefault()
                void handleHide()
              }
            }}
            placeholder={isCompact ? 'Message ZuraAI...' : 'Ask anything...'}
            rows={isCompact ? 2 : 1}
            className={isCompact ? 'prompt-popup-textarea' : undefined}
            style={{
              width: '100%',
              minHeight: isCompact ? 52 : 40,
              maxHeight: isCompact ? undefined : 110,
              resize: 'none',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--theme-text-primary)',
              fontSize: isCompact ? undefined : '0.98rem',
              fontWeight: isCompact ? undefined : 500,
              fontFamily: 'inherit',
              lineHeight: isCompact ? 1.45 : 1.4,
              letterSpacing: isCompact ? undefined : '-0.005em',
              padding: isCompact ? '0 2px' : '0 2px',
            }}
          />

          <div
            className={isCompact ? 'prompt-popup-footer' : undefined}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!isCompact ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="overlay__plus-button"
                      onClick={() => resetTimer()}
                      aria-label="More actions"
                      title="More actions"
                    >
                      <Plus size={16} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" sideOffset={8} className="min-w-[140px]">
                    <DropdownMenuItem
                      onClick={() => {
                        handleCreateChat()
                      }}
                    >
                      New chat
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        void handleHide()
                      }}
                    >
                      Close overlay
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => {
                if (isLoading) {
                  stopStreaming()
                  return
                }
                void handleSend()
              }}
              className={
                isCompact
                  ? 'prompt-popup-send'
                  : isLoading
                    ? 'overlay__send-button overlay__send-button--stop'
                    : 'overlay__send-button'
              }
              data-ready={!isLoading && hasInput ? 'true' : undefined}
              aria-label={isLoading ? 'Stop generation' : 'Send message'}
            >
              {isLoading ? (
                <Square size={12} className="overlay__stop-icon" />
              ) : (
                <>
                  <Send size={17} strokeWidth={2.4} />
                </>
              )}
            </button>
          </div>

        </div>
      </div>

      <style>{`
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
          .overlay__glass-shell {
            background: rgba(12, 14, 20, 0.9) !important;
          }
        }
        .overlay__glass-shell::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          background:
            linear-gradient(180deg, rgba(10, 12, 18, 0.16) 0%, rgba(10, 12, 18, 0.2) 100%),
            radial-gradient(120% 52% at 50% -14%, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0) 70%),
            radial-gradient(100% 70% at 50% 118%, rgba(8, 10, 16, 0.44) 0%, rgba(8, 10, 16, 0) 72%),
            radial-gradient(64% 108% at -8% 50%, rgba(10, 14, 22, 0.28) 0%, rgba(10, 14, 22, 0) 74%),
            radial-gradient(64% 108% at 108% 50%, rgba(10, 14, 22, 0.28) 0%, rgba(10, 14, 22, 0) 74%);
        }
        .overlay__glass-shell > * {
          position: relative;
          z-index: 1;
        }
        .overlay__send-button {
          width: 42px;
          height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(36, 42, 56, 0.74);
          color: rgba(175, 184, 203, 0.78);
          border-radius: 999px;
          cursor: pointer;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
          transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
        }
        .overlay__send-button[data-ready='true'] {
          background: linear-gradient(145deg, rgba(94, 160, 255, 0.96) 0%, rgba(90, 112, 255, 0.98) 100%);
          border-color: rgba(156, 198, 255, 0.62);
          color: rgba(246, 250, 255, 0.98);
          box-shadow: 0 8px 18px rgba(60, 108, 255, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.3);
        }
        .overlay__send-button--stop {
          background: rgba(94, 58, 66, 0.58);
          border-color: rgba(226, 120, 132, 0.45);
          color: rgba(255, 224, 228, 0.96);
          box-shadow: 0 8px 20px rgba(124, 62, 74, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }
        .overlay__stop-icon {
          fill: currentColor;
          strokeWidth: 2.8;
        }
        .overlay__plus-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 999px;
          border: none;
          background: transparent;
          color: rgba(222, 229, 240, 0.9);
          cursor: pointer;
          transition: color 140ms ease;
        }
      `}</style>
    </div>
  )
}
