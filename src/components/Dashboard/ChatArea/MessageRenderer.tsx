/**
 * MessageRenderer - Component for rendering chat messages
 * Handles markdown rendering, code blocks, file attachments, and message actions
 *
 *
 * Performance: This component is wrapped with React.memo() to prevent unnecessary
 * re-renders when parent components re-render with unchanged message props.
 * A custom comparison function ensures deep equality checking for message objects.
 */

import React, { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { createPortal } from 'react-dom'
import {
  Copy,
  Check,
  Info,
  File,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  Wrench,
  CheckCircle,
  XCircle,
  ShieldCheck,
  AlertTriangle,
} from '../../icons'
// Separator import removed (no longer used after streaming)
import LazyMarkdown from '../../LazyMarkdown'
import ThinkingBlockComponent from '../../ThinkingBlock'
import ResponseInfo from '../../ResponseInfo'
import { useSettings } from '../../../contexts/SettingsContext'
import ToolResultDisplay from '../../../tools/ui/ToolResultDisplay'
import { summarizeMcpToolResults } from '../../../tools/ui/mcpMetrics'
import type {
  Message,
  ThinkingBlock,
  ToolCallResult,
  FileAttachment,
} from '../../../contexts/ChatHistoryContext'
import type { WebSource } from './WebSourceCitation'
import {
  getWebImageSourceLabel,
  inferWebToolModeFromResultData,
} from '../../../tools/ui/webToolDisplay'
import { formatFileSize } from './attachmentUtils'
import { Button } from '@/components/ui/button'
import type { StreamingPhase } from '../../../contexts/StreamingContext'
import {
  removeToolFollowUpSplitMarker,
  shouldCaptureFollowUpSnapshot,
  splitMessageTimeline,
  type FollowUpTimelineSnapshot,
} from './messageTimeline'
import { shouldHideGenericToolResultCard } from './toolResultVisibility'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

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
    researchPlan?: {
      topic: string
      steps: Array<{ stepNumber: number; query: string; rationale?: string }>
    }
    researchProgress?: { currentStep: number; totalSteps: number; currentQuery?: string }
  }
  isStreaming?: boolean
  streamPhase?: StreamingPhase
  sessionId?: string
  /** Active tool calls during streaming (for in-message tool calling animation) */
  activeToolCalls?: Array<{ name: string; arguments?: Record<string, unknown> }>
  onCopy?: (content: string) => void
  onRegenerate?: (instruction: string) => void
}

const MESSAGE_ACTION_ICON_SIZE = 14
const RESPONSE_INFO_WIDTH = 260
const RESPONSE_INFO_PADDING = 12
const RESPONSE_INFO_HIDE_DELAY_MS = 120
const RESPONSE_INFO_OFFSET_X = 14
const RESPONSE_INFO_ESTIMATED_HEIGHT = 400

function areOptionalRecordsEqual(
  a?: Record<string, unknown>,
  b?: Record<string, unknown>
): boolean {
  if (a === b) return true
  if (!a || !b) return !a && !b
  return JSON.stringify(a) === JSON.stringify(b)
}

function areThinkingBlocksEqual(prevBlocks: ThinkingBlock[], nextBlocks: ThinkingBlock[]): boolean {
  if (prevBlocks === nextBlocks) return true
  if (prevBlocks.length !== nextBlocks.length) return false

  for (let i = 0; i < prevBlocks.length; i++) {
    const prevBlock = prevBlocks[i]
    const nextBlock = nextBlocks[i]

    if (
      prevBlock.type !== nextBlock.type ||
      prevBlock.content !== nextBlock.content ||
      prevBlock.query !== nextBlock.query ||
      prevBlock.duration !== nextBlock.duration ||
      prevBlock.timestamp !== nextBlock.timestamp ||
      !areOptionalRecordsEqual(prevBlock.toolInput, nextBlock.toolInput)
    ) {
      return false
    }

    const prevOutput = prevBlock.toolOutput
    const nextOutput = nextBlock.toolOutput
    if (prevOutput !== nextOutput) {
      if (!prevOutput || !nextOutput) return false
      if (
        prevOutput.success !== nextOutput.success ||
        prevOutput.error !== nextOutput.error ||
        prevOutput.executionTime !== nextOutput.executionTime ||
        JSON.stringify(prevOutput.data) !== JSON.stringify(nextOutput.data)
      ) {
        return false
      }
    }
  }

  return true
}

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
  return content
    .replace(
      /\n+(?:#{1,4}\s*)?(?:\*{1,2})?(?:References|Sources)(?:\*{1,2})?:?\s*\n+(?:\s*\[?\d+\]?[\s.:\-–—].+(?:\n|$))+$/i,
      ''
    )
    .trimEnd()
}

