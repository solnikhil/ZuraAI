import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { ToolCallIndicator, ToolResultDisplay } from '@/tools/ui'

import { useChatHistory } from '../contexts/ChatHistoryContext'
import { useStreamingState } from '../contexts/StreamingContext'
import { useToast } from './shared/Toast'
import { MessageRenderer } from './Dashboard/ChatArea/MessageRenderer'
import { StreamingMessage } from './Dashboard/ChatArea/StreamingMessage'
import { useStreamingChat } from './Dashboard/ChatArea/hooks'
import { shouldHideGenericToolResultCard } from './Dashboard/ChatArea/toolResultVisibility'
import { ChevronDown, MessageCircle, PanelLeft, Send, X } from './icons'

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

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        background:
          'radial-gradient(circle at top right, rgba(178, 111, 255, 0.12), transparent 38%), linear-gradient(180deg, #18140f 0%, #14120b 100%)',
        color: 'var(--theme-text-primary)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: isCompact ? '10px 12px' : '12px 14px',
          borderBottom: '1px solid color-mix(in srgb, var(--theme-border) 88%, transparent)',
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '0.92rem' }}>
            <MessageCircle size={15} />
            <span>Overlay</span>
          </div>
          {!isCompact ? (
            <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
              Compact desktop access to the current Zura session
            </div>
          ) : null}
        </div>

        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={handleCreateChat}
            className="overlay__icon-button"
            aria-label="Start a new chat"
            title="New chat"
          >
            <MessageCircle size={14} />
          </button>
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
        viewportStyle={{ padding: isCompact ? '10px 12px 12px' : '14px 14px 18px', minHeight: 0 }}
        style={{ minHeight: 0 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {messages.length === 0 ? (
            <div
              style={{
                border: '1px solid color-mix(in srgb, var(--theme-border) 88%, transparent)',
                background: 'color-mix(in srgb, var(--theme-surface) 86%, transparent)',
                borderRadius: 16,
                padding: isCompact ? 14 : 18,
              }}
            >
              <div style={{ fontSize: isCompact ? '0.92rem' : '1rem', fontWeight: 600, marginBottom: 6 }}>
                {isCompact ? 'Quick prompt' : 'Ask without opening the dashboard'}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--theme-text-muted)' }}>
                {isCompact
                  ? 'Use the overlay for fast follow-ups and hand off to the full app when needed.'
                  : 'The overlay reuses your current providers, tools, MCP servers, and chat history.'}
              </div>
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
          padding: isCompact ? '10px 12px 12px' : '12px 14px 14px',
          borderTop: '1px solid color-mix(in srgb, var(--theme-border) 72%, transparent)',
          background:
            'linear-gradient(180deg, rgba(20, 18, 11, 0.78) 0%, rgba(20, 18, 11, 0.94) 100%)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: isCompact ? 10 : 12,
            borderRadius: 16,
            border: '1px solid color-mix(in srgb, var(--theme-border) 88%, transparent)',
            background: 'color-mix(in srgb, var(--theme-surface) 92%, transparent)',
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
            style={{
              width: '100%',
              minHeight: isCompact ? 52 : 72,
              resize: 'none',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--theme-text-primary)',
              fontSize: '0.9rem',
              fontFamily: 'inherit',
              lineHeight: 1.45,
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
              {isLoading
                ? 'Working through the current chat pipeline'
                : isCompact
                  ? 'Enter to send'
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
              className="overlay__send-button"
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
      `}</style>
    </div>
  )
}
