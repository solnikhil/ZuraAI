/**
 * MessageRenderer - Component for rendering chat messages
 * Handles markdown rendering, code blocks, file attachments, and message actions
 * 
 * Requirements: 1.3
 */

import React, { useState, useRef, useEffect, useMemo } from 'react'
import ReactDOM from 'react-dom'
import {
  Copy, Check, Info, Clock, ArrowDown, ArrowUp, Sigma, Cpu, Brain,
  Wrench, X, File, FileText, RotateCcw, Sparkles, Edit2, Zap, Database,
  ChevronLeft, ChevronRight, CornerDownLeft
} from '../../icons'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import LazyMarkdown from '../../LazyMarkdown'
import ThinkingBlockComponent from '../../ThinkingBlock'
import ResponseInfo from '../../ResponseInfo'
import { useSettings } from '../../../contexts/SettingsContext'
import type { Message, ThinkingBlock } from '../../../contexts/ChatHistoryContext'
import type { WebSource } from './WebSourceCitation'

export interface MessageRendererProps {
  message: Message & {
    thinking?: string
    thinkingDuration?: number
    thinkingBlocks?: ThinkingBlock[]
    researchStatus?: {
      currentRound: number
      maxRounds: number
      currentSearch?: string
      isSearching: boolean
    }
    responseVersions?: Array<{
      id: string
      content: string
      timestamp: number
      instruction?: string
      model?: string
    }>
    currentVersionIndex?: number
    toolResults?: Array<{
      toolCall: { id: string; name: string; arguments: any }
      result: { success: boolean; data?: any; error?: string; executionTime?: number }
    }>
  }
  isStreaming?: boolean
  onCopy?: (content: string) => void
  onRegenerate?: (instruction: string) => void
}

/**
 * Convert reference-style URLs to markdown links
 */
function convertUrlsToMarkdownLinks(content: string): string {
  if (!content) return content

  // Pattern 1: Reference-style URLs like [1] https://example.com
  let result = content.replace(/(^|\s)\[(\d+)\]\s+(https?:\/\/[^\s\)\]\[]+)/gm, (match, prefix, num, url) => {
    const cleanUrl = url.replace(/[.,;:!?]+$/, '')
    return `${prefix}[[${num}]](${cleanUrl})`
  })

  // Pattern 2: References section format
  const lines = result.split('\n')
  const processedLines = lines.map(line => {
    if (line.includes('](') && line.includes(')')) return line

    const refMatch = line.match(/^(\s*)\[(\d+)\]\s+(https?:\/\/.+)$/)
    if (refMatch) {
      const [, indent, num, url] = refMatch
      const cleanUrl = url.trim().replace(/[.,;:!?]+$/, '')
      return `${indent}[[${num}]](${cleanUrl})`
    }

    // Pattern 3: Plain URLs
    const urlRegex = /(https?:\/\/[^\s\)\]\[]+)/g
    let lastIndex = 0
    let lineResult = ''

    let match
    while ((match = urlRegex.exec(line)) !== null) {
      lineResult += line.substring(lastIndex, match.index)
      const beforeUrl = line.substring(0, match.index)
      const afterUrl = line.substring(match.index + match[0].length)

      if (beforeUrl.endsWith('](') || afterUrl.startsWith(')')) {
        lineResult += match[0]
      } else {
        const cleanUrl = match[0].replace(/[.,;:!?]+$/, '')
        lineResult += `<${cleanUrl}>`
      }
      lastIndex = match.index + match[0].length
    }
    lineResult += line.substring(lastIndex)
    return lineResult
  })

  return processedLines.join('\n')
}

/**
 * Tool Details Modal Component
 */