/**
 * Convert reference-style URLs to markdown links.
 * Skips URLs inside fenced code blocks and inline code spans.
 */
function convertUrlsToMarkdownLinks(content: string): string {
  if (!content) return content

  // Split by fenced code blocks first — preserve them untouched
  const fencedParts = content.split(/(```[\s\S]*?```)/g)

  const processed = fencedParts
    .map((part, fIdx) => {
      // Odd indices are fenced code blocks — skip
      if (fIdx % 2 === 1) return part

      // Split by inline code spans — preserve them untouched
      const inlineParts = part.split(/(`[^`]+`)/g)

      return inlineParts
        .map((seg, iIdx) => {
          // Odd indices are inline code spans — skip
          if (iIdx % 2 === 1) return seg

          return convertUrlsInText(seg)
        })
        .join('')
    })
    .join('')

  return processed
}

/** Apply URL→link conversion to a plain-text (non-code) segment */
function convertUrlsInText(text: string): string {
  // Pattern 1: Reference-style URLs like [1] https://example.com
  let result = text.replace(
    /(^|\s)\[(\d+)\]\s+(https?:\/\/[^\s\)\]\[`]+)/gm,
    (_match, prefix, num, url) => {
      const cleanUrl = url.replace(/[.,;:!?]+$/, '')
      return `${prefix}[[${num}]](${cleanUrl})`
    }
  )

  // Pattern 2: References section format
  const lines = result.split('\n')
  const processedLines = lines.map((line) => {
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
function convertNumericCitationsToMarkdownLinks(
  content: string,
  orderedSourceUrls: string[]
): string {
  if (!content || orderedSourceUrls.length === 0) return content

  const parts = content.split(/(```[\s\S]*?```)/g)

  return parts
    .map((part, index) => {
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

        return refNumbers.map((n) => `[[${n}]](${orderedSourceUrls[n - 1]})`).join(', ')
      })
    })
    .join('')
}

/**
 * Web Search Image Carousel Component
 * Renders inline with the message flow—no card container, minimal chrome.
 * Uses smooth scroll animation when navigating between pages.
 */
function WebSearchImageCarousel({
  images,
  mode,
}: {
  images: Array<{ url: string; description?: string }>
  mode: 'search' | 'extract' | 'mixed'
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const imagesPerPage = 4
  const totalPages = Math.ceil(images.length / imagesPerPage)
  const sourceLabel = getWebImageSourceLabel(mode)

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '6px',
          gap: '8px',
        }}
      >
        <span
          style={{
            color: 'var(--theme-text-muted)',
            fontSize: '0.8rem',
            fontWeight: 500,
          }}
        >
          {images.length} {images.length === 1 ? 'image' : 'images'} from {sourceLabel}
        </span>
        {images.length > imagesPerPage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
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
                transition: 'color 0.15s',
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
            <span
              style={{
                color: 'var(--theme-text-muted)',
                fontSize: '0.7rem',
                minWidth: '32px',
                textAlign: 'center',
              }}
            >
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
                transition: 'color 0.15s',
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
          scrollSnapType: 'x mandatory',
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
              scrollSnapAlign: 'start',
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
                borderRadius: 'inherit',
              }}
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
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
  bubbleStyle = 'solid',
}: {
  message: MessageRendererProps['message']
  bubbleStyle?: 'solid' | 'glass' | 'outline' | 'gradient' | 'elevated' | 'terminal'
}) {
  const bubbleStyleByPreset: Record<
    'solid' | 'glass' | 'outline' | 'gradient' | 'elevated' | 'terminal',
    React.CSSProperties
  > = {
    solid: {
      background: 'var(--theme-user-message-bg)',
      border: '1px solid var(--theme-border-subtle)',
      boxShadow: 'var(--theme-shadow-sm)',
      color: 'var(--theme-user-message-text)',
    },
    glass: {
      background: 'rgba(148, 163, 184, 0.18)',
      border: '1px solid rgba(255, 255, 255, 0.22)',
      boxShadow: 'var(--theme-shadow-sm)',
      color: 'var(--theme-text-primary)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
    },
    outline: {
      background: 'transparent',
      border: '1px solid var(--theme-accent-muted)',
      boxShadow: 'none',
      color: 'var(--theme-text-primary)',
    },
    gradient: {
      background:
        'linear-gradient(135deg, color-mix(in srgb, var(--theme-accent) 82%, transparent) 0%, color-mix(in srgb, var(--theme-accent-secondary) 78%, transparent) 100%)',
      border: '1px solid color-mix(in srgb, var(--theme-accent) 45%, transparent)',
      boxShadow: 'var(--theme-shadow-sm)',
      color: 'var(--theme-text-inverse)',
    },
    elevated: {
      background: 'var(--theme-surface)',
      border: '1px solid var(--theme-border)',
      boxShadow: 'var(--theme-shadow-md)',
      color: 'var(--theme-text-primary)',
    },
    terminal: {
      background: 'color-mix(in srgb, var(--theme-background) 76%, black 24%)',
      border: '1px dashed var(--theme-border-hover)',
      boxShadow: 'none',
      color: 'var(--theme-text-primary)',
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      letterSpacing: '0.01em',
    },
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        marginBottom: '24px',
        gap: '8px',
      }}
    >
      {message.files && message.files.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, max-content))',
            gap: '8px',
            maxWidth: '70%',
            width: '100%',
          }}
        >
          {message.files.map((file: FileAttachment) =>
            file.type === 'image' ? (
              <div
                key={file.id}
                style={{
                  background: 'color-mix(in srgb, var(--theme-surface) 88%, transparent)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: '16px',
                  padding: '8px',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  boxShadow: 'var(--theme-shadow-sm)',
                }}
              >
                <img
                  src={file.data}
                  alt={file.name}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '300px',
                    borderRadius: '12px',
                    objectFit: 'cover',
                    display: 'block',
                    width: '100%',
                    height: 'auto',
                    background:
                      'color-mix(in srgb, var(--theme-background) 84%, black 16%)',
                  }}
                />
                <div
                  style={{
                    padding: '10px 8px 2px',
                    fontSize: '0.75rem',
                    color: 'var(--theme-text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {file.name}
                </div>
                <div
                  style={{
                    padding: '0 8px 6px',
                    fontSize: '0.72rem',
                    color: 'var(--theme-text-muted)',
                  }}
                >
                  {formatFileSize(file.size)}
                </div>
              </div>
            ) : (
              <div
                key={file.id}
                style={{
                  background: 'color-mix(in srgb, var(--theme-surface) 88%, transparent)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: '14px',
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  maxWidth: '100%',
                  boxShadow: 'var(--theme-shadow-sm)',
                }}
              >
                <File size={16} color="var(--theme-text-muted)" />
                <span
                  style={{
                    color: 'var(--theme-text-primary)',
                    fontSize: '0.85rem',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {file.name}
                </span>
                <span style={{ color: 'var(--theme-text-muted)', fontSize: '0.75rem' }}>
                  {formatFileSize(file.size)}
                </span>
              </div>
            )
          )}
        </div>
      )}

      {message.content && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '20px 20px 6px 20px',
            fontSize: '0.95rem',
            maxWidth: '70%',
            whiteSpace: 'pre-wrap',
            ...bubbleStyleByPreset[bubbleStyle],
          }}
        >
          {message.content}
        </div>
      )}
    </div>
  )
}

