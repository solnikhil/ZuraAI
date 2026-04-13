import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { SkillLogo } from '@/components/shared'
import { ToolCallIndicator, ToolResultDisplay } from '@/tools/ui'

import { useChatHistory } from '../contexts/ChatHistoryContext'
import { useStreamingState } from '../contexts/StreamingContext'
import { useToast } from './shared/Toast'
import { MessageRenderer } from './Dashboard/ChatArea/MessageRenderer'
import { StreamingMessage } from './Dashboard/ChatArea/StreamingMessage'
import { useStreamingChat } from './Dashboard/ChatArea/hooks'
import { shouldHideGenericToolResultCard } from './Dashboard/ChatArea/toolResultVisibility'
import { ChevronDown, MessageCircle, PanelLeft, Send, Wrench, X } from './icons'

export default function OverlayView() {
  const { sessions, currentSessionId, createSession } = useChatHistory()
  const { showToast } = useToast()
  const streamingState = useStreamingState()
  const [input, setInput] = useState('')
  const [overlayMode, setOverlayMode] = useState<'compact' | 'expanded'>('compact')

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
      if (state.mode === 'compact' || state.mode === 'expanded') {
        setOverlayMode(state.mode)
      }
    } catch {
      // Overlay mode is optional UI state; keep the existing layout if the bridge fails.
    }
  }, [])

  const handleSend = useCallback(async () => {
    const content = input.trim()
    if (!content || isLoading) return
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

  const handleToggleMode = useCallback(async () => {
    try {
      const state = await window.overlay.getState()
      if (state.mode === 'expanded') {
        await window.overlay.collapse()
        setOverlayMode('compact')
      } else {
        await window.overlay.expand()
        setOverlayMode('expanded')
      }
    } catch {
      showToast('Unable to resize the Overlay right now.', 'error')
    }
  }, [showToast])

  const handleHide = useCallback(async () => {
    try {
      await window.overlay.hide()
    } catch {
      showToast('Unable to hide the Overlay right now.', 'error')
    }
  }, [showToast])

  const handleCreateChat = useCallback(() => {
    createSession()
  }, [createSession])

  const handleCopy = useCallback((content: string) => {
    void navigator.clipboard.writeText(content)
  }, [])

  const handleNavigateSettings = useCallback((section: string) => {
    try {
      window.overlay.navigateSettings(section)
      void window.overlay.hide()
    } catch {
      showToast('Unable to open settings right now.', 'error')
    }
  }, [showToast])

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
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: 'transparent',
          color: 'var(--theme-text-primary)',
          outline: 'none',
        }}
      >
        <div
          className="prompt-popup-composer"
          style={{
            borderRadius: 18,
          }}
        >
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
                className="overlay__compact-dismiss"
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

        <style>{`
          .overlay__compact-dismiss {
            width: 28px;
            height: 28px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(18, 18, 20, 0.9);
            color: rgba(235, 235, 240, 0.8);
            cursor: pointer;
            transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
          }
          .overlay__compact-dismiss:hover {
            background: rgba(28, 28, 32, 0.96);
            color: rgba(255, 255, 255, 0.96);
            border-color: rgba(255, 255, 255, 0.16);
          }
        `}</style>
      </div>
    )
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        padding: isCompact ? '10px' : undefined,
        background: isCompact ? 'transparent' : 'rgba(20, 18, 11, 0.85)',
        color: 'var(--theme-text-primary)',
        outline: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: isCompact ? '8px 8px 4px 12px' : '12px 14px',
          borderBottom: isCompact ? 'none' : '1px solid color-mix(in srgb, var(--theme-border) 88%, transparent)',
          WebkitAppRegion: 'drag',
          minHeight: isCompact ? 36 : undefined,
          borderRadius: isCompact ? '16px 16px 0 0' : undefined,
          background: isCompact ? 'rgba(18, 18, 20, 0.96)' : undefined,
          border: isCompact ? '1px solid rgba(255, 255, 255, 0.1)' : undefined,
          borderBottomColor: isCompact ? 'transparent' : undefined,
        } as React.CSSProperties}
      >
        {isCompact ? <div style={{ minWidth: 0, flex: 1 }} /> : (
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '0.92rem' }}>
              <MessageCircle size={15} />
              <span>Overlay</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
              Compact desktop access to the current Zura session
            </div>
          </div>
        )}

        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {!isCompact ? (
            <button
              type="button"
              onClick={handleCreateChat}
              className="overlay__icon-button"
              aria-label="Start a new chat"
              title="New chat"
            >
              <MessageCircle size={14} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleOpenMainApp}
            className="overlay__icon-button"
            aria-label="Open in main app"
            title="Open in main app"
          >
            <PanelLeft size={14} />
          </button>
          <button
            type="button"
            onClick={handleToggleMode}
            className="overlay__icon-button"
            aria-label="Toggle compact size"
            title="Expand or collapse"
          >
            <ChevronDown size={14} />
          </button>
          <button
            type="button"
            onClick={handleHide}
            className="overlay__icon-button"
            aria-label="Hide overlay"
            title="Hide overlay"
          >
            <X size={14} />
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
          background: isCompact ? 'rgba(18, 18, 20, 0.96)' : undefined,
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
          padding: isCompact ? '0 10px 10px' : '12px 14px 14px',
          borderTop: isCompact ? 'none' : '1px solid color-mix(in srgb, var(--theme-border) 72%, transparent)',
          background: isCompact
            ? 'transparent'
            : 'linear-gradient(180deg, rgba(20, 18, 11, 0.78) 0%, rgba(20, 18, 11, 0.94) 100%)',
        }}
      >
        <div
          className={isCompact ? 'prompt-popup-composer' : undefined}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: isCompact ? 10 : 12,
            borderRadius: isCompact ? 18 : 16,
            border: isCompact ? undefined : '1px solid color-mix(in srgb, var(--theme-border) 88%, transparent)',
            background: isCompact ? undefined : 'color-mix(in srgb, var(--theme-surface) 92%, transparent)',
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
            placeholder="Message ZuraAI..."
            rows={isCompact ? 2 : 3}
            className={isCompact ? 'prompt-popup-textarea' : undefined}
            style={{
              width: '100%',
              minHeight: isCompact ? 52 : 72,
              resize: 'none',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--theme-text-primary)',
              fontSize: isCompact ? undefined : '0.9rem',
              fontFamily: 'inherit',
              lineHeight: 1.45,
              padding: isCompact ? '0 2px' : undefined,
            }}
          />

          {!isCompact && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                paddingLeft: 4,
              }}
            >
              <button
                type="button"
                onClick={() => handleNavigateSettings('mcp')}
                className="overlay__quick-action"
                title="MCP Servers settings"
              >
                <Wrench size={12} />
                <span>MCP Servers</span>
              </button>
              <button
                type="button"
                onClick={() => handleNavigateSettings('skills')}
                className="overlay__quick-action"
                title="Skills & Capabilities settings"
              >
                <SkillLogo skill="tavily" size={12} />
                <span>Skills</span>
              </button>
            </div>
          )}

          <div
            className={isCompact ? 'prompt-popup-footer' : undefined}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--theme-text-muted)',
                paddingLeft: isCompact ? 6 : undefined,
              }}
            >
              {isLoading
                ? 'Working through the current chat pipeline'
                : isCompact
                  ? 'Mini overlay'
                  : 'Enter to send, Shift+Enter for newline'}
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
            >
              {isLoading ? (
                'Stop'
              ) : (
                <>
                  <Send size={14} />
                  <span>Send</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .overlay__icon-button {
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--theme-border) 85%, transparent);
          background: color-mix(in srgb, var(--theme-surface) 86%, transparent);
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
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid color-mix(in srgb, var(--theme-accent) 42%, transparent);
          background: linear-gradient(135deg, color-mix(in srgb, var(--theme-accent) 72%, black 28%) 0%, color-mix(in srgb, var(--theme-accent-secondary) 70%, black 30%) 100%);
          color: var(--theme-text-inverse);
          border-radius: 999px;
          padding: 8px 14px;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
        }
        .overlay__quick-action {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--theme-border) 60%, transparent);
          background: color-mix(in srgb, var(--theme-surface) 45%, transparent);
          color: var(--theme-text-secondary);
          font-size: 0.72rem;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
          white-space: nowrap;
          line-height: 1.4;
        }
        .overlay__quick-action:hover {
          color: var(--theme-text-primary);
          background: color-mix(in srgb, var(--theme-surface-hover) 70%, transparent);
          border-color: color-mix(in srgb, var(--theme-border-hover) 60%, transparent);
        }
      `}</style>
    </div>
  )
}
