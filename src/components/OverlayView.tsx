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

export default function OverlayView() {
  const { sessions, currentSessionId } = useChatHistory()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const streamingState = useStreamingState()
  const [input, setInput] = useState('')
  const [overlayMode, setOverlayMode] = useState<'compact' | 'expanded'>('expanded')

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
    await sendMessage(content, [])
  }, [input, isLoading, sendMessage])

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
          : 'linear-gradient(180deg, rgba(10, 12, 16, 0.22) 0%, rgba(8, 10, 14, 0.32) 100%)',
        backdropFilter: isCompact ? undefined : 'blur(18px) saturate(140%)',
        WebkitBackdropFilter: isCompact ? undefined : 'blur(18px) saturate(140%)',
        border: isCompact ? undefined : '1px solid rgba(255, 255, 255, 0.14)',
        borderRadius: isCompact ? undefined : 16,
        color: 'var(--theme-text-primary)',
        outline: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: isCompact ? '8px 8px 4px 12px' : '10px 12px 8px',
          WebkitAppRegion: 'drag',
          minHeight: isCompact ? 38 : 44,
          borderRadius: isCompact ? '16px 16px 0 0' : undefined,
          background: isCompact ? 'rgba(18, 18, 20, 0.96)' : 'rgba(255, 255, 255, 0.03)',
          border: isCompact ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
          borderBottom: isCompact ? undefined : '1px solid rgba(255, 255, 255, 0.08)',
          borderBottomColor: isCompact ? 'transparent' : undefined,
        } as React.CSSProperties}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
      </div>

      <ScrollArea
        className="flex-1"
        viewportStyle={{
          padding: isCompact ? '0 12px 10px' : '14px 14px 18px',
          minHeight: 0,
        }}
        style={{
          minHeight: 0,
          background: isCompact ? 'rgba(18, 18, 20, 0.96)' : 'rgba(8, 10, 14, 0.08)',
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

      <div
        style={{
          padding: isCompact ? '0 10px 10px' : '6px 10px 10px',
          borderTop: isCompact ? 'none' : '1px solid color-mix(in srgb, var(--theme-border) 60%, transparent)',
          background: isCompact
            ? 'transparent'
            : 'linear-gradient(180deg, rgba(14, 16, 22, 0.2) 0%, rgba(10, 12, 18, 0.28) 100%)',
        }}
      >
        <div
          className={isCompact ? 'prompt-popup-composer' : undefined}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: isCompact ? 10 : '8px 10px 8px',
            borderRadius: isCompact ? 18 : 20,
            border: isCompact ? undefined : '1px solid color-mix(in srgb, var(--theme-border) 78%, transparent)',
            background: isCompact
              ? undefined
              : 'linear-gradient(180deg, rgba(16, 18, 24, 0.46) 0%, rgba(12, 14, 20, 0.52) 100%)',
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
              className={isCompact ? 'prompt-popup-send' : 'overlay__send-button'}
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
          </div>
        </div>
      </div>

      <style>{`
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
          .overlay__glass-shell {
            background: rgba(12, 14, 20, 0.9) !important;
          }
        }
        .overlay__icon-button {
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--theme-border) 78%, transparent);
          background: rgba(24, 28, 36, 0.42);
          color: var(--theme-text-secondary);
          cursor: pointer;
          transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
        }
        .overlay__icon-button:hover {
          color: var(--theme-text-primary);
          background: color-mix(in srgb, var(--theme-surface-hover) 92%, transparent);
          border-color: color-mix(in srgb, var(--theme-border-hover) 85%, transparent);
        }
        .overlay__send-button {
          width: 40px;
          height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid color-mix(in srgb, var(--theme-border) 68%, transparent);
          background: rgba(58, 64, 76, 0.62);
          color: rgba(236, 240, 245, 0.94);
          border-radius: 999px;
          cursor: pointer;
          transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
        }
        .overlay__send-button:hover {
          background: rgba(76, 80, 88, 0.9);
          color: rgba(255, 255, 255, 0.98);
          border-color: color-mix(in srgb, var(--theme-border-hover) 80%, transparent);
        }
        .overlay__send-button:has(.overlay__stop-icon) {
          background: rgba(92, 56, 62, 0.58);
          border-color: rgba(218, 112, 124, 0.42);
          color: rgba(255, 224, 228, 0.96);
        }
        .overlay__send-button:has(.overlay__stop-icon):hover {
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
