/**
 * ChatArea - Main chat interface orchestrator component
 * Coordinates message display, input handling, and streaming via extracted components and hooks
 * 
 * Requirements: 1.5, 1.6 - Reduced to orchestration logic only (≤600 lines)
 * Requirements: 5.3 - Isolated streaming updates
 * Requirements: 4.3, 5.5 - Virtual scrolling for long message lists
 * 
 * **Validates: Property 22: Isolated Streaming Updates**
 * - Uses StreamingMessage component for the actively streaming message
 * - Only the streaming message re-renders during streaming, not the entire list
 * 
 * **Validates: Property 17: Virtual Scrolling Activation**
 * - For any chat session with more than 100 messages, the message list SHALL use virtual scrolling
 * 
 * **Validates: Property 23: Message List Virtualization Threshold**
 * - For any message list with more than 50 messages, virtualization SHALL be active
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import GradientText from '../GradientText'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import type { ToolCallResult } from '../../contexts/ChatHistoryContext'
import { useStreamingState } from '../../contexts/StreamingContext'
import { useQuickSend } from '../../contexts/QuickSendContext'
import { useToast } from '../shared/Toast'
import { useToolCalling } from '../../hooks/useToolCalling'
import { ToolCallIndicator, ToolResultDisplay } from '../../tools/ui'

// Extracted components
import { MessageRenderer } from './ChatArea/MessageRenderer'
import { StreamingMessage } from './ChatArea/StreamingMessage'
import { VirtualMessageList } from './ChatArea/VirtualMessageList'
import { InputArea } from './ChatArea/InputArea'
import { useStreamingChat } from './ChatArea/hooks'
import type { AttachedFile } from './ChatArea/FileUploadHandler'

/**
 * Virtualization threshold - activate virtual scrolling for lists > 50 messages
 * **Validates: Property 23: Message List Virtualization Threshold**
 */
const VIRTUALIZATION_THRESHOLD = 50

