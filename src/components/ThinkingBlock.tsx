import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Loader2, Search, Globe, Wrench } from './icons'
import './ThinkingBlock.css'
import { ThinkingBlock as ThinkingBlockType } from '../contexts/ChatHistoryContext'
import AITextLoading from './AITextLoading'
import type { ToolExecutionMetadata } from '../tools/types'
import {
  getWebToolLabel,
  inferWebToolModeFromArgs,
  inferWebToolModeFromResultData,
} from '../tools/ui/webToolDisplay'
import { getToolArgumentSummary, getToolPresentation } from '../tools/ui/toolPresentation'
import { motionDuration, motionDurations, motionEasing, useMotionPreferences } from '@/lib/motion'

function formatToolDisplayName(
  name: string,
  args?: Record<string, unknown>,
  toolOutputData?: unknown
): string {
  if (name === 'web_search') {
    const mode = inferWebToolModeFromResultData(toolOutputData) || inferWebToolModeFromArgs(args)
    return getWebToolLabel(mode)
  }

  return getToolPresentation(name).combinedLabel
}

function parseMcpToolName(name: string): { serverId: string; toolId: string } | null {
  const match = /^mcp__([a-z0-9_]+)__([a-z0-9_]+)$/i.exec(name)
  if (!match) {
    return null
  }

  const [, serverId, toolId] = match
  return { serverId, toolId }
}

function formatMcpToolLabel(
  name: string,
  metadata?: ToolExecutionMetadata
): string | null {
  const parsed = parseMcpToolName(name)
  if (!parsed && metadata?.origin !== 'mcp') {
    return null
  }

  const fallbackPresentation = getToolPresentation(name)
  const serverLabel =
    metadata?.origin === 'mcp'
      ? metadata.serverName
      : fallbackPresentation.serverLabel || parsed?.serverId || 'MCP'
  const toolLabel =
    metadata?.origin === 'mcp'
      ? metadata.originalToolName
      : parsed?.toolId || fallbackPresentation.toolLabel

  return `Tool: ${serverLabel} - ${toolLabel}`
}

function getToolCallText(tool: { name: string; arguments?: Record<string, unknown> }): string {
  const mcpLabel = formatMcpToolLabel(tool.name)
  const displayName = mcpLabel || formatToolDisplayName(tool.name, tool.arguments)
  if (tool.name === 'web_search' && tool.arguments?.query) {
    return `Using ${displayName}: "${String(tool.arguments.query)}"`
  }

  const argumentSummary = getToolArgumentSummary(tool.arguments)
  return argumentSummary ? `Running ${displayName}: ${argumentSummary}` : `Running ${displayName}...`
}

function getToolCallHeaderText(
  activeToolCalls: Array<{ name: string; arguments?: Record<string, unknown> }>
): string {
  const [firstToolCall, ...remainingToolCalls] = activeToolCalls
  if (!firstToolCall) {
    return 'Running tool...'
  }

  const baseText = getToolCallText(firstToolCall)
  return remainingToolCalls.length > 0 ? `${baseText} (+${remainingToolCalls.length} more)` : baseText
}

function getCompletedToolBlockText(block: ThinkingBlockType): string {
  const toolName = block.toolName || (block.type === 'searching' ? 'web_search' : '')
  const mcpLabel = formatMcpToolLabel(toolName, block.toolOutput?.metadata)
  const displayName =
    mcpLabel || formatToolDisplayName(toolName, block.toolInput, block.toolOutput?.data)

  if (toolName === 'web_search') {
    return `${displayName}${block.query ? `: "${block.query}"` : ''}`
  }

  const argumentSummary = getToolArgumentSummary(block.toolInput)
  return argumentSummary ? `${displayName}: ${argumentSummary}` : displayName
}