function ToolDetailsModal({ toolResults, onClose }: {
  toolResults: MessageRendererProps['message']['toolResults']
  onClose: () => void
}) {
  if (!toolResults) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px'
    }} onClick={onClose}>
      <ScrollArea
        style={{
          backgroundColor: 'var(--theme-surface)',
          borderRadius: '12px',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          border: '1px solid var(--theme-border)',
          boxShadow: 'var(--theme-shadow-lg)'
        }}
        viewportStyle={{ padding: '24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h2 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>
            Tools Used ({toolResults.length})
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#b0b0b0',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {toolResults.map((result, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '16px'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px'
              }}>
                <Wrench size={16} color={result.result.success ? '#4ade80' : '#f87171'} />
                <span style={{ color: '#fff', fontWeight: 600, fontSize: '1rem' }}>
                  {result.toolCall.name.replace(/_/g, ' ')}
                </span>
                {result.result.executionTime && (
                  <span style={{ color: '#b0b0b0', fontSize: '0.85rem', marginLeft: 'auto' }}>
                    {result.result.executionTime}ms
                  </span>
                )}
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ color: '#b0b0b0', fontSize: '0.85rem', marginBottom: '4px' }}>
                  Arguments:
                </div>
                <pre style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  padding: '8px',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  color: '#e0e0e0',
                  overflowX: 'auto',
                  margin: 0
                }}>
                  {JSON.stringify(result.toolCall.arguments, null, 2)}
                </pre>
              </div>

              {result.result.success ? (
                <div>
                  <div style={{ color: '#b0b0b0', fontSize: '0.85rem', marginBottom: '4px' }}>
                    Result:
                  </div>
                  <ScrollArea
                    style={{
                      background: 'rgba(34, 197, 94, 0.1)',
                      borderRadius: '4px',
                      maxHeight: '300px'
                    }}
                    viewportStyle={{ padding: '8px' }}
                  >
                    <pre style={{
                      fontSize: '0.85rem',
                      color: '#4ade80',
                      overflowX: 'auto',
                      margin: 0
                    }}>
                      {JSON.stringify(result.result.data, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              ) : (
                <div>
                  <div style={{ color: '#b0b0b0', fontSize: '0.85rem', marginBottom: '4px' }}>
                    Error:
                  </div>
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    color: '#f87171',
                    margin: 0
                  }}>
                    {result.result.error}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * Web Search Image Carousel Component
 */
function WebSearchImageCarousel({ images }: { images: Array<{ url: string; description?: string }> }) {
  const [startIndex, setStartIndex] = useState(0)
  const imagesPerPage = 4
  const totalPages = Math.ceil(images.length / imagesPerPage)
  const currentPage = Math.floor(startIndex / imagesPerPage)
  const visibleImages = images.slice(startIndex, startIndex + imagesPerPage)

  const handlePrev = () => {
    setStartIndex(prev => {
      const newIndex = prev - imagesPerPage
      return newIndex < 0 ? (totalPages - 1) * imagesPerPage : newIndex
    })
  }

  const handleNext = () => {
    setStartIndex(prev => {
      const newIndex = prev + imagesPerPage
      return newIndex >= images.length ? 0 : newIndex
    })
  }

  if (images.length === 0) return null

  return (
    <div style={{
      marginBottom: '16px',
      padding: '12px',
      background: 'rgba(255, 255, 255, 0.02)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '12px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '8px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: 'var(--theme-text-secondary)',
          fontSize: '0.85rem'
        }}>
          <span>Web Search Images</span>
          <span style={{ color: 'var(--theme-text-muted)' }}>
            ({images.length} {images.length === 1 ? 'image' : 'images'})
          </span>
        </div>
        {images.length > imagesPerPage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <button
              onClick={handlePrev}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: '4px 8px',
                cursor: 'pointer',
                color: 'var(--theme-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{
              color: 'var(--theme-text-muted)',
              fontSize: '0.75rem',
              minWidth: '40px',
              textAlign: 'center'
            }}>
              {currentPage + 1}/{totalPages}
            </span>
            <button
              onClick={handleNext}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: '4px 8px',
                cursor: 'pointer',
                color: 'var(--theme-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px'
      }}>
        {visibleImages.map((img, idx) => (
          <a
            key={`${startIndex + idx}-${img.url}`}
            href={img.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              aspectRatio: '16/10',
              overflow: 'hidden',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'block',
              transition: 'transform 0.2s, box-shadow 0.2s',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <img
              src={img.url}
              alt={img.description || `Search result image ${startIndex + idx + 1}`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block'
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          </a>
        ))}
      </div>
    </div>
  )
}

/**
 * User Message Bubble
 */
function UserMessageBubble({ message }: { message: MessageRendererProps['message'] }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      marginBottom: '24px',
      gap: '8px'
    }}>
      {/* File attachments */}
      {message.files && message.files.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxWidth: '70%',
          width: '100%'
        }}>
          {message.files.map((file: any) => (
            file.type === 'image' ? (
              <div
                key={file.id}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  padding: '8px',
                  maxWidth: '100%',
                  overflow: 'hidden'
                }}
              >
                <img
                  src={file.data}
                  alt={file.name}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '300px',
                    borderRadius: '8px',
                    objectFit: 'contain',
                    display: 'block',
                    width: 'auto',
                    height: 'auto'
                  }}
                />
                <div style={{
                  padding: '6px 8px 0',
                  fontSize: '0.75rem',
                  color: '#b0b0b0',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {file.name}
                </div>
              </div>
            ) : (
              <div
                key={file.id}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  maxWidth: '100%'
                }}
              >
                {file.type === 'pdf' ? (
                  <FileText size={16} color="#f87171" />
                ) : (
                  <File size={16} color="#888" />
                )}
                <span style={{
                  color: '#e0e0e0',
                  fontSize: '0.85rem',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {file.name}
                </span>
                <span style={{ color: '#b0b0b0', fontSize: '0.75rem' }}>
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              </div>
            )
          ))}
        </div>
      )}

      {/* Message content */}
      {message.content && (
        <div style={{
          padding: '12px 18px',
          backgroundColor: 'var(--theme-surface)',
          borderRadius: '20px',
          color: 'var(--theme-text-secondary)',
          fontSize: '0.95rem',
          maxWidth: '70%',
          whiteSpace: 'pre-wrap'
        }}>
          {message.content}
        </div>
      )}
    </div>
  )
}

