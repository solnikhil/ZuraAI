/**
 * MessageRenderer - Component for rendering chat messages
 * Handles markdown rendering, code blocks, file attachments, and message actions
 * 
 * Requirements: 1.3, 5.2
 * 
 * Performance: This component is wrapped with React.memo() to prevent unnecessary
 * re-renders when parent components re-render with unchanged message props.
 * A custom comparison function ensures deep equality checking for message objects.
 */

import React, { useState, useRef, useEffect, useMemo, memo } from 'react'
import {
  Copy, Check, Info, X, File, RotateCcw,
  ChevronLeft, ChevronRight, CornerDownLeft
} from '../../icons'
// Separator import removed (no longer used after streaming)
import LazyMarkdown from '../../LazyMarkdown'
import ThinkingBlockComponent from '../../ThinkingBlock'
import ResponseInfo from '../../ResponseInfo'
import { useSettings } from '../../../contexts/SettingsContext'
import type { Message, ThinkingBlock, ToolCallResult, FileAttachment } from '../../../contexts/ChatHistoryContext'
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
    toolResults?: ToolCallResult[]
    researchPlan?: { topic: string; steps: Array<{ stepNumber: number; query: string; rationale?: string }> }
    researchProgress?: { currentStep: number; totalSteps: number; currentQuery?: string }
  }
  isStreaming?: boolean
  /** Active tool calls during streaming (for in-message tool calling animation) */
  activeToolCalls?: Array<{ name: string; arguments?: Record<string, unknown> }>
  onCopy?: (content: string) => void
  onRegenerate?: (instruction: string) => void
}

const MESSAGE_ACTION_ICON_SIZE = 14

/**
 * Strip trailing "References" or "Sources" sections that the model may generate.
 * These are redundant because the app renders numbered citations as interactive links.
 * Matches a heading (e.g. "## References", "**References**", "References") followed by
 * numbered entries like "[1] ..." until the end of the content.
 */