function getCompletedToolStatus(
  block: ThinkingBlockType
): { label: string; tone: 'neutral' | 'success' | 'warning' | 'error' } | null {
  const toolName = block.toolName || (block.type === 'searching' ? 'web_search' : '')
  const toolOutput = block.toolOutput
  const metadata = toolOutput?.metadata

  if (!toolOutput && toolName === 'web_search') {
    return null
  }

  if (toolName === 'web_search' && toolOutput?.success) {
    return null
  }

  if (metadata?.origin === 'mcp') {
    if (metadata.approvalState === 'rejected' || metadata.outcome === 'rejected') {
      return { label: 'Rejected', tone: 'warning' }
    }
    if (metadata.approvalState === 'timed_out' || metadata.outcome === 'timed_out') {
      return { label: 'Timed Out', tone: 'warning' }
    }
    if (metadata.approvalState === 'cancelled' || metadata.outcome === 'cancelled') {
      return { label: 'Cancelled', tone: 'warning' }
    }
  }

  if (toolOutput?.success) {
    return { label: 'Completed', tone: 'success' }
  }

  if (toolOutput?.error) {
    return { label: 'Failed', tone: 'error' }
  }

  return toolName === 'web_search' ? null : { label: 'Completed', tone: 'success' }
}

function formatToolAuditLine(block: ThinkingBlockType): string | null {
  const metadata = block.toolOutput?.metadata
  if (metadata?.origin !== 'mcp') {
    return null
  }

  const approvalLabel =
    metadata.approvalState === 'not-required'
      ? 'No approval required'
      : metadata.approvalState === 'approved'
        ? 'Approved'
        : metadata.approvalState === 'rejected'
          ? 'Rejected'
          : metadata.approvalState === 'timed_out'
            ? 'Approval timed out'
            : 'Approval cancelled'

  const outcomeLabel =
    metadata.outcome === 'success'
      ? 'Success'
      : metadata.outcome === 'rejected'
        ? 'Rejected'
        : metadata.outcome === 'timed_out'
          ? 'Timed out'
          : metadata.outcome === 'cancelled'
            ? 'Cancelled'
            : 'Error'

  return `${metadata.serverName} MCP | ${approvalLabel} | ${metadata.durationMs}ms | ${outcomeLabel}`
}