/**
 * Custom comparison function for MessageRenderer memoization
 *
 * Performs a focused deep comparison so historical messages stay stable while
 * nearby streaming state changes.
 */
function areMessagePropsEqual(
  prevProps: MessageRendererProps,
  nextProps: MessageRendererProps
): boolean {
  // Compare isStreaming - this is critical for streaming updates
  if (prevProps.isStreaming !== nextProps.isStreaming) {
    return false
  }
  if (prevProps.streamPhase !== nextProps.streamPhase) {
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
  if (!areThinkingBlocksEqual(prevThinkingBlocks, nextThinkingBlocks)) {
    return false
  }

  // Compare research status
  const prevResearch = prevMsg.researchStatus
  const nextResearch = nextMsg.researchStatus
  if (
    prevResearch?.isSearching !== nextResearch?.isSearching ||
    prevResearch?.currentRound !== nextResearch?.currentRound ||
    prevResearch?.maxRounds !== nextResearch?.maxRounds ||
    prevResearch?.currentSearch !== nextResearch?.currentSearch
  ) {
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
  if (
    prevProgress?.currentStep !== nextProgress?.currentStep ||
    prevProgress?.totalSteps !== nextProgress?.totalSteps
  ) {
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
    if (
      prevToolResults[i].toolCall.id !== nextToolResults[i].toolCall.id ||
      prevToolResults[i].toolCall.name !== nextToolResults[i].toolCall.name ||
      JSON.stringify(prevToolResults[i].toolCall.arguments) !==
        JSON.stringify(nextToolResults[i].toolCall.arguments) ||
      prevToolResults[i].result.success !== nextToolResults[i].result.success ||
      prevToolResults[i].result.error !== nextToolResults[i].result.error ||
      prevToolResults[i].result.executionTime !== nextToolResults[i].result.executionTime ||
      JSON.stringify(prevToolResults[i].result.metadata) !==
        JSON.stringify(nextToolResults[i].result.metadata) ||
      prevToolResults[i].result.data !== nextToolResults[i].result.data
    ) {
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
  if (
    prevMsg.usage?.inputTokens !== nextMsg.usage?.inputTokens ||
    prevMsg.usage?.outputTokens !== nextMsg.usage?.outputTokens ||
    prevMsg.usage?.totalTokens !== nextMsg.usage?.totalTokens
  ) {
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
 */
function MessageRendererComponent({
  message,
  isStreaming = false,
  streamPhase,
  sessionId,
  activeToolCalls,
  onCopy,
  onRegenerate,
}: MessageRendererProps) {
  const { settings } = useSettings()
  const [copied, setCopied] = useState(false)

  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null)
  const [isHoveringInfo, setIsHoveringInfo] = useState(false)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)
  const [regenerateInstruction, setRegenerateInstruction] = useState('')
  const [displayVersionIndex, setDisplayVersionIndex] = useState(0)
  const infoTriggerRef = useRef<HTMLDivElement>(null)
  const infoPopoverRef = useRef<HTMLDivElement>(null)
  const hidePopoverTimeoutRef = useRef<number | null>(null)
  const messageRef = useRef<HTMLDivElement>(null)
  const regenerateInputRef = useRef<HTMLTextAreaElement>(null)

  // Track if content has arrived during streaming
  const [hasContentDuringStreaming, setHasContentDuringStreaming] = useState(false)
  // Track whether to trigger the staggered button animation.
  // null = no animation (historical messages), true = animate in
  const [showActionButtons, setShowActionButtons] = useState<boolean | null>(null)
  const [followUpSnapshot, setFollowUpSnapshot] = useState<FollowUpTimelineSnapshot | null>(null)
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

  useEffect(() => {
    setFollowUpSnapshot(null)
  }, [message.id])

  // Get all versions including current message
  const versions = message.responseVersions || []
  const totalVersions = versions.length + (message.content ? 1 : 0)
  const currentVersionIndex = message.currentVersionIndex || 0
  const messageActionButtonClassName =
    showActionButtons === true
      ? 'message-action-surface action-btn-animate'
      : 'message-action-surface'

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
  const rawDisplayContent = displayMessage?.content || ''
  const displayContent = removeToolFollowUpSplitMarker(rawDisplayContent)
  const hasDisplayContent = displayContent.trim().length > 0
  const completedBlocks = message.thinkingBlocks || []

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
                favicon: String(entry.favicon || ''),
              })
            }
          }
        }
      }
    }
    return { webSourceMap: map, orderedWebSourceUrls: orderedUrls }
  }, [message.toolResults])

  const processMessageContent = useCallback(
    (content: string) => {
      if (!content.trim()) {
        return ''
      }

      const withUrlLinks = convertUrlsToMarkdownLinks(content)
      const withCitations = convertNumericCitationsToMarkdownLinks(withUrlLinks, orderedWebSourceUrls)
      return orderedWebSourceUrls.length > 0 ? stripReferencesSection(withCitations) : withCitations
    },
    [orderedWebSourceUrls]
  )

  // Extract all images from web_search tool results
  const { webSearchImages, webImageMode } = useMemo(() => {
    const images: Array<{ url: string; description?: string; mode: 'search' | 'extract' }> = []
    if (!message.toolResults) {
      return { webSearchImages: images, webImageMode: 'search' as const }
    }

    const modeSet = new Set<'search' | 'extract'>()

    for (const tr of message.toolResults) {
      if (tr.toolCall.name === 'web_search' && tr.result?.success && tr.result?.data) {
        const dataObj = tr.result.data as Record<string, unknown>
        const mode = inferWebToolModeFromResultData(dataObj) || 'search'
        modeSet.add(mode)
        const resultImages = (dataObj.images as unknown[]) || []
        if (Array.isArray(resultImages)) {
          for (const img of resultImages) {
            if (typeof img === 'string') {
              images.push({ url: img, mode })
            } else if (img && typeof img === 'object') {
              const imgObj = img as Record<string, unknown>
              if (imgObj.url) {
                images.push({
                  url: String(imgObj.url),
                  description: String(imgObj.description || imgObj.alt || '') || undefined,
                  mode,
                })
              }
            }
          }
        }
      }
    }

    const webImageMode: 'search' | 'extract' | 'mixed' =
      modeSet.size > 1 ? 'mixed' : modeSet.values().next().value || 'search'

    return { webSearchImages: images, webImageMode }
  }, [message.toolResults])

  const isUser = message.role === 'user'
  const hasThinking = typeof message.thinking === 'string' && message.thinking.trim().length > 0
  const isReasoningPhase = streamPhase === 'reasoning'
  const showThinkingSpinner = isStreaming && isReasoningPhase && !hasThinking
  const completedThinkingCount = completedBlocks.filter((block) => block.type === 'thinking').length
  const activeThinkingBlockKey = `${message.id}:${completedThinkingCount}:${streamPhase || 'idle'}`
  const hasActiveToolCalls = (activeToolCalls?.length || 0) > 0

  useEffect(() => {
    if (!shouldCaptureFollowUpSnapshot({
      isStreaming,
      streamPhase,
      content: displayContent,
      isSearching: message.researchStatus?.isSearching || false,
      activeToolCallCount: activeToolCalls?.length || 0,
      existingSnapshot: followUpSnapshot,
    })) {
      return
    }

    setFollowUpSnapshot({
      contentLength: displayContent.length,
      completedBlockCount: completedBlocks.length,
    })
  }, [
    activeToolCalls?.length,
    completedBlocks.length,
    displayContent,
    followUpSnapshot,
    isStreaming,
    message.researchStatus?.isSearching,
    streamPhase,
  ])

  const timeline = useMemo(
    () => splitMessageTimeline(rawDisplayContent, completedBlocks, followUpSnapshot),
    [completedBlocks, followUpSnapshot, rawDisplayContent]
  )

  const topProcessedContent = useMemo(
    () => processMessageContent(timeline.beforeContent),
    [processMessageContent, timeline.beforeContent]
  )
  const bottomProcessedContent = useMemo(
    () => processMessageContent(timeline.afterContent),
    [processMessageContent, timeline.afterContent]
  )
  const hasTopDisplayContent = topProcessedContent.trim().length > 0
  const hasBottomDisplayContent = bottomProcessedContent.trim().length > 0
  const visibleToolResults = useMemo(
    () => (message.toolResults || []).filter((result) => !shouldHideGenericToolResultCard(result)),
    [message.toolResults]
  )
  const showVisibleToolResults = !isStreaming && visibleToolResults.length > 0
  const hasSplitFollowUpSection =
    Boolean(followUpSnapshot) || timeline.afterBlocks.length > 0 || hasBottomDisplayContent
  const activeTimelineOwner = hasSplitFollowUpSection ? 'lower' : 'upper'
  const hasActiveThinkingState =
    hasThinking || showThinkingSpinner || Boolean(message.researchStatus?.isSearching) || hasActiveToolCalls
  const showUpperThinkingBlock =
    timeline.beforeBlocks.length > 0 ||
    (activeTimelineOwner === 'upper' && hasActiveThinkingState)
  const showLowerThinkingBlock =
    timeline.afterBlocks.length > 0 ||
    hasBottomDisplayContent ||
    (activeTimelineOwner === 'lower' && hasActiveThinkingState)

  // Handle copy
  const handleCopy = () => {
    if (onCopy) {
      onCopy(removeToolFollowUpSplitMarker(message.content))
    } else {
      navigator.clipboard.writeText(removeToolFollowUpSplitMarker(message.content))
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
    setDisplayVersionIndex((prev) => {
      if (direction === 'next' && prev < totalVersions - 1) {
        return prev + 1
      } else if (direction === 'prev' && prev > 0) {
        return prev - 1
      }
      return prev
    })
  }

  // Update popover position relative to the info trigger.
  const updatePopoverPosition = () => {
    const rect = infoTriggerRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }

    const popoverRect = infoPopoverRef.current?.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const padding = RESPONSE_INFO_PADDING
    const popoverWidth = popoverRect?.width || RESPONSE_INFO_WIDTH
    const popoverHeight = popoverRect?.height || RESPONSE_INFO_ESTIMATED_HEIGHT

    const spaceOnRight = viewportWidth - rect.right - padding
    const spaceOnLeft = rect.left - padding
    const prefersRight = spaceOnRight >= popoverWidth || spaceOnRight >= spaceOnLeft

    let left = prefersRight
      ? rect.right + RESPONSE_INFO_OFFSET_X
      : rect.left - popoverWidth - RESPONSE_INFO_OFFSET_X

    const maxLeft = viewportWidth - popoverWidth - padding
    if (left > maxLeft) {
      left = rect.left - popoverWidth - RESPONSE_INFO_OFFSET_X
    }
    if (left < padding) {
      left = rect.right + RESPONSE_INFO_OFFSET_X
    }

    left = Math.min(Math.max(left, padding), Math.max(padding, maxLeft))

    let top = rect.top + rect.height / 2 - popoverHeight / 2
    const maxTop = viewportHeight - popoverHeight - padding
    top = Math.min(Math.max(top, padding), Math.max(padding, maxTop))

    setPopoverPosition({ top, left })
  }

  const clearHidePopoverTimeout = () => {
    if (hidePopoverTimeoutRef.current !== null) {
      window.clearTimeout(hidePopoverTimeoutRef.current)
      hidePopoverTimeoutRef.current = null
    }
  }

  const scheduleHidePopover = () => {
    clearHidePopoverTimeout()
    hidePopoverTimeoutRef.current = window.setTimeout(() => {
      setIsHoveringInfo(false)
      setPopoverPosition(null)
      hidePopoverTimeoutRef.current = null
    }, RESPONSE_INFO_HIDE_DELAY_MS)
  }

  const handleInfoMouseEnter = () => {
    clearHidePopoverTimeout()
    setIsHoveringInfo(true)
    updatePopoverPosition()
  }

  const handleInfoMouseLeave = () => {
    scheduleHidePopover()
  }

  const handlePopoverMouseEnter = () => {
    clearHidePopoverTimeout()
    setIsHoveringInfo(true)
    updatePopoverPosition()
  }

  const handlePopoverMouseLeave = () => {
    scheduleHidePopover()
  }

  // Update position on scroll/resize when hovering
  useEffect(() => {
    if (isHoveringInfo) {
      const animationFrame = window.requestAnimationFrame(() => {
        updatePopoverPosition()
      })
      const handleUpdate = () => updatePopoverPosition()
      window.addEventListener('scroll', handleUpdate, true)
      window.addEventListener('resize', handleUpdate)
      return () => {
        window.cancelAnimationFrame(animationFrame)
        window.removeEventListener('scroll', handleUpdate, true)
        window.removeEventListener('resize', handleUpdate)
      }
    }
  }, [isHoveringInfo])

  useEffect(() => {
    return () => {
      clearHidePopoverTimeout()
    }
  }, [])

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
  const shouldShowInfoTooltip =
    !isStreaming &&
    (hasDisplayContent ||
      Boolean(message.thinking) ||
      Boolean(message.model) ||
      Boolean(message.usage) ||
      Boolean(message.finishReason) ||
      typeof message.requestedMaxTokens === 'number' ||
      typeof message.latency === 'number' ||
      Boolean(message.toolResults))

  const shouldShowActionRow =
    !isStreaming &&
    (hasDisplayContent ||
      totalVersions > 0 ||
      shouldShowInfoTooltip)

  return (
    <div style={{ marginBottom: '24px' }} tabIndex={0} onKeyDown={handleKeyDown} ref={messageRef}>
      {showUpperThinkingBlock && (
        <div style={{ marginBottom: '8px' }}>
          <ThinkingBlockComponent
            messageId={message.id}
            activeBlockKey={
              activeTimelineOwner === 'upper'
                ? activeThinkingBlockKey
                : `${activeThinkingBlockKey}:upper`
            }
            thinking={activeTimelineOwner === 'upper' ? message.thinking || '' : ''}
            isThinking={
              activeTimelineOwner === 'upper' &&
              isStreaming &&
              isReasoningPhase &&
              !message.researchStatus?.isSearching &&
              !hasActiveToolCalls
            }
            thinkingDuration={
              activeTimelineOwner === 'upper' ? message.thinkingDuration : undefined
            }
            isSearching={
              activeTimelineOwner === 'upper' ? message.researchStatus?.isSearching || false : false
            }
            searchQuery={
              activeTimelineOwner === 'upper' ? message.researchStatus?.currentSearch : undefined
            }
            completedBlocks={timeline.beforeBlocks}
            activeToolCalls={activeTimelineOwner === 'upper' ? activeToolCalls : []}
          />
        </div>
      )}

      {/* Web Search/Extract image carousel - shown after thinking ends, before message content */}
      {!isStreaming && webSearchImages.length > 0 && (
        <WebSearchImageCarousel images={webSearchImages} mode={webImageMode} />
      )}

      {/* Message content - only show when not streaming or when content has arrived */}
      {((!isStreaming || hasContentDuringStreaming || completedBlocks.length > 0 || message.researchStatus) &&
        hasTopDisplayContent) && (
        <div className="markdown-content">
          <LazyMarkdown
            content={topProcessedContent}
            webSources={webSourceMap}
            isStreaming={isStreaming}
          />
        </div>
      )}

      {showVisibleToolResults && (
        <div style={{ marginTop: '12px', marginBottom: shouldShowActionRow ? '12px' : 0 }}>
          {visibleToolResults.map((result, index) => {
            const toolResultIndex = (message.toolResults || []).findIndex(
              (item) => item.toolCall.id === result.toolCall.id
            )

            return (
              <ToolResultDisplay
                key={`message-tool-${result.toolCall.id || index}`}
                toolName={result.toolCall.name}
                result={result.result?.success ? result.result.data : undefined}
                error={result.result?.success ? undefined : result.result?.error}
                metadata={result.result?.metadata}
                toolArguments={result.toolCall.arguments}
                executionTime={result.result?.executionTime}
                sessionId={sessionId}
                messageId={message.id}
                toolResultIndex={toolResultIndex >= 0 ? toolResultIndex : index}
              />
            )
          })}
        </div>
      )}

      {showLowerThinkingBlock && (
        <div
          style={{
            marginTop: showVisibleToolResults || hasTopDisplayContent ? '12px' : 0,
            marginBottom: '8px',
          }}
        >
          <ThinkingBlockComponent
            messageId={message.id}
            activeBlockKey={
              activeTimelineOwner === 'lower'
                ? activeThinkingBlockKey
                : `${activeThinkingBlockKey}:lower`
            }
            thinking={activeTimelineOwner === 'lower' ? message.thinking || '' : ''}
            isThinking={
              activeTimelineOwner === 'lower' &&
              isStreaming &&
              isReasoningPhase &&
              !message.researchStatus?.isSearching &&
              !hasActiveToolCalls
            }
            thinkingDuration={
              activeTimelineOwner === 'lower' ? message.thinkingDuration : undefined
            }
            isSearching={
              activeTimelineOwner === 'lower' ? message.researchStatus?.isSearching || false : false
            }
            searchQuery={
              activeTimelineOwner === 'lower' ? message.researchStatus?.currentSearch : undefined
            }
            completedBlocks={timeline.afterBlocks}
            activeToolCalls={activeTimelineOwner === 'lower' ? activeToolCalls : []}
          />
        </div>
      )}

      {hasBottomDisplayContent && (
        <div className="markdown-content">
          <LazyMarkdown
            content={bottomProcessedContent}
            webSources={webSourceMap}
            isStreaming={isStreaming}
          />
        </div>
      )}

      {shouldShowActionRow && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginTop: '12px',
            overflow: 'visible',
          }}
        >
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
                alignItems: 'center',
              }}
            >
              <ChevronLeft size={16} />
            </button>

            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--theme-text-secondary)',
                fontFamily: 'monospace',
              }}
            >
              v{displayVersionIndex + 1}/{totalVersions}
            </span>

            <button
              onClick={() => navigateVersion('next')}
              disabled={displayVersionIndex >= totalVersions - 1}
              style={{
                background: 'transparent',
                border: 'none',
                color:
                  displayVersionIndex < totalVersions - 1
                    ? 'var(--theme-text-muted)'
                    : 'var(--theme-border)',
                cursor: displayVersionIndex < totalVersions - 1 ? 'pointer' : 'not-allowed',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}

        {/* Copy Button - hide while streaming, animate in after */}
        {hasDisplayContent && (
          <button
            onClick={handleCopy}
            className={messageActionButtonClassName}
            style={{
              color: copied ? 'var(--theme-success)' : 'var(--theme-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px',
              fontSize: '0.85rem',
              fontFamily: 'inherit',
              animationDelay: '0ms',
            }}
          >
            {copied ? (
              <Check size={MESSAGE_ACTION_ICON_SIZE} />
            ) : (
              <Copy size={MESSAGE_ACTION_ICON_SIZE} />
            )}
          </button>
        )}

        {message.role === 'assistant' && onRegenerate && (
          <button
            onClick={openRegenerateModal}
            className={messageActionButtonClassName}
            style={{
              color: 'var(--theme-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px',
              animationDelay: '60ms',
            }}
            title="Regenerate with custom instructions"
          >
            <RotateCcw size={MESSAGE_ACTION_ICON_SIZE} />
          </button>
        )}

        {shouldShowInfoTooltip && (
          <div
            ref={infoTriggerRef}
            className={messageActionButtonClassName}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              cursor: 'pointer',
              flexShrink: 0,
              overflow: 'visible',
              minWidth: '22px',
              minHeight: '22px',
              animationDelay: '120ms',
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
                  height: `${MESSAGE_ACTION_ICON_SIZE}px`,
                }}
              />
            </div>
          </div>
        )}

        {popoverPosition &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              ref={infoPopoverRef}
              onMouseEnter={handlePopoverMouseEnter}
              onMouseLeave={handlePopoverMouseLeave}
              style={{
                position: 'fixed',
                top: popoverPosition.top,
                left: popoverPosition.left,
                zIndex: 1000,
              }}
            >
              <ResponseInfo
                model={message.model || settings.aiModel}
                latency={message.latency}
                usage={message.usage}
                finishReason={message.finishReason}
                requestedMaxTokens={message.requestedMaxTokens}
              />
            </div>,
            document.body
          )}
        </div>
      )}

      <Dialog open={showRegenerateModal} onOpenChange={setShowRegenerateModal}>
        <DialogContent showCloseButton className="max-w-[500px] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-[var(--theme-border)] px-5 py-4 pr-12">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--theme-accent-muted)] text-[var(--theme-accent)]">
                <RotateCcw size={16} />
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-[0.95rem] text-[var(--theme-text-primary)]">
                  Regenerate Response
                </DialogTitle>
                <DialogDescription className="text-[0.78rem] text-[var(--theme-text-muted)]">
                  Leave empty to regenerate normally.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4">
            <Textarea
              ref={regenerateInputRef}
              value={regenerateInstruction}
              onChange={(e) => setRegenerateInstruction(e.target.value)}
              placeholder='Describe what you want to change... (e.g., "make it more concise", "add code examples", "explain in simpler terms")'
              className="min-h-[80px] max-h-[200px] resize-y rounded-xl border-[var(--theme-border)] bg-[var(--theme-surface-subtle)] px-3 py-3 text-[0.9rem] shadow-none focus-visible:border-[var(--theme-accent)] focus-visible:ring-[var(--theme-accent-muted)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleRegenerate()
                } else if (e.key === 'Escape') {
                  setShowRegenerateModal(false)
                }
              }}
            />

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-xs text-[var(--theme-text-muted)]">
                <CornerDownLeft size={12} />
                <span>Cmd+Enter to regenerate</span>
              </div>

              <DialogFooter className="gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setShowRegenerateModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleRegenerate} className="gap-2">
                  <RotateCcw size={14} />
                  Regenerate
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function buildMcpFailureSummary(metrics: ReturnType<typeof summarizeMcpToolResults>): string {
  const parts: string[] = []
  if (metrics.rejectedCount > 0) parts.push(`${metrics.rejectedCount} rejected`)
  if (metrics.timedOutCount > 0) parts.push(`${metrics.timedOutCount} timed out`)
  if (metrics.cancelledCount > 0) parts.push(`${metrics.cancelledCount} cancelled`)
  return parts.join(' • ')
}

