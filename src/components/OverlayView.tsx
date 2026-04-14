import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { ToolCallIndicator, ToolResultDisplay } from '@/tools/ui'

import { useChatHistory } from '../contexts/ChatHistoryContext'
import { useSettings } from '../contexts/SettingsContext'
import { useStreamingState } from '../contexts/StreamingContext'
import { useToast } from './shared/Toast'
import { MessageRenderer } from './Dashboard/ChatArea/MessageRenderer'
import { StreamingMessage } from './Dashboard/ChatArea/StreamingMessage'
import { useStreamingChat } from './Dashboard/ChatArea/hooks'
import { shouldHideGenericToolResultCard } from './Dashboard/ChatArea/toolResultVisibility'
import { PanelLeft, Send, Square, X } from './icons'
import { usePromptAutoHide } from './Dashboard/ChatArea/hooks/usePromptAutoHide'

export default function OverlayView() {
  const { sessions, currentSessionId } = useChatHistory()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const streamingState = useStreamingState()
  const [input, setInput] = useState('')
  const [overlayMode, setOverlayMode] = useState<'compact' | 'expanded'>('expanded')
  const [promptFocused, setPromptFocused] = useState(false)
  const [composerHovered, setComposerHovered] = useState(false)

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
    hasInput: input.trim().length > 0,
    hasFiles: false,
    timeoutSeconds: overlayPromptAutoHideTimeout,
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

  const handleOpenMainApp = useCallback(async () => {
    try {
      await window.overlay.focusMainWindow()
      await window.overlay.hide()
    } catch {
      showToast('Unable to hand off to the main app right now.', 'error')
    }
  }, [showToast])

  const handleHide = useCallback(async () => {
    try {
      await window.overlay.hide()
    } catch {
      showToast('Unable to hide the Overlay right now.', 'error')
    }
  }, [showToast])

  const handleCopy = useCallback((content: string) => {
    void navigator.clipboard.writeText(content)
  }, [])

  const modelBadge = useMemo(() => {
    const allModels: Array<{ code: string; displayName: string }> = [
      ...(settings.ollamaModels || []),
      ...(settings.perplexityModels || []),
      ...(settings.configuredModels || []),
      ...(settings.groqModels || []),
      ...(settings.alibabaModels || []),
      ...(settings.fireworksModels || []),
    ]
    const match = allModels.find((model) => model.code === settings.aiModel)
    const fallback = settings.aiModel?.split('/').pop() || 'Model'
    const raw = (match?.displayName || fallback).replace(/[^\x00-\x7F]/g, '').trim()
    const shortName = raw.length > 12 ? `${raw.slice(0, 11)}…` : raw
    return shortName || 'Model'
  }, [
    settings.aiModel,
    settings.alibabaModels,
    settings.configuredModels,
    settings.fireworksModels,
    settings.groqModels,
    settings.ollamaModels,
    settings.perplexityModels,
  ])

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
          : 'linear-gradient(180deg, rgba(16, 20, 28, 0.16) 0%, rgba(12, 16, 24, 0.24) 100%)',
        backdropFilter: isCompact ? undefined : 'blur(22px) saturate(135%)',
        WebkitBackdropFilter: isCompact ? undefined : 'blur(22px) saturate(135%)',
        border: isCompact ? undefined : '1px solid rgba(255, 255, 255, 0.18)',
        borderRadius: isCompact ? undefined : 16,
        boxShadow: isCompact
          ? undefined
          : 'inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 16px 36px rgba(0, 0, 0, 0.24)',
        color: 'var(--theme-text-primary)',
        outline: 'none',
      }}
    >
      <ScrollArea
        className="flex-1"
        viewportStyle={{
          padding: isCompact ? '0 12px 10px' : '14px 10px 16px',
          minHeight: 0,
        }}
        style={{
          minHeight: 0,
          background: isCompact ? 'rgba(18, 18, 20, 0.96)' : 'transparent',
          borderLeft: isCompact ? '1px solid rgba(255, 255, 255, 0.1)' : undefined,
          borderRight: isCompact ? '1px solid rgba(255, 255, 255, 0.1)' : undefined,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          transition: !isCompact ? 'transform 220ms ease, opacity 200ms ease' : undefined,
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
            border: isCompact ? undefined : '1px solid rgba(255, 255, 255, 0.16)',
            background: isCompact
              ? undefined
              : 'linear-gradient(180deg, rgba(12, 16, 24, 0.34) 0%, rgba(10, 14, 22, 0.42) 100%)',
            backdropFilter: isCompact ? undefined : 'blur(12px) saturate(125%)',
            WebkitBackdropFilter: isCompact ? undefined : 'blur(12px) saturate(125%)',
            position: 'relative',
            overflow: 'visible',
          }}
          onMouseEnter={() => {
            if (!isCompact) {
              setComposerHovered(true)
              resetTimer()
            }
          }}
          onMouseLeave={() => {
            if (!isCompact) {
              setComposerHovered(false)
            }
          }}
        >
          <textarea
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
              <div className="overlay__composer-model">{modelBadge}</div>
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
              aria-label={isLoading ? 'Stop generation' : 'Send message'}
            >
              {isLoading ? (
                <Square size={12} className="overlay__stop-icon" />
              ) : (
                <>
                  <Send size={16} />
                </>
              )}
            </button>

            {!isCompact ? (
              <div
                style={{
                  position: 'absolute',
                  right: -48,
                  bottom: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  opacity: composerHovered ? 1 : 0,
                  transform: composerHovered ? 'translateX(0)' : 'translateX(8px)',
                  pointerEvents: composerHovered ? 'auto' : 'none',
                  transition: 'opacity 160ms ease, transform 180ms ease',
                }}
              >
                <button
                  type="button"
                  onClick={handleOpenMainApp}
                  className="overlay__icon-button"
                  aria-label="Open in main app"
                  title="Open in main app"
                >
                  <PanelLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleHide}
                  className="overlay__icon-button"
                  aria-label="Hide overlay"
                  title="Hide overlay"
                >
                  <X size={16} />
                </button>
              </div>
            ) : null}
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
            radial-gradient(120% 52% at 50% -14%, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0) 68%),
            radial-gradient(100% 70% at 50% 118%, rgba(10, 12, 18, 0.38) 0%, rgba(10, 12, 18, 0) 70%),
            radial-gradient(64% 108% at -8% 50%, rgba(12, 16, 24, 0.24) 0%, rgba(12, 16, 24, 0) 72%),
            radial-gradient(64% 108% at 108% 50%, rgba(12, 16, 24, 0.24) 0%, rgba(12, 16, 24, 0) 72%);
        }
        .overlay__glass-shell > * {
          position: relative;
          z-index: 1;
        }
        .overlay__icon-button {
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(24, 28, 36, 0.34);
          color: var(--theme-text-secondary);
          cursor: pointer;
          transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
        }
        .overlay__icon-button:hover {
          color: var(--theme-text-primary);
          background: rgba(36, 40, 50, 0.48);
          border-color: rgba(255, 255, 255, 0.28);
        }
        .overlay__send-button {
          width: 40px;
          height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(60, 68, 84, 0.52);
          color: rgba(236, 240, 245, 0.94);
          border-radius: 999px;
          cursor: pointer;
          transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
        }
        .overlay__send-button:hover {
          background: rgba(76, 86, 104, 0.66);
          color: rgba(255, 255, 255, 0.98);
          border-color: rgba(255, 255, 255, 0.28);
        }
        .overlay__send-button--stop {
          background: rgba(94, 58, 66, 0.58);
          border-color: rgba(226, 120, 132, 0.45);
          color: rgba(255, 224, 228, 0.96);
        }
        .overlay__send-button--stop:hover {
          background: rgba(120, 66, 76, 0.72);
          border-color: rgba(236, 134, 146, 0.56);
          color: rgba(255, 236, 239, 0.98);
        }
        .overlay__stop-icon {
          fill: currentColor;
          strokeWidth: 2.8;
        }
        .overlay__composer-model {
          display: inline-flex;
          align-items: center;
          height: 30px;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--theme-border) 54%, transparent);
          background: rgba(24, 28, 36, 0.46);
          color: rgba(210, 215, 224, 0.88);
          font-size: 0.74rem;
          font-weight: 500;
          letter-spacing: 0.01em;
          padding: 0 10px;
          max-width: 140px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </div>
  )
}