export default function ChatArea() {
  const { sessions, currentSessionId } = useChatHistory()
  const { showToast } = useToast()
  const { toolState } = useToolCalling()
  
  // Get streaming state for virtualized list
  // **Validates: Property 22: Isolated Streaming Updates**
  const streamingState = useStreamingState()

  // Local state
  const [input, setInput] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Get current session and messages
  const currentSession = sessions.find(s => s.id === currentSessionId)
  const messages = currentSession?.messages || []
  
  // Determine if virtualization should be active
  // **Validates: Property 23: Message List Virtualization Threshold**
  const useVirtualization = messages.length > VIRTUALIZATION_THRESHOLD

  // Scroll tracking refs
  const prevMessageCountRef = useRef(messages.length)
  const lastMessageIdRef = useRef<string | null>(null)
  const hasScrolledToNewMessageRef = useRef(false)
  const userScrolledAwayRef = useRef(false)

  // Use the streaming chat hook
  const { isLoading, sendMessage, regenerateMessage, stopStreaming } = useStreamingChat({
    onMessageSent: () => {
      setInput('')
      setAttachedFiles([])
    },
    onRegenerateStart: () => {
      // Scroll to position the new message in view when regenerating with smooth animation
      requestAnimationFrame(() => {
        scrollToNewMessage(true)
      })
    }
  })

  // Quick-send: consume a pending message queued from the command palette
  const { pendingMessage, consumeMessage } = useQuickSend()
  useEffect(() => {
    if (!pendingMessage || isLoading) return
    const message = consumeMessage()
    if (message) {
      sendMessage(message, [])
    }
  }, [pendingMessage, isLoading, consumeMessage, sendMessage])

  // Scroll helpers
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

    if (currentMessageCount > prevMessageCountRef.current || lastMessageId !== lastMessageIdRef.current) {
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

  // Handle send message
  const handleSendMessage = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || isLoading) return
    await sendMessage(input.trim(), attachedFiles)
  }

  // Copy message content - memoized to prevent unnecessary re-renders
  // **Validates: Property 22: Isolated Streaming Updates**
  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content)
    showToast('Copied to clipboard', 'success')
  }, [showToast])

  // Render message callback for VirtualMessageList
  // **Validates: Property 17: Virtual Scrolling Activation**
  // **Validates: Property 23: Message List Virtualization Threshold**
  const renderMessage = useCallback((index: number, msg: typeof messages[0]) => {
    const isLastAssistant = msg.role === 'assistant' && index === messages.length - 1
    const isStreamingMsg = isLoading && isLastAssistant
    
    return (
      <div data-message-id={msg.id}>
        {/* Show stored tool results before the message (exclude web_search - model response includes it) */}
        {msg.role === 'assistant' && msg.toolResults && msg.toolResults.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            {msg.toolResults
              .filter((r: ToolCallResult) => r.toolCall.name !== 'web_search')
              .map((result: ToolCallResult, i: number) => (
                <ToolResultDisplay
                  key={`stored-${i}`}
                  toolName={result.toolCall.name}
                   result={result.result?.success ? result.result.data : undefined}
                   error={result.result?.success ? undefined : result.result?.error}
                />
              ))}
          </div>
        )}

        {/* Message Bubble - Use StreamingMessage for isolated streaming updates */}
        {/* **Validates: Property 22: Isolated Streaming Updates** */}
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
            onCopy={handleCopy}
            onRegenerate={(instruction) => regenerateMessage(msg, instruction)}
          />
        )}

        {/* Show active tool results after last assistant message (during streaming, exclude web_search) */}
        {isLastAssistant && toolState.toolResults.length > 0 && (
          <div style={{ marginTop: '8px', marginBottom: '24px' }}>
            {toolState.toolResults
              .filter((r) => r.toolCall.name !== 'web_search')
              .map((result, i) => (
                <ToolResultDisplay
                  key={i}
                  toolName={result.toolCall.name}
                   result={result.result?.success ? result.result.data : undefined}
                   error={result.result?.success ? undefined : result.result?.error}
                />
              ))}
          </div>
        )}
      </div>
    )
  }, [messages.length, isLoading, currentSessionId, handleCopy, regenerateMessage, toolState.toolResults, toolState.activeToolCalls])

  // Empty state (no session selected)
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
          padding: '20px'
        }}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          maxWidth: 'min(720px, 100%)',
          width: '100%',
        }}>
          {/* zura Title */}
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

          {/* Input Area */}
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

  // Main chat view
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
      background: 'var(--theme-background)',
      position: 'relative'
    }}>
      {/* Messages Container - Use virtualization for large lists */}
      {/* **Validates: Property 17: Virtual Scrolling Activation** */}
      {/* **Validates: Property 23: Message List Virtualization Threshold** */}
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
              {/* Active tool calls - shown in ThinkingBlock when streaming; footer only when not streaming */}
              {!isLoading && toolState.activeToolCalls.map((toolCall, i) => (
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
          <div style={{ width: '100%', maxWidth: 'min(860px, 100%)', margin: '0 auto', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
            {messages.map((msg, idx) => {
              const isLastAssistant = msg.role === 'assistant' && idx === messages.length - 1
              const isStreamingMessage = isLoading && isLastAssistant
              
              return (
                <div key={msg.id} data-message-id={msg.id}>
                  {/* Show stored tool results before the message (exclude web_search) */}
                  {msg.role === 'assistant' && msg.toolResults && msg.toolResults.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      {msg.toolResults
                        .filter((r: ToolCallResult) => r.toolCall.name !== 'web_search')
                        .map((result: ToolCallResult, i: number) => (
                          <ToolResultDisplay
                            key={`stored-${i}`}
                            toolName={result.toolCall.name}
                            result={result.result.success ? result.result.data : undefined}
                            error={result.result.success ? undefined : result.result.error}
                          />
                        ))}
                    </div>
                  )}

                  {/* Message Bubble - Use StreamingMessage for isolated streaming updates */}
                  {/* **Validates: Property 22: Isolated Streaming Updates** */}
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
                      onCopy={handleCopy}
                      onRegenerate={(instruction) => regenerateMessage(msg, instruction)}
                    />
                  )}

                  {/* Show active tool results after last assistant message (during streaming, exclude web_search) */}
                  {isLastAssistant && toolState.toolResults.length > 0 && (
                    <div style={{ marginTop: '8px', marginBottom: '24px' }}>
                      {toolState.toolResults
                        .filter((r) => r.toolCall.name !== 'web_search')
                        .map((result, i) => (
                          <ToolResultDisplay
                            key={i}
                            toolName={result.toolCall.name}
                            result={result.result.success ? result.result.data : undefined}
                            error={result.result.success ? undefined : result.result.error}
                          />
                        ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Active tool calls - shown in ThinkingBlock when streaming; footer only when not streaming last message */}
            {!isLoading && toolState.activeToolCalls.map((toolCall, i) => (
              <div key={`tool-active-${i}`} style={{ marginBottom: '12px' }}>
                <ToolCallIndicator
                  toolName={toolCall.name}
                  status="executing"
                  arguments={toolCall.arguments}
                />
              </div>
            ))}

            {/* Spacer for loading state */}
            {isLoading && <div style={{ minHeight: 'calc(100% - 350px)' }} />}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      )}

      {/* Input Area */}
      <div className="chat-input-overlay">
        <div className="chat-input-overlay__inner">
          <InputArea
            input={input}
            setInput={setInput}
            onSend={handleSendMessage}
            isLoading={isLoading}
            attachedFiles={attachedFiles}
            onFilesChange={setAttachedFiles}
            onError={(msg) => showToast(msg, 'error')}
            showContextRing={true}
          />
        </div>
      </div>

      {/* Styles */}
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