function buildMcpApprovalSummary(metrics: ReturnType<typeof summarizeMcpToolResults>): string {
  const parts: string[] = []
  if (metrics.approvalApprovedCount > 0) parts.push(`${metrics.approvalApprovedCount} approved`)
  if (metrics.approvalRejectedCount > 0) parts.push(`${metrics.approvalRejectedCount} rejected`)
  if (metrics.approvalTimedOutCount > 0) parts.push(`${metrics.approvalTimedOutCount} timed out`)
  if (metrics.approvalCancelledCount > 0) parts.push(`${metrics.approvalCancelledCount} cancelled`)
  return `Approvals: ${parts.join(' • ')}`
}

function McpMetricChip({
  icon,
  label,
  tone = 'neutral',
}: {
  icon: React.ReactNode
  label: string
  tone?: 'neutral' | 'success' | 'warning' | 'error'
}) {
  const tones: Record<typeof tone, { bg: string; border: string; color: string }> = {
    neutral: {
      bg: 'var(--theme-surface-subtle)',
      border: 'var(--theme-border-subtle)',
      color: 'var(--theme-text-secondary)',
    },
    success: {
      bg: 'var(--theme-success-bg)',
      border: 'color-mix(in srgb, var(--theme-success) 24%, var(--theme-border))',
      color: 'var(--theme-success)',
    },
    warning: {
      bg: 'color-mix(in srgb, var(--theme-warning, #f59e0b) 16%, transparent)',
      border: 'color-mix(in srgb, var(--theme-warning, #f59e0b) 26%, var(--theme-border))',
      color: 'var(--theme-warning, #f59e0b)',
    },
    error: {
      bg: 'var(--theme-error-bg)',
      border: 'color-mix(in srgb, var(--theme-error) 24%, var(--theme-border))',
      color: 'var(--theme-error)',
    },
  }

  const toneStyle = tones[tone]

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 10px',
        borderRadius: '999px',
        background: toneStyle.bg,
        border: `1px solid ${toneStyle.border}`,
        color: toneStyle.color,
        fontSize: '0.75rem',
        fontWeight: 600,
      }}
    >
      {icon}
      <span>{label}</span>
    </div>
  )
}

void buildMcpFailureSummary
void buildMcpApprovalSummary
void McpMetricChip
void Wrench
void CheckCircle
void XCircle
void ShieldCheck
void AlertTriangle

/**
 * Memoized MessageRenderer component
 *
 * Uses React.memo() with a custom comparison function (areMessagePropsEqual)
 * to prevent unnecessary re-renders when parent components re-render with
 * unchanged message props.
 */
export const MessageRenderer = memo(MessageRendererComponent, areMessagePropsEqual)

// Set display name for debugging
MessageRenderer.displayName = 'MessageRenderer'

export default MessageRenderer
