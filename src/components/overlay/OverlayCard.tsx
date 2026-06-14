import React from 'react'

import type { Message, ToolCallResult } from '@/chat/types'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ToolCallIndicator, ToolResultDisplay } from '@/tools/ui'

import { MessageRenderer } from '../Dashboard/ChatArea/MessageRenderer'
import { StreamingMessage } from '../Dashboard/ChatArea/StreamingMessage'

export interface OverlayCardProps {
  messages: Message[]
  currentSessionId: string | null
  isLoading: boolean
  activeToolCalls: Array<{ name: string; arguments?: Record<string, unknown> }>
  visibleLiveToolResults: ToolCallResult[]
  streamingContent?: string
  onCopy: (content: string) => void | Promise<boolean>
  onRegenerate: (message: Message, instruction: string) => void
}

/**
 * The expanded conversation "card". Reuses the standard dashboard chat renderers
 * (`MessageRenderer` / `StreamingMessage` / tool result cards) — no separate chat
 * pipeline. Content items fade + slide in with a staggered cadence.
 */
export function OverlayCard({
  messages,
  currentSessionId,
  isLoading,
  activeToolCalls,
  visibleLiveToolResults,
  streamingContent,
  onCopy,
  onRegenerate,
}: OverlayCardProps): React.ReactElement {
  return (
    <div className="zo-card">
      <ScrollArea
        className="zo-card__scroll"
        data-select-all-scope="chat"
        viewportStyle={{ minHeight: 0 }}
      >
        <div className="zo-card__content">
          {messages.map((message, index) => {
            const isLastAssistant = message.role === 'assistant' && index === messages.length - 1
            const isStreamingMessage = isLoading && isLastAssistant

            return (
              <div key={message.id} className="zo-reveal">
                {isStreamingMessage ? (
                  <StreamingMessage
                    message={message}
                    sessionId={currentSessionId!}
                    activeToolCalls={activeToolCalls}
                    onCopy={onCopy}
                    onRegenerate={(instruction) => onRegenerate(message, instruction)}
                  />
                ) : (
                  <MessageRenderer
                    message={message}
                    isStreaming={false}
                    sessionId={currentSessionId || undefined}
                    onCopy={onCopy}
                    onRegenerate={(instruction) => onRegenerate(message, instruction)}
                  />
                )}

                {isLastAssistant && visibleLiveToolResults.length > 0 && (
                  <div style={{ marginTop: 8, marginBottom: 4 }}>
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
            activeToolCalls.map((toolCall, index) => (
              <div key={`active-tool-${index}`} className="zo-reveal">
                <ToolCallIndicator
                  toolName={toolCall.name}
                  status="executing"
                  arguments={toolCall.arguments}
                />
              </div>
            ))}

          {isLoading && streamingContent ? (
            <div className="zo-card__streaming-note">Streaming response…</div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

export default OverlayCard