function stripReferencesSection(content: string): string {
  if (!content) return content
  // Match a References/Sources heading (markdown ## or bold ** or plain) followed by
  // numbered list entries through end of string
  return content.replace(
    /\n+(?:#{1,4}\s*)?(?:\*{1,2})?(?:References|Sources)(?:\*{1,2})?:?\s*\n+(?:\s*\[?\d+\]?[\s.:\-–—].+(?:\n|$))+$/i,
    ''
  ).trimEnd()
}

/**
 * Convert reference-style URLs to markdown links.
 * Skips URLs inside fenced code blocks and inline code spans.
 */
function convertUrlsToMarkdownLinks(content: string): string {
  if (!content) return content

  // Split by fenced code blocks first — preserve them untouched
  const fencedParts = content.split(/(```[\s\S]*?```)/g)

  const processed = fencedParts.map((part, fIdx) => {
    // Odd indices are fenced code blocks — skip
    if (fIdx % 2 === 1) return part

    // Split by inline code spans — preserve them untouched
    const inlineParts = part.split(/(`[^`]+`)/g)

    return inlineParts.map((seg, iIdx) => {
      // Odd indices are inline code spans — skip
      if (iIdx % 2 === 1) return seg

      return convertUrlsInText(seg)
    }).join('')
  }).join('')

  return processed
}

/** Apply URL→link conversion to a plain-text (non-code) segment */
function convertUrlsInText(text: string): string {
  // Pattern 1: Reference-style URLs like [1] https://example.com
  let result = text.replace(/(^|\s)\[(\d+)\]\s+(https?:\/\/[^\s\)\]\[`]+)/gm, (_match, prefix, num, url) => {
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

    // Pattern 3: Plain URLs (exclude backticks from URL chars)
    const urlRegex = /(https?:\/\/[^\s\)\]\[`]+)/g
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
 * Convert numeric citations like [1] or [2,3] to markdown links
 * using the ordered URLs from web search results.
 */
function convertNumericCitationsToMarkdownLinks(content: string, orderedSourceUrls: string[]): string {
  if (!content || orderedSourceUrls.length === 0) return content

  const parts = content.split(/(```[\s\S]*?```)/g)

  return parts.map((part, index) => {
    // Keep fenced code blocks unchanged
    if (index % 2 === 1) return part

    return part.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (match, refs, offset, sourceText) => {
      const prevChar = offset > 0 ? sourceText[offset - 1] : ''
      const nextChar = sourceText[offset + match.length] || ''

      // Skip markdown links like [text](url) and already-converted forms like [[1]](url)
      if (nextChar === '(' || prevChar === '[') return match

      const refNumbers = String(refs)
        .split(',')
        .map((s) => Number.parseInt(s.trim(), 10))

      if (refNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > orderedSourceUrls.length)) {
        return match
      }

      return refNumbers
        .map((n) => `[[${n}]](${orderedSourceUrls[n - 1]})`)
        .join(', ')
    })
  }).join('')
}


/**
 * Web Search Image Carousel Component
 * Renders inline with the message flow—no card container, minimal chrome.
 * Uses smooth scroll animation when navigating between pages.
 */
function WebSearchImageCarousel({ images }: { images: Array<{ url: string; description?: string }> }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const imagesPerPage = 4
  const totalPages = Math.ceil(images.length / imagesPerPage)

  const scrollToPage = (page: number) => {
    const el = scrollRef.current
    if (!el) return
    const pageWidth = el.offsetWidth
    el.scrollTo({ left: page * pageWidth, behavior: 'smooth' })
    setCurrentPage(page)
  }

  const handlePrev = () => {
    const nextPage = currentPage <= 0 ? totalPages - 1 : currentPage - 1
    scrollToPage(nextPage)
  }

  const handleNext = () => {
    const nextPage = currentPage >= totalPages - 1 ? 0 : currentPage + 1
    scrollToPage(nextPage)
  }

  if (images.length === 0) return null

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '6px',
        gap: '8px'
      }}>
        <span style={{
          color: 'var(--theme-text-muted)',
          fontSize: '0.8rem',
          fontWeight: 500
        }}>
          {images.length} {images.length === 1 ? 'image' : 'images'} from search
        </span>
        {images.length > imagesPerPage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <button
              onClick={handlePrev}
              type="button"
              aria-label="Previous images"
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 4px',
                cursor: 'pointer',
                color: 'var(--theme-text-muted)',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--theme-text-secondary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--theme-text-muted)'
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{
              color: 'var(--theme-text-muted)',
              fontSize: '0.7rem',
              minWidth: '32px',
              textAlign: 'center'
            }}>
              {currentPage + 1}/{totalPages}
            </span>
            <button
              onClick={handleNext}
              type="button"
              aria-label="Next images"
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 4px',
                cursor: 'pointer',
                color: 'var(--theme-text-muted)',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--theme-text-secondary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--theme-text-muted)'
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollBehavior: 'smooth',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          display: 'flex',
          gap: '6px',
          scrollSnapType: 'x mandatory'
        }}
        className="scrollbar-hide"
      >
        {images.map((img, idx) => (
          <a
            key={`${idx}-${img.url}`}
            href={img.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: '0 0 calc((100% - 18px) / 4)',
              minWidth: 'calc((100% - 18px) / 4)',
              aspectRatio: '16/10',
              overflow: 'hidden',
              borderRadius: '6px',
              display: 'block',
              transition: 'opacity 0.15s',
              cursor: 'pointer',
              scrollSnapAlign: 'start'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1'
            }}
          >
            <img
              src={img.url}
              alt={img.description || `Search result image ${idx + 1}`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                borderRadius: 'inherit'
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
function UserMessageBubble({
  message,
  bubbleStyle = 'solid'
}: {
  message: MessageRendererProps['message']
  bubbleStyle?: 'solid' | 'glass' | 'outline' | 'gradient' | 'elevated' | 'terminal'
}) {
  const bubbleStyleByPreset: Record<'solid' | 'glass' | 'outline' | 'gradient' | 'elevated' | 'terminal', React.CSSProperties> = {
    solid: {
      background: 'var(--theme-user-message-bg)',
      border: '1px solid var(--theme-border-subtle)',
      boxShadow: 'var(--theme-shadow-sm)',
      color: 'var(--theme-user-message-text)'
    },
    glass: {
      background: 'rgba(148, 163, 184, 0.18)',
      border: '1px solid rgba(255, 255, 255, 0.22)',
      boxShadow: 'var(--theme-shadow-sm)',
      color: 'var(--theme-text-primary)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)'
    },
    outline: {
      background: 'transparent',
      border: '1px solid var(--theme-accent-muted)',
      boxShadow: 'none',
      color: 'var(--theme-text-primary)'
    },
    gradient: {
      background: 'linear-gradient(135deg, color-mix(in srgb, var(--theme-accent) 82%, transparent) 0%, color-mix(in srgb, var(--theme-accent-secondary) 78%, transparent) 100%)',
      border: '1px solid color-mix(in srgb, var(--theme-accent) 45%, transparent)',
      boxShadow: 'var(--theme-shadow-sm)',
      color: 'var(--theme-text-inverse)'
    },
    elevated: {
      background: 'var(--theme-surface)',
      border: '1px solid var(--theme-border)',
      boxShadow: 'var(--theme-shadow-md)',
      color: 'var(--theme-text-primary)'
    },
    terminal: {
      background: 'color-mix(in srgb, var(--theme-background) 76%, black 24%)',
      border: '1px dashed var(--theme-border-hover)',
      boxShadow: 'none',
      color: 'var(--theme-text-primary)',
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      letterSpacing: '0.01em'
    }
  }

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
          {message.files.map((file: FileAttachment) => (
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
                <File size={16} color="#888" />
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
          borderRadius: '20px 20px 6px 20px',
          fontSize: '0.95rem',
          maxWidth: '70%',
          whiteSpace: 'pre-wrap',
          ...bubbleStyleByPreset[bubbleStyle]
        }}>
          {message.content}
        </div>
      )}
    </div>
  )
}

/**
 * Custom comparison function for MessageRenderer memoization
 * 
 * **Validates: Requirements 5.2**
 * **Property 21: Message Component Memoization**
 * 
 * Returns true if props are equal (should NOT re-render)
 * Returns false if props are different (should re-render)
 * 
 * This function performs deep equality checking on message props to prevent
 * unnecessary re-renders during parent component updates (e.g., streaming).
 */
function areMessagePropsEqual(
  prevProps: MessageRendererProps,
  nextProps: MessageRendererProps
): boolean {
  // Compare isStreaming - this is critical for streaming updates
  if (prevProps.isStreaming !== nextProps.isStreaming) {
    return false
  }

  // Compare activeToolCalls (for tool calling animation)
  const prevActive = prevProps.activeToolCalls || []
  const nextActive = nextProps.activeToolCalls || []
  if (prevActive.length !== nextActive.length) {
    return false
  }

  // Compare callback references (these should be stable via useCallback in parent)
  // Note: We compare by reference since callbacks should be memoized
  if (prevProps.onCopy !== nextProps.onCopy) {
    return false
  }
  if (prevProps.onRegenerate !== nextProps.onRegenerate) {
    return false
  }

  const prevMsg = prevProps.message
  const nextMsg = nextProps.message

  // Compare message identity
  if (prevMsg.id !== nextMsg.id) {
    return false
  }

  // Compare message role
  if (prevMsg.role !== nextMsg.role) {
    return false
  }

  // Compare message content - critical for streaming updates
  if (prevMsg.content !== nextMsg.content) {
    return false
  }

  // Compare timestamp
  if (prevMsg.timestamp !== nextMsg.timestamp) {
    return false
  }

  // Compare model
  if (prevMsg.model !== nextMsg.model) {
    return false
  }

  // Compare thinking content (for extended thinking models)
  if (prevMsg.thinking !== nextMsg.thinking) {
    return false
  }

  // Compare thinking duration
  if (prevMsg.thinkingDuration !== nextMsg.thinkingDuration) {
    return false
  }

  // Compare thinking blocks array (by length and content)
  const prevThinkingBlocks = prevMsg.thinkingBlocks || []
  const nextThinkingBlocks = nextMsg.thinkingBlocks || []
  if (prevThinkingBlocks.length !== nextThinkingBlocks.length) {
    return false
  }
  for (let i = 0; i < prevThinkingBlocks.length; i++) {
    if (prevThinkingBlocks[i].content !== nextThinkingBlocks[i].content ||
        prevThinkingBlocks[i].type !== nextThinkingBlocks[i].type) {
      return false
    }
  }

  // Compare research status
  const prevResearch = prevMsg.researchStatus
  const nextResearch = nextMsg.researchStatus
  if (prevResearch?.isSearching !== nextResearch?.isSearching ||
      prevResearch?.currentRound !== nextResearch?.currentRound ||
      prevResearch?.maxRounds !== nextResearch?.maxRounds ||
      prevResearch?.currentSearch !== nextResearch?.currentSearch) {
    return false
  }

  // Compare response versions (by length and current index)
  const prevVersions = prevMsg.responseVersions || []
  const nextVersions = nextMsg.responseVersions || []
  if (prevVersions.length !== nextVersions.length) {
    return false
  }
  if (prevMsg.currentVersionIndex !== nextMsg.currentVersionIndex) {
    return false
  }

  // Compare research plan and progress
  const prevPlan = prevMsg.researchPlan
  const nextPlan = nextMsg.researchPlan
  if (prevPlan?.topic !== nextPlan?.topic || prevPlan?.steps?.length !== nextPlan?.steps?.length) {
    return false
  }
  const prevProgress = prevMsg.researchProgress
  const nextProgress = nextMsg.researchProgress
  if (prevProgress?.currentStep !== nextProgress?.currentStep ||
      prevProgress?.totalSteps !== nextProgress?.totalSteps) {
    return false
  }

  // Compare tool results (by length - deep comparison would be expensive)
  const prevToolResults = prevMsg.toolResults || []
  const nextToolResults = nextMsg.toolResults || []
  if (prevToolResults.length !== nextToolResults.length) {
    return false
  }
  // Check if any tool result changed (by reference or key properties)
  for (let i = 0; i < prevToolResults.length; i++) {
    if (prevToolResults[i].toolCall.id !== nextToolResults[i].toolCall.id ||
        prevToolResults[i].result.success !== nextToolResults[i].result.success) {
      return false
    }
  }

  // Compare files array (by length and IDs)
  const prevFiles = prevMsg.files || []
  const nextFiles = nextMsg.files || []
  if (prevFiles.length !== nextFiles.length) {
    return false
  }
  for (let i = 0; i < prevFiles.length; i++) {
    if (prevFiles[i].id !== nextFiles[i].id) {
      return false
    }
  }

  // Compare usage stats
  if (prevMsg.usage?.inputTokens !== nextMsg.usage?.inputTokens ||
      prevMsg.usage?.outputTokens !== nextMsg.usage?.outputTokens ||
      prevMsg.usage?.totalTokens !== nextMsg.usage?.totalTokens) {
    return false
  }

  // Compare latency
  if (prevMsg.latency !== nextMsg.latency) {
    return false
  }

  // Compare finish reason
  if (prevMsg.finishReason !== nextMsg.finishReason) {
    return false
  }

  // Compare requested max tokens
  if (prevMsg.requestedMaxTokens !== nextMsg.requestedMaxTokens) {
    return false
  }

  // All props are equal - do NOT re-render
  return true
}

/**
 * Main MessageRenderer component
 * 
 * Wrapped with React.memo() using a custom comparison function to prevent
 * unnecessary re-renders when parent components re-render with unchanged props.
 * 
 * **Validates: Requirements 5.2**
 * **Property 21: Message Component Memoization**
 */
function MessageRendererComponent({
  message,
  isStreaming = false,
  activeToolCalls,
  onCopy,
  onRegenerate
}: MessageRendererProps) {
  const { settings } = useSettings()
  const [copied, setCopied] = useState(false)

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
  // Track whether to trigger the staggered button animation.
  // null = no animation (historical messages), true = animate in
  const [showActionButtons, setShowActionButtons] = useState<boolean | null>(null)
  const prevIsStreamingRef = useRef(isStreaming)

  // Reset content tracking when streaming starts
  useEffect(() => {
    if (isStreaming) {
      setHasContentDuringStreaming(false)
    }
  }, [isStreaming])

  // Trigger staggered button animation ONLY when streaming transitions from true → false
  useEffect(() => {
    if (prevIsStreamingRef.current && !isStreaming) {
      // Streaming just ended on this message - trigger animation
      setShowActionButtons(false)
      requestAnimationFrame(() => {
        setShowActionButtons(true)
      })
    }
    prevIsStreamingRef.current = isStreaming
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

  // Build web source map from tool results
  const { webSourceMap, orderedWebSourceUrls } = useMemo(() => {
    const map = new Map<string, WebSource>()
    const orderedUrls: string[] = []
    if (!message.toolResults) {
      return { webSourceMap: map, orderedWebSourceUrls: orderedUrls }
    }

    for (const tr of message.toolResults) {
      if (tr.toolCall.name === 'web_search' && tr.result?.success && tr.result?.data) {
        const dataObj = tr.result.data as Record<string, unknown>
        const results = (dataObj.results as unknown[]) || tr.result.data
        if (Array.isArray(results)) {
          for (const rawEntry of results) {
            const entry = rawEntry as Record<string, unknown>
            if (entry.url) {
              const url = String(entry.url)
              if (!map.has(url)) {
                orderedUrls.push(url)
              }
              map.set(String(entry.url), {
                title: String(entry.title || ''),
                url,
                snippet: String(entry.snippet || entry.description || ''),
                favicon: String(entry.favicon || '')
              })
            }
          }
        }
      }
    }
    return { webSourceMap: map, orderedWebSourceUrls: orderedUrls }
  }, [message.toolResults])

  const processedContent = useMemo(() => {
    const withUrlLinks = convertUrlsToMarkdownLinks(displayMessage?.content || '')
    const withCitations = convertNumericCitationsToMarkdownLinks(withUrlLinks, orderedWebSourceUrls)
    // Strip model-generated References/Sources sections — citations are rendered as interactive links
    return orderedWebSourceUrls.length > 0 ? stripReferencesSection(withCitations) : withCitations
  }, [displayMessage?.content, orderedWebSourceUrls])

  // Extract all images from web_search tool results
  const webSearchImages = useMemo(() => {
    const images: Array<{ url: string; description?: string }> = []
    if (!message.toolResults) return images
    for (const tr of message.toolResults) {
      if (tr.toolCall.name === 'web_search' && tr.result?.success && tr.result?.data) {
        const dataObj = tr.result.data as Record<string, unknown>
        const resultImages = (dataObj.images as unknown[]) || []
        if (Array.isArray(resultImages)) {
          for (const img of resultImages) {
            if (typeof img === 'string') {
              images.push({ url: img })
            } else if (img && typeof img === 'object') {
              const imgObj = img as Record<string, unknown>
              if (imgObj.url) {
                images.push({
                  url: String(imgObj.url),
                  description: String(imgObj.description || imgObj.alt || '') || undefined
                })
              }
            }
          }
        }
      }
    }
    return images
  }, [message.toolResults])

  const isUser = message.role === 'user'
  const hasThinking = typeof message.thinking === 'string' && message.thinking.trim().length > 0
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
    return <UserMessageBubble message={message} bubbleStyle={settings.chatBubbleStyle || 'solid'} />
  }

  // Render assistant message
  const shouldShowInfoTooltip = !isStreaming && (
    Boolean(message.content) ||
    Boolean(message.thinking) ||
    Boolean(message.model) ||
    Boolean(message.usage) ||
    Boolean(message.finishReason) ||
    typeof message.requestedMaxTokens === 'number' ||
    typeof message.latency === 'number' ||
    Boolean(message.toolResults)
  )

  return (
    <div
      style={{ marginBottom: '24px' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      ref={messageRef}
    >
      {/* Thinking Block */}
      {(hasThinking || showThinkingSpinner || (message.thinkingBlocks && message.thinkingBlocks.length > 0) || message.researchStatus?.isSearching || (activeToolCalls && activeToolCalls.length > 0)) && (
        <div style={{ marginBottom: '8px' }}>
          <ThinkingBlockComponent
            thinking={message.thinking || ''}
            isThinking={isStreaming && !message.content && !message.researchStatus?.isSearching && (!activeToolCalls || activeToolCalls.length === 0)}
            thinkingDuration={message.thinkingDuration}
            isSearching={message.researchStatus?.isSearching || false}
            searchQuery={message.researchStatus?.currentSearch}
            completedBlocks={message.thinkingBlocks || []}
            activeToolCalls={activeToolCalls}
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
          <LazyMarkdown content={processedContent} webSources={webSourceMap} isStreaming={isStreaming} />
        </div>
      )}

      {/* Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', overflow: 'visible' }}>
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
              <ChevronLeft size={16} />
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
              <ChevronRight size={16} />
            </button>
          </>
        )}

        {/* Copy Button - hide while streaming, animate in after */}
        {!isStreaming && (
          <button
            onClick={handleCopy}
            className={showActionButtons === true ? 'action-btn-animate' : undefined}
            style={{
              background: 'transparent',
              border: 'none',
              color: copied ? 'var(--theme-success)' : 'var(--theme-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px',
              borderRadius: '6px',
              transition: 'color 0.2s, background 0.2s',
              fontSize: '0.85rem',
              fontFamily: 'inherit',
              animationDelay: '0ms'
            }}
          >
            {copied ? <Check size={MESSAGE_ACTION_ICON_SIZE} /> : <Copy size={MESSAGE_ACTION_ICON_SIZE} />}
          </button>
        )}

        {/* Regenerate Button */}
        {!isStreaming && message.role === 'assistant' && onRegenerate && (
          <button
            onClick={openRegenerateModal}
            className={showActionButtons === true ? 'action-btn-animate' : undefined}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--theme-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px',
              borderRadius: '6px',
              transition: 'color 0.2s, background 0.2s',
              animationDelay: '60ms'
            }}
            title="Regenerate with custom instructions"
          >
            <RotateCcw size={MESSAGE_ACTION_ICON_SIZE} />
          </button>
        )}

        {/* Info Tooltip */}
        {shouldShowInfoTooltip && (
          <div
            ref={infoTriggerRef}
            className={showActionButtons === true ? 'action-btn-animate' : undefined}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              flexShrink: 0,
              overflow: 'visible',
              minWidth: '22px',
              minHeight: '22px',
              animationDelay: '120ms'
            }}
            onMouseEnter={handleInfoMouseEnter}
            onMouseLeave={handleInfoMouseLeave}
          >
            <div style={{ position: 'relative', display: 'flex' }}>
              <Info
                size={MESSAGE_ACTION_ICON_SIZE}
                style={{
                  cursor: 'pointer',
                  color: 'var(--theme-text-muted)',
                  flexShrink: 0,
                  display: 'block',
                  width: `${MESSAGE_ACTION_ICON_SIZE}px`,
                  height: `${MESSAGE_ACTION_ICON_SIZE}px`
                }}
              />
            </div>
          </div>
        )}

        {/* Info Popover */}
        {popoverPosition && (
          <div
            style={{
              position: 'fixed',
              top: popoverPosition.showAbove
                ? popoverPosition.top - 10
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

/**
 * Memoized MessageRenderer component
 * 
 * Uses React.memo() with a custom comparison function (areMessagePropsEqual)
 * to prevent unnecessary re-renders when parent components re-render with
 * unchanged message props.
 * 
 * **Validates: Requirements 5.2**
 * **Property 21: Message Component Memoization**
 * 
 * For any parent component re-render with unchanged message props,
 * the Message component SHALL not re-render.
 */
export const MessageRenderer = memo(MessageRendererComponent, areMessagePropsEqual)

// Set display name for debugging
MessageRenderer.displayName = 'MessageRenderer'

export default MessageRenderer