/**
 * Main MessageRenderer component
 */
export function MessageRenderer({
  message,
  isStreaming = false,
  onCopy,
  onRegenerate
}: MessageRendererProps) {
  const { settings } = useSettings()
  const [copied, setCopied] = useState(false)
  const [showToolModal, setShowToolModal] = useState(false)
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number; showAbove: boolean } | null>(null)
  const [isHoveringInfo, setIsHoveringInfo] = useState(false)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)
  const [regenerateInstruction, setRegenerateInstruction] = useState('')
  const [displayVersionIndex, setDisplayVersionIndex] = useState(0)
  const infoTriggerRef = useRef<HTMLDivElement>(null)
  const messageRef = useRef<HTMLDivElement>(null)
  const regenerateInputRef = useRef<HTMLTextAreaElement>(null)

  // Track if content has arrived during streaming
  const [hasContentDuringStreaming, setHasContentDuringStreaming] = useState(false)

  // Reset content tracking when streaming starts
  useEffect(() => {
    if (isStreaming) {
      setHasContentDuringStreaming(false)
    }
  }, [isStreaming])

  // Track when content arrives during streaming
  useEffect(() => {
    if (isStreaming && message.content && message.content.length > 0) {
      setHasContentDuringStreaming(true)
    }
  }, [isStreaming, message.content])

  // Get all versions including current message
  const versions = message.responseVersions || []
  const totalVersions = versions.length + (message.content ? 1 : 0)
  const currentVersionIndex = message.currentVersionIndex || 0

  // Reset display version when message changes
  useEffect(() => {
    setDisplayVersionIndex(currentVersionIndex)
  }, [message.id, currentVersionIndex])

  // Get the content to display based on version
  const getVersionContent = () => {
    if (displayVersionIndex === versions.length && message.content) {
      return message
    } else if (displayVersionIndex < versions.length) {
      return versions[displayVersionIndex]
    }
    return message
  }

  const displayMessage = getVersionContent()
  const processedContent = convertUrlsToMarkdownLinks(displayMessage?.content || '')

  // Build web source map from tool results
  const webSourceMap = useMemo(() => {
    const map = new Map<string, WebSource>()
    if (!message.toolResults) return map
    for (const tr of message.toolResults) {
      if (tr.toolCall.name === 'web_search' && tr.result.success && tr.result.data) {
        const results = tr.result.data.results || tr.result.data
        if (Array.isArray(results)) {
          for (const entry of results) {
            if (entry.url) {
              map.set(entry.url, {
                title: entry.title || '',
                url: entry.url,
                snippet: entry.snippet || entry.description || '',
                favicon: entry.favicon || ''
              })
            }
          }
        }
      }
    }
    return map
  }, [message.toolResults])

  // Extract all images from web_search tool results
  const webSearchImages = useMemo(() => {
    const images: Array<{ url: string; description?: string }> = []
    if (!message.toolResults) return images
    for (const tr of message.toolResults) {
      if (tr.toolCall.name === 'web_search' && tr.result.success && tr.result.data) {
        const resultImages = tr.result.data.images || []
        if (Array.isArray(resultImages)) {
          for (const img of resultImages) {
            if (typeof img === 'string') {
              images.push({ url: img })
            } else if (img?.url) {
              images.push({
                url: img.url,
                description: img.description || img.alt || undefined
              })
            }
          }
        }
      }
    }
    return images
  }, [message.toolResults])

  const isUser = message.role === 'user'
  const hasThinking = typeof (message as any).thinking === 'string' && (message as any).thinking.trim().length > 0
  const showThinkingSpinner = isStreaming && !hasThinking

  // Handle copy
  const handleCopy = () => {
    if (onCopy) {
      onCopy(message.content)
    } else {
      navigator.clipboard.writeText(message.content)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Handle regenerate action
  const handleRegenerate = () => {
    if (onRegenerate) {
      onRegenerate(regenerateInstruction.trim())
      setShowRegenerateModal(false)
      setRegenerateInstruction('')
    }
  }

  // Open regenerate modal and focus input
  const openRegenerateModal = () => {
    setShowRegenerateModal(true)
    setRegenerateInstruction('')
  }

  // Focus input when modal opens
  useEffect(() => {
    if (showRegenerateModal && regenerateInputRef.current) {
      regenerateInputRef.current.focus()
    }
  }, [showRegenerateModal])

  // Handle version navigation
  const navigateVersion = (direction: 'prev' | 'next') => {
    setDisplayVersionIndex(prev => {
      if (direction === 'next' && prev < totalVersions - 1) {
        return prev + 1
      } else if (direction === 'prev' && prev > 0) {
        return prev - 1
      }
      return prev
    })
  }

  // Update popover position
  const updatePopoverPosition = () => {
    if (infoTriggerRef.current) {
      const rect = infoTriggerRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth
      const popoverHeight = 400
      const popoverWidth = message.toolResults && message.toolResults.length > 0 ? 400 : 280
      const padding = 20

      const spaceAbove = rect.top
      const spaceBelow = viewportHeight - rect.bottom
      const showAbove = spaceAbove >= popoverHeight + padding || spaceBelow < popoverHeight + padding

      let left = rect.left
      if (left + popoverWidth > viewportWidth - padding) {
        left = viewportWidth - popoverWidth - padding
      }
      if (left < padding) {
        left = padding
      }

      setPopoverPosition({ top: rect.top, left, showAbove })
    }
  }

  const handleInfoMouseEnter = () => {
    setIsHoveringInfo(true)
    updatePopoverPosition()
  }

  const handleInfoMouseLeave = () => {
    setIsHoveringInfo(false)
    setPopoverPosition(null)
  }

  // Update position on scroll/resize when hovering
  useEffect(() => {
    if (isHoveringInfo) {
      const handleUpdate = () => updatePopoverPosition()
      window.addEventListener('scroll', handleUpdate, true)
      window.addEventListener('resize', handleUpdate)
      return () => {
        window.removeEventListener('scroll', handleUpdate, true)
        window.removeEventListener('resize', handleUpdate)
      }
    }
  }, [isHoveringInfo])

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault()
      if (messageRef.current) {
        const selection = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(messageRef.current)
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    }
  }

  // Render user message
  if (isUser) {
    return <UserMessageBubble message={message} />
  }

  // Render assistant message
  return (
    <div
      style={{ marginBottom: '24px' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      ref={messageRef}
    >
      {/* Thinking Block */}
      {(hasThinking || showThinkingSpinner || (message.thinkingBlocks && message.thinkingBlocks.length > 0) || message.researchStatus?.isSearching) && (
        <div style={{ marginBottom: '8px' }}>
          <ThinkingBlockComponent
            thinking={(message as any).thinking || ''}
            isThinking={isStreaming && !message.content && !message.researchStatus?.isSearching}
            thinkingDuration={message.thinkingDuration}
            isSearching={message.researchStatus?.isSearching || false}
            searchQuery={message.researchStatus?.currentSearch}
            completedBlocks={message.thinkingBlocks || []}
          />
        </div>
      )}

      {/* Web Search Image Carousel - shown after thinking ends, before message content */}
      {!isStreaming && webSearchImages.length > 0 && (
        <WebSearchImageCarousel images={webSearchImages} />
      )}

      {/* Message content - only show when not streaming or when content has arrived */}
      {( !isStreaming || hasContentDuringStreaming || message.thinkingBlocks?.length || message.researchStatus) && (
        <div className="markdown-content">
          <LazyMarkdown content={processedContent} webSources={webSourceMap} />
        </div>
      )}

      {/* Separator - added when model is done streaming to separate response from post-streaming tasks */}
      {!isStreaming && message.content && <Separator orientation="horizontal" style={{ width: '25%', margin: '16px 0' }} />}

      {/* Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', overflow: 'visible' }}>
        {/* Version Indicator */}
        {message.responseVersions && message.responseVersions.length > 0 && (
          <>
            <button
              onClick={() => navigateVersion('prev')}
              disabled={displayVersionIndex === 0}
              style={{
                background: 'transparent',
                border: 'none',
                color: displayVersionIndex > 0 ? 'var(--theme-text-muted)' : 'var(--theme-border)',
                cursor: displayVersionIndex > 0 ? 'pointer' : 'not-allowed',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <ChevronLeft size={14} />
            </button>

            <span style={{
              fontSize: '0.8rem',
              color: 'var(--theme-text-secondary)',
              fontFamily: 'monospace'
            }}>
              v{displayVersionIndex + 1}/{totalVersions}
            </span>

            <button
              onClick={() => navigateVersion('next')}
              disabled={displayVersionIndex >= totalVersions - 1}
              style={{
                background: 'transparent',
                border: 'none',
                color: displayVersionIndex < totalVersions - 1 ? 'var(--theme-text-muted)' : 'var(--theme-border)',
                cursor: displayVersionIndex < totalVersions - 1 ? 'pointer' : 'not-allowed',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <ChevronRight size={14} />
            </button>
          </>
        )}

        {/* Tools Button */}
        {message.toolResults && message.toolResults.length > 0 && (
          <button
            onClick={() => setShowToolModal(true)}
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: '#60a5fa',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: '6px',
              transition: 'all 0.2s',
              fontSize: '0.8rem',
              fontFamily: 'inherit',
              fontWeight: 500
            }}
          >
            <Wrench size={14} />
            <span>{message.toolResults.length} {message.toolResults.length === 1 ? 'tool' : 'tools'}</span>
          </button>
        )}

        {/* Copy Button - hide while streaming */}
        {!isStreaming && (
          <button
            onClick={handleCopy}
            style={{
              background: 'transparent',
              border: 'none',
              color: copied ? 'var(--theme-success)' : 'var(--theme-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px',
              borderRadius: '4px',
              transition: 'all 0.2s',
              fontSize: '0.8rem',
              fontFamily: 'inherit'
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}

        {/* Regenerate Button */}
        {!isStreaming && message.role === 'assistant' && onRegenerate && (
          <button
            onClick={openRegenerateModal}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--theme-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px',
              borderRadius: '4px',
              transition: 'all 0.2s'
            }}
            title="Regenerate with custom instructions"
          >
            <RotateCcw size={14} />
          </button>
        )}

        {/* Info Tooltip */}
        {(message.usage || message.toolResults) && (
          <div
            ref={infoTriggerRef}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              flexShrink: 0,
              overflow: 'visible',
              minWidth: '22px',
              minHeight: '22px'
            }}
            onMouseEnter={handleInfoMouseEnter}
            onMouseLeave={handleInfoMouseLeave}
          >
            <div style={{ position: 'relative', display: 'flex' }}>
              <Info
                size={14}
                style={{
                  cursor: 'pointer',
                  color: 'var(--theme-text-muted)',
                  flexShrink: 0,
                  display: 'block',
                  width: '14px',
                  height: '14px'
                }}
              />
              {/* Sources badge */}
              {message.toolResults && message.toolResults.filter((tr: any) => tr.toolCall.name === 'web_search').length > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-8px',
                  background: '#60a5fa',
                  color: 'white',
                  fontSize: '0.65rem',
                  fontWeight: 'bold',
                  minWidth: '16px',
                  height: '16px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                  border: '2px solid var(--theme-bg)',
                  pointerEvents: 'none'
                }}>
                  {message.toolResults.filter((tr: any) => tr.toolCall.name === 'web_search').length}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Info Popover */}
        {popoverPosition && (
          <div
            style={{
              position: 'fixed',
              top: popoverPosition.showAbove
                ? popoverPosition.top - 10 // Adjustment for shadow/margin
                : popoverPosition.top + 30,
              left: popoverPosition.left,
              zIndex: 1000,
              transform: popoverPosition.showAbove ? 'translateY(-100%)' : 'none'
            }}
          >
            <ResponseInfo
              model={message.model || settings.aiModel}
              latency={message.latency}
              usage={message.usage}
              finishReason={message.finishReason}
              requestedMaxTokens={message.requestedMaxTokens}
            />
          </div>
        )}
      </div>

      {/* Tool Details Modal */}
      {showToolModal && message.toolResults && (
        <ToolDetailsModal
          toolResults={message.toolResults}
          onClose={() => setShowToolModal(false)}
        />
      )}

      {/* Regenerate Modal */}
      {showRegenerateModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
            animation: 'fadeIn 0.15s ease-out'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowRegenerateModal(false)
            }
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--theme-surface)',
              borderRadius: '16px',
              padding: '20px',
              width: '100%',
              maxWidth: '500px',
              border: '1px solid var(--theme-border)',
              boxShadow: 'var(--theme-shadow-lg)',
              animation: 'slideUp 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  background: 'var(--theme-accent)',
                  borderRadius: '8px',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <RotateCcw size={16} color="var(--theme-text-inverse)" />
                </div>
                <div>
                  <div style={{ color: 'var(--theme-text-primary)', fontSize: '0.95rem', fontWeight: 600 }}>
                    Regenerate Response
                  </div>
                  <div style={{ color: 'var(--theme-text-tertiary)', fontSize: '0.75rem' }}>
                    Leave empty to regenerate normally
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowRegenerateModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--theme-text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '4px',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--theme-surface-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <X size={18} />
              </button>
            </div>

            {/* Text Input */}
            <textarea
              ref={regenerateInputRef}
              value={regenerateInstruction}
              onChange={(e) => setRegenerateInstruction(e.target.value)}
              placeholder="Describe what you want to change... (e.g., &quot;make it more concise&quot;, &quot;add code examples&quot;, &quot;explain in simpler terms&quot;)"
              style={{
                width: '100%',
                minHeight: '80px',
                maxHeight: '200px',
                padding: '12px',
                backgroundColor: 'var(--theme-surface-subtle)',
                border: '1px solid var(--theme-border)',
                borderRadius: '10px',
                color: 'var(--theme-text-primary)',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                transition: 'border-color 0.15s'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--theme-accent)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--theme-border)'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleRegenerate()
                } else if (e.key === 'Escape') {
                  setShowRegenerateModal(false)
                }
              }}
            />

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <div style={{ color: 'var(--theme-text-muted)', fontSize: '0.75rem' }}>
                <CornerDownLeft size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                Cmd+Enter to regenerate
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setShowRegenerateModal(false)}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    border: '1px solid var(--theme-border)',
                    borderRadius: '8px',
                    color: 'var(--theme-text-secondary)',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--theme-surface-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRegenerate}
                  style={{
                    padding: '8px 16px',
                    background: 'var(--theme-accent)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'var(--theme-text-inverse)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--theme-accent-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'var(--theme-accent)'}
                >
                  <RotateCcw size={14} />
                  Regenerate
                </button>
              </div>
            </div>
          </div>

          {/* Animations */}
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}

export default MessageRenderer