interface ThinkingBlockProps {
  messageId?: string
  activeBlockKey?: string
  thinking: string
  isThinking?: boolean
  thinkingDuration?: number // in milliseconds
  isSearching?: boolean // Show "Searching" state instead of "Thinking"
  searchQuery?: string // The search query being searched
  /** Active tool calls during streaming (shows tool calling animation) */
  activeToolCalls?: Array<{ name: string; arguments?: Record<string, unknown> }>
  // New props for showing completed blocks
  completedBlocks?: ThinkingBlockType[]
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (ms > 0 && seconds === 0) {
    return '<1s'
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`
  }
  return `${remainingSeconds}s`
}

/**
 * Strip UI-only fields from web search tool output for cleaner display.
 * Removes favicon, source, displayed_link from results and images array
 * since those are rendered separately in the UI (image carousel, source badges).
 */
function cleanToolOutputForDisplay(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data
  const obj = data as Record<string, unknown>

  // Clean web search results array
  if (Array.isArray(obj.results)) {
    const cleaned = { ...obj }
    cleaned.results = (obj.results as Array<Record<string, unknown>>).map((r) => {
      const { favicon, source, displayed_link, ...rest } = r
      return rest
    })
    // Strip images array (shown in carousel), and metadata fields
    delete cleaned.images
    delete cleaned.imageCount
    delete cleaned.source
    return cleaned
  }

  return data
}

/** Inline Web Search tool call - dropdown with JSON input/output, follows thinking block style */
function InlineWebSearchBlock({ block }: { block: ThinkingBlockType }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { animationsEnabled } = useMotionPreferences()
  const hasDetails =
    (block.toolInput && Object.keys(block.toolInput).length > 0) ||
    (block.toolOutput && (block.toolOutput.data !== undefined || block.toolOutput.error))
  const query = block.query || ''
  const mode =
    inferWebToolModeFromResultData(block.toolOutput?.data) ||
    inferWebToolModeFromArgs(block.toolInput)
  const displayName = formatToolDisplayName('web_search', block.toolInput, block.toolOutput?.data)

  return (
    <div className="thinking-block thinking-inline-tool-call">
      <div
        className={`thinking-header tool-call ${isExpanded ? 'expanded' : ''} ${hasDetails ? 'clickable' : ''}`}
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
      >
        <div className="thinking-label">
          <span className="thinking-tool-calling-icon">
            {mode === 'extract' ? <Globe size={14} /> : <Search size={14} />}
          </span>
          <span className="thinking-text">
            {displayName}
            {query ? `: "${query}"` : ''}
          </span>
          {hasDetails && (
            <motion.div
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{
                duration: motionDuration(animationsEnabled, motionDurations.fast),
                ease: motionEasing.standard,
              }}
            >
              <ChevronRight size={14} className="thinking-chevron" />
            </motion.div>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {isExpanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: {
                duration: motionDuration(animationsEnabled, motionDurations.normal),
                ease: motionEasing.standard,
              },
              opacity: {
                duration: motionDuration(animationsEnabled, motionDurations.fast),
                ease: motionEasing.standard,
              },
            }}
            style={{ overflow: 'hidden' }}
          >
            <div className="thinking-content thinking-tool-details">
              {block.toolInput && Object.keys(block.toolInput).length > 0 && (
                <div className="thinking-tool-json">
                  <div className="thinking-tool-json-label">Input</div>
                  <pre>{JSON.stringify(block.toolInput, null, 2)}</pre>
                </div>
              )}
              {block.toolOutput && (
                <div className="thinking-tool-json">
                  <div className="thinking-tool-json-label">
                    Output
                    {block.toolOutput.executionTime != null && (
                      <span className="thinking-tool-meta">
                        {' '}
                        ({block.toolOutput.executionTime}ms)
                      </span>
                    )}
                  </div>
                  <pre>
                    {block.toolOutput.error
                      ? block.toolOutput.error
                      : block.toolOutput.data !== undefined
                        ? JSON.stringify(cleanToolOutputForDisplay(block.toolOutput.data), null, 2)
                        : '{}'}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Split thinking by --- and interleave with Web Search blocks (replaces --- with tool call UI) */
function renderThinkingWithToolCalls(
  thinking: string,
  searchBlocks: ThinkingBlockType[]
): React.ReactNode {
  const separator = /\n\s*---\s*\n?/g
  const segments = thinking.split(separator)
  const searchBlocksFiltered = searchBlocks.filter((b) => b.type === 'searching')
  if (segments.length <= 1 || searchBlocksFiltered.length === 0) {
    return thinking
  }
  const nodes: React.ReactNode[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg != null && seg.length > 0) {
      nodes.push(
        <span key={`seg-${i}`} className="thinking-segment">
          {seg}
        </span>
      )
    }
    if (i < segments.length - 1 && searchBlocksFiltered[i]) {
      nodes.push(<InlineWebSearchBlock key={`search-${i}`} block={searchBlocksFiltered[i]!} />)
    }
  }
  return <>{nodes}</>
}

// Component for a single completed block (collapsed by default)
function CompletedBlock({
  block,
  defaultExpanded,
}: {
  block: ThinkingBlockType
  defaultExpanded?: boolean
}) {
  const shouldExpand = defaultExpanded !== undefined ? defaultExpanded : false
  const [isExpanded, setIsExpanded] = useState(shouldExpand)
  const { animationsEnabled } = useMotionPreferences()

  useEffect(() => {
    setIsExpanded(shouldExpand)
  }, [block.timestamp, shouldExpand])

  if (block.type === 'searching' || block.type === 'tool') {
    const hasDetails =
      (block.toolInput && Object.keys(block.toolInput).length > 0) ||
      (block.toolOutput && (block.toolOutput.data !== undefined || block.toolOutput.error))
    const toolName = block.toolName || (block.type === 'searching' ? 'web_search' : '')
    const mode =
      toolName === 'web_search'
        ? inferWebToolModeFromResultData(block.toolOutput?.data) ||
          inferWebToolModeFromArgs(block.toolInput)
        : 'search'
    const status = getCompletedToolStatus(block)
    const auditLine = formatToolAuditLine(block)

    return (
      <div className={`thinking-block completed thinking-tool-call ${isExpanded ? 'expanded' : ''}`}>
        <div
          className={`thinking-header completed tool-call ${hasDetails ? 'clickable' : ''}`}
          onClick={() => hasDetails && setIsExpanded(!isExpanded)}
        >
          <div className="thinking-label">
            <span className="thinking-tool-calling-icon">
              {toolName === 'web_search' ? (
                mode === 'extract' ? <Globe size={14} /> : <Search size={14} />
              ) : (
                <Wrench size={14} />
              )}
            </span>
            <span className="thinking-text">
              {getCompletedToolBlockText(block)}
            </span>
            {status && (
              <span className={`thinking-tool-status thinking-tool-status-${status.tone}`}>
                {status.label}
              </span>
            )}
            {hasDetails && (
              <ChevronRight
                size={14}
                className={`thinking-chevron ${isExpanded ? 'rotated' : ''}`}
              />
            )}
          </div>
        </div>
        <AnimatePresence initial={false}>
          {isExpanded && hasDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: {
                  duration: motionDuration(animationsEnabled, motionDurations.normal),
                  ease: motionEasing.standard,
                },
                opacity: {
                  duration: motionDuration(animationsEnabled, motionDurations.fast),
                  ease: motionEasing.standard,
                },
              }}
              style={{ overflow: 'hidden' }}
            >
              <div className="thinking-content thinking-tool-details">
                {block.toolInput && Object.keys(block.toolInput).length > 0 && (
                  <div className="thinking-tool-json">
                    <div className="thinking-tool-json-label">Input</div>
                    <pre>{JSON.stringify(block.toolInput, null, 2)}</pre>
                  </div>
                )}
                {block.toolOutput && (
                  <div className="thinking-tool-json">
                    <div className="thinking-tool-json-label">
                      Output
                      {block.toolOutput.executionTime != null && (
                        <span className="thinking-tool-meta">
                          {' '}
                          ({block.toolOutput.executionTime}ms)
                        </span>
                      )}
                    </div>
                    <pre>
                      {block.toolOutput.error
                        ? block.toolOutput.error
                        : block.toolOutput.data !== undefined
                          ? JSON.stringify(
                              cleanToolOutputForDisplay(block.toolOutput.data),
                              null,
                              2
                            )
                          : '{}'}
                    </pre>
                    {auditLine && <div className="thinking-tool-audit-line">{auditLine}</div>}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // Thinking block
  const hasContent = block.content && block.content.trim().length > 0
  return (
    <div className={`thinking-block completed ${isExpanded ? 'expanded' : ''}`}>
      <div className="thinking-header completed" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="thinking-label">
          <span className="thinking-text">
            Thought for {block.duration ? formatDuration(block.duration) : 'a moment'}
          </span>
          {hasContent && (
            <motion.div
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              <ChevronRight size={14} className="thinking-chevron" />
            </motion.div>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {isExpanded && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
              opacity: { duration: 0.15, ease: 'easeInOut' },
            }}
            style={{ overflow: 'hidden' }}
          >
            <div className="thinking-content">{block.content}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function ThinkingBlock({
  messageId,
  activeBlockKey,
  thinking,
  isThinking = false,
  thinkingDuration,
  isSearching = false,
  searchQuery,
  activeToolCalls = [],
  completedBlocks = [],
}: ThinkingBlockProps) {
  const hasActiveToolCalls = activeToolCalls && activeToolCalls.length > 0
  const extraActiveToolCalls = hasActiveToolCalls ? activeToolCalls.slice(1) : []
  const [isExpanded, setIsExpanded] = useState(isThinking || isSearching || hasActiveToolCalls)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [finalTime, setFinalTime] = useState<number | null>(
    thinkingDuration !== undefined ? thinkingDuration / 1000 : null
  )
  const thinkingStartRef = useRef<number | null>(null)
  // Grace-period timeout ref — keeps the timer alive during brief gaps between
  // research loop rounds so the displayed time doesn't jump back to 0.
  const graceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Whether any active state is happening right now.
  const isActiveSession = isThinking || isSearching || hasActiveToolCalls

  useEffect(() => {
    setIsExpanded(isThinking || isSearching || hasActiveToolCalls)
    setElapsedTime(0)
    setFinalTime(thinkingDuration !== undefined ? thinkingDuration / 1000 : null)
    thinkingStartRef.current = null

    if (graceTimeoutRef.current) {
      clearTimeout(graceTimeoutRef.current)
      graceTimeoutRef.current = null
    }
  }, [messageId, activeBlockKey])

  // Unified timer: starts when any active state begins, keeps running across
  // brief inactive gaps (grace period), and only finalizes when the response
  // is truly done. This prevents the timer from resetting between web search rounds.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined

    if (isActiveSession) {
      // Cancel any pending grace-period finalization — we're active again.
      if (graceTimeoutRef.current) {
        clearTimeout(graceTimeoutRef.current)
        graceTimeoutRef.current = null
      }

      // Start timer if not already running (never reset an existing one).
      if (thinkingStartRef.current === null) {
        thinkingStartRef.current = Date.now()
        setFinalTime(null)
        setElapsedTime(0)
      }

      // Live tick
      interval = setInterval(() => {
        const startTime = thinkingStartRef.current
        if (startTime === null) return

        setElapsedTime((Date.now() - startTime) / 1000)
      }, 100)
    } else if (thinkingStartRef.current) {
      // All active states ended. Update the displayed time immediately but
      // don't finalize yet — a new round may start within the grace window.
      const elapsed = (Date.now() - thinkingStartRef.current) / 1000
      setElapsedTime(elapsed)

      // Grace period: if no new active state within 2s, finalize the timer.
      // 2s is enough to cover the gap between tool-result processing and the
      // next streaming round starting.
      graceTimeoutRef.current = setTimeout(() => {
        if (thinkingStartRef.current) {
          const finalElapsed = (Date.now() - thinkingStartRef.current) / 1000
          setFinalTime(finalElapsed)
          setElapsedTime(finalElapsed)
          thinkingStartRef.current = null
        }
        graceTimeoutRef.current = null
      }, 2000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isActiveSession])

  // Cleanup grace timeout on unmount
  useEffect(() => {
    return () => {
      if (graceTimeoutRef.current) {
        clearTimeout(graceTimeoutRef.current)
      }
    }
  }, [])

  // Keep final time in sync with provider-reported duration updates.
  useEffect(() => {
    if (isActiveSession || thinkingDuration === undefined) return
    // Only sync if the timer has already been finalized (no active start ref
    // and no pending grace timeout).
    if (thinkingStartRef.current || graceTimeoutRef.current) return

    const durationInSeconds = Math.max(0, thinkingDuration / 1000)
    setFinalTime(durationInSeconds)
    setElapsedTime(durationInSeconds)
  }, [thinkingDuration, isActiveSession])

  // Auto-expand while actively thinking, tool calling, or searching.
  // Once complete, leave the expanded state alone so the user's toggle is respected.
  useEffect(() => {
    if (isThinking && thinking && thinking.trim().length > 0) {
      setIsExpanded(true)
    } else if (hasActiveToolCalls) {
      setIsExpanded(true)
    } else if (isSearching) {
      setIsExpanded(true)
    }
  }, [isThinking, isSearching, hasActiveToolCalls, thinking])

  const handleToggle = () => {
    setIsExpanded(!isExpanded)
  }

  if (
    !thinking &&
    !isThinking &&
    !isSearching &&
    !hasActiveToolCalls &&
    completedBlocks.length === 0
  )
    return null

  const hasThinkingContent = thinking && thinking.trim().length > 0
  const showActiveBlock = hasThinkingContent || isThinking || isSearching || hasActiveToolCalls

  // Use finalTime when thinking is complete, otherwise use live elapsedTime
  const displayTime = finalTime !== null ? finalTime : elapsedTime

  // When thinking contains --- and we have search blocks, show them inline (don't duplicate above)
  const searchBlocks = completedBlocks.filter((b) => b.type === 'searching')
  const hasCompletedThinkingBlocks = completedBlocks.some((block) => block.type === 'thinking')
  const hasLegacyInlineThinkingWithToolCalls =
    hasThinkingContent &&
    !hasCompletedThinkingBlocks &&
    /\n\s*---\s*\n?/.test(thinking) &&
    searchBlocks.length > 0
  const blocksToRender = hasLegacyInlineThinkingWithToolCalls
    ? completedBlocks.filter((b) => b.type !== 'searching')
    : completedBlocks
  const searchingMode = inferWebToolModeFromArgs(searchQuery ? { query: searchQuery } : undefined)
  const searchingLabel = searchingMode === 'extract' ? 'Extracting from web' : 'Searching web'

  return (
    <div className="thinking-blocks-container">
      {/* Render completed blocks first - exclude search when shown inline in thinking */}
      {blocksToRender.map((block, index) => (
        <CompletedBlock
          key={`completed-${index}-${block.timestamp}`}
          block={block}
          defaultExpanded={false}
        />
      ))}

      {showActiveBlock && (
        <div className={`thinking-block ${isExpanded ? 'expanded' : ''}`}>
          <div
            className={`thinking-header ${hasActiveToolCalls ? 'tool-calling' : isSearching ? 'searching' : ''}`}
            onClick={handleToggle}
          >
            <div className="thinking-label">
              {hasActiveToolCalls ? (
                <span className="thinking-text thinking-tool-calling">
                  <span className="thinking-tool-calling-icon">
                    {activeToolCalls[0]?.name === 'web_search' ? (
                      <Loader2 size={14} className="tool-call-spinner" />
                    ) : (
                      <Wrench size={14} />
                    )}
                  </span>
                  <AITextLoading
                    text={getToolCallHeaderText(activeToolCalls)}
                    animationKey="tool-calling"
                  />
                </span>
              ) : isSearching ? (
                <span className="thinking-text">
                  <AITextLoading
                    text={`${searchingLabel}${searchQuery ? `: "${searchQuery}"` : ''}`}
                    animationKey="searching"
                  />
                </span>
              ) : isThinking ? (
                <span className="thinking-text">
                  {elapsedTime < 0.5 ? (
                    <AITextLoading text="Connecting" animationKey="connecting" />
                  ) : (
                    <AITextLoading
                      text={`Thinking for ${elapsedTime.toFixed(1)} seconds`}
                      animationKey="thinking"
                    />
                  )}
                </span>
              ) : (
                <>
                  <span className="thinking-text">
                    <AITextLoading
                      text={`Thought For ${displayTime.toFixed(1)} Seconds`}
                      animationKey="completed"
                    />
                  </span>
                  <motion.div
                    animate={{ rotate: isExpanded ? 90 : 0 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <ChevronRight size={14} className="thinking-chevron" />
                  </motion.div>
                </>
              )}
            </div>
          </div>
          <AnimatePresence initial={false}>
            {isExpanded && hasThinkingContent && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
                  opacity: { duration: 0.15, ease: 'easeInOut' },
                }}
                style={{ overflow: 'hidden' }}
              >
                <div className="thinking-content">
                  {hasLegacyInlineThinkingWithToolCalls
                    ? renderThinkingWithToolCalls(thinking, completedBlocks)
                    : thinking}
                </div>
              </motion.div>
            )}
            {isExpanded && extraActiveToolCalls.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
                  opacity: { duration: 0.15, ease: 'easeInOut' },
                }}
                style={{ overflow: 'hidden' }}
              >
                <div className="thinking-content thinking-active-tool-list">
                  {extraActiveToolCalls.map((toolCall, index) => (
                    <div key={`${toolCall.name}-${index}`} className="thinking-active-tool-item">
                      {index + 2}. {getToolCallText(toolCall)}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
