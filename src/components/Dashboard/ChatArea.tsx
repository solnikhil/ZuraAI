/**
 * ChatArea - Main chat interface orchestrator component
 * Coordinates message display, input handling, and streaming via extracted components and hooks
 * 
 * Requirements: 1.5, 1.6 - Reduced to orchestration logic only (≤600 lines)
 */

import React, { useState, useRef, useEffect } from 'react'
import GradientText from '../GradientText'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../shared/Toast'
import { useToolCalling } from '../../hooks/useToolCalling'
import { ToolCallIndicator, ToolResultDisplay } from '../../tools/ui'

// Extracted components
import { MessageRenderer } from './ChatArea/MessageRenderer'
import { InputArea } from './ChatArea/InputArea'
import { PastedContentEditModal } from './ChatArea/PastedContentEditModal'
import { useStreamingChat } from './ChatArea/hooks'
import type { AttachedFile } from './ChatArea/FileUploadHandler'
import type { PastedContentChunk as PastedContentChunkType } from './ChatArea/types'

export default function ChatArea() {
  const { sessions, currentSessionId, deleteSession, clearAllSessions } = useChatHistory()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const { toolState } = useToolCalling()

  // Local state
  const [input, setInput] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [isTitleAnimated, setIsTitleAnimated] = useState(false)
  const [pastedChunks, setPastedChunks] = useState<PastedContentChunkType[]>([])
  const [editingChunk, setEditingChunk] = useState<PastedContentChunkType | null>(null)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Get current session and messages
  const currentSession = sessions.find(s => s.id === currentSessionId)
  const messages = currentSession?.messages || []

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
      setPastedChunks([])
    }
  })

  // Scroll helpers
  const scrollToNewMessage = () => {
    if (!messagesContainerRef.current) return
    const container = messagesContainerRef.current
    const messageElements = container.querySelectorAll('[data-message-id]')
    const lastMessageEl = messageElements[messageElements.length - 1] as HTMLElement
    if (lastMessageEl) {
      lastMessageEl.scrollIntoView({ behavior: 'auto', block: 'start' })
      container.scrollTop = Math.max(0, container.scrollTop - 48)
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
    if ((!input.trim() && attachedFiles.length === 0 && pastedChunks.length === 0) || isLoading) return

    // Build message with chunk content
    const chunkContent = pastedChunks.map(c => c.content).join('\n\n---\n\n')
    let fullInput = input.trim()
    if (chunkContent) {
      fullInput += (fullInput ? '\n\n[Attached Content]\n' : '[Attached Content]\n') + chunkContent
    }

    // Debug: log the full input being sent
    console.log('[ChatArea] Sending message:', {
      inputLength: input.length,
      chunkCount: pastedChunks.length,
      fullInputLength: fullInput.length,
      fullInputPreview: fullInput.slice(0, 200) + (fullInput.length > 200 ? '...' : '')
    })

    await sendMessage(fullInput, attachedFiles)
  }

  // Handle chunk creation
  const handleChunkCreate = (content: string) => {
    const newChunk: PastedContentChunkType = {
      id: `chunk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content,
      charCount: content.length,
      createdAt: Date.now()
    }
    setPastedChunks(prev => [...prev, newChunk])
  }

  // Handle chunk update
  const handleChunkUpdate = (id: string, newContent: string) => {
    setPastedChunks(prev =>
      prev.map(chunk =>
        chunk.id === id
          ? { ...chunk, content: newContent, charCount: newContent.length }
          : chunk
      )
    )
    setEditingChunk(null)
  }

  // Handle chunk delete
  const handleChunkDelete = (id: string) => {
    setPastedChunks(prev => prev.filter(chunk => chunk.id !== id))
    setEditingChunk(null)
  }

  // Handle regenerate
  const handleRegenerate = async (message: any, instruction: string) => {
    await regenerateMessage(message, instruction)
  }

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Copy message content
  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content)
    showToast('Copied to clipboard', 'success')
  }

  // Remove attached file
  const removeFile = (fileId: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== fileId))
  }

  // Empty state (no session selected)
  if (!currentSessionId || messages.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 0,
        background: 'var(--theme-background)',
        padding: '20px',
        overflow: 'auto'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          maxWidth: 'min(600px, 100%)',
          width: '100%'
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
          <div style={{ width: '100%', maxWidth: '600px' }}>
            <InputArea
              input={input}
              setInput={setInput}
              onSend={handleSendMessage}
              isLoading={isLoading}
              attachedFiles={attachedFiles}
              onFilesChange={setAttachedFiles}
              pastedChunks={pastedChunks}
              onChunkEdit={(chunk) => setEditingChunk(chunk)}
              onChunkDelete={handleChunkDelete}
              onChunkCreate={handleChunkCreate}
              onError={(msg) => showToast(msg, 'error')}
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

        {/* Edit Modal */}
        {editingChunk && (
          <PastedContentEditModal
            content={editingChunk.content}
            onSave={(newContent) => handleChunkUpdate(editingChunk.id, newContent)}
            onCancel={() => setEditingChunk(null)}
            onDelete={() => handleChunkDelete(editingChunk.id)}
          />
        )}
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
      {/* Messages Container */}
      <div ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', minHeight: 0 }}>
        <div style={{ width: '100%', maxWidth: 'min(810px, 100%)', margin: '0 auto', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
          {messages.map((msg, idx) => (
            <div key={msg.id} data-message-id={msg.id}>
              {/* Show stored tool results before the message */}
              {msg.role === 'assistant' && msg.toolResults && msg.toolResults.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  {msg.toolResults.map((result: any, i: number) => (
                    <ToolResultDisplay
                      key={`stored-${i}`}
                      toolName={result.toolCall.name}
                      result={result.result.success ? result.result.data : undefined}
                      error={result.result.success ? undefined : result.result.error}
                    />
                  ))}
                </div>
              )}

              {/* Message Bubble */}
              <MessageRenderer
                message={msg}
                isStreaming={isLoading && msg.role === 'assistant' && idx === messages.length - 1}
                onCopy={handleCopy}
                onRegenerate={(instruction) => handleRegenerate(msg, instruction)}
              />

              {/* Show active tool results after last assistant message (during streaming) */}
              {msg.role === 'assistant' && idx === messages.length - 1 && toolState.toolResults.length > 0 && (
                <div style={{ marginTop: '8px', marginBottom: '24px' }}>
                  {toolState.toolResults.map((result, i) => (
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
          ))}

          {/* Active tool calls indicator */}
          {toolState.activeToolCalls.map((toolCall, i) => (
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
      </div>

      {/* Input Area */}
      <div style={{ width: '100%', maxWidth: 'min(850px, 100%)', margin: '0 auto', padding: '0 20px 20px 20px', flexShrink: 0 }}>
        <InputArea
          input={input}
          setInput={setInput}
          onSend={handleSendMessage}
          isLoading={isLoading}
          attachedFiles={attachedFiles}
          onFilesChange={setAttachedFiles}
          pastedChunks={pastedChunks}
          onChunkEdit={(chunk) => setEditingChunk(chunk)}
          onChunkDelete={handleChunkDelete}
          onChunkCreate={handleChunkCreate}
          onError={(msg) => showToast(msg, 'error')}
        />
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
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Edit Modal */}
      {editingChunk && (
        <PastedContentEditModal
          content={editingChunk.content}
          onSave={(newContent) => handleChunkUpdate(editingChunk.id, newContent)}
          onCancel={() => setEditingChunk(null)}
          onDelete={() => handleChunkDelete(editingChunk.id)}
        />
      )}
    </div>
  )
}
