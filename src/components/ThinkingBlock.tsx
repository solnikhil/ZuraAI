import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Box, BrainCircuit, ChevronRight, Search } from './icons'
import { WithTooltip } from './ui/WithTooltip'
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
import { shouldSuppressNoisyToolUi } from './Dashboard/ChatArea/toolResultVisibility'
import {
  motionDuration,
  motionDurations,
  motionEasing,
  motionSpring,
  motionSpringTransition,
  useMotionPreferences,
} from '@/lib/motion'

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

function formatMcpToolLabel(name: string, metadata?: ToolExecutionMetadata): string | null {
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

  if (tool.name === 'code_execution') {
    const desc = tool.arguments?.description ? String(tool.arguments.description) : null
    const lang = tool.arguments?.language === 'python' ? 'Python' : 'JavaScript'
    return desc ? `Running ${lang}: ${desc}` : `Running ${lang} code…`
  }

  // Friendlier status for artifact tools (e.g. "recreate those")
  if (tool.name === 'artifact_create' || tool.name === 'artifact_update') {
    const title = typeof tool.arguments?.title === 'string' ? tool.arguments.title : ''
    const verb = tool.name === 'artifact_create' ? 'Creating' : 'Updating'
    if (title) {
      return `${verb} “${title}”`
    }
    return `${verb} artifact…`
  }

  const argumentSummary = getToolArgumentSummary(tool.arguments)
  return argumentSummary
    ? `Running ${displayName}: ${argumentSummary}`
    : `Running ${displayName}...`
}

function getToolCallHeaderText(
  activeToolCalls: Array<{ name: string; arguments?: Record<string, unknown> }>
): string {
  const [firstToolCall, ...remainingToolCalls] = activeToolCalls
  if (!firstToolCall) {
    return 'Running tool...'
  }

  const baseText = getToolCallText(firstToolCall)
  return remainingToolCalls.length > 0
    ? `${baseText} (+${remainingToolCalls.length} more)`
    : baseText
}

function getActiveSearchItemText(query: string): React.ReactNode {
  return (
    <span className="thinking-text">
      Sourcing <span className="search-query">“{query}”</span>
    </span>
  )
}

function getToolCallsAnimationKey(
  activeToolCalls: Array<{ name: string; arguments?: Record<string, unknown> }>
): string {
  return activeToolCalls
    .map((toolCall) => `${toolCall.name}:${JSON.stringify(toolCall.arguments ?? {})}`)
    .join('|')
}

function getCompletedToolBlockText(block: ThinkingBlockType): React.ReactNode {
  const toolName = block.toolName || (block.type === 'searching' ? 'web_search' : '')
  const mcpLabel = formatMcpToolLabel(toolName, block.toolOutput?.metadata)
  const displayName =
    mcpLabel || formatToolDisplayName(toolName, block.toolInput, block.toolOutput?.data)

  if (toolName === 'web_search') {
    const q = block.query ? block.query : ''
    const count = getWebSearchResultCount(block.toolOutput?.data)
    const countPart = count != null ? `(${count} source${count === 1 ? '' : 's'})` : ''
    return (
      <>
        Sourced <span className="search-query">“{q}”</span>
        {countPart && <span className="search-count"> {countPart}</span>}
      </>
    )
  }

  if (toolName === 'code_execution' && block.toolInput?.description) {
    return `${displayName}: ${String(block.toolInput.description)}`
  }

  const argumentSummary = getToolArgumentSummary(block.toolInput)
  return argumentSummary ? `${displayName}: ${argumentSummary}` : displayName
}

function getWebSearchResultCount(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  if (typeof obj.resultCount === 'number' && Number.isFinite(obj.resultCount)) {
    return Math.max(0, obj.resultCount)
  }
  if (Array.isArray(obj.results)) {
    return obj.results.length
  }
  return null
}

function WebSearchSourcesPreview({
  data,
  executionTime,
}: {
  data: unknown
  executionTime?: number
}) {
  if (!data || typeof data !== 'object') {
    return <div className="text-xs text-[var(--theme-text-muted)]">No source data</div>
  }
  const d = data as Record<string, unknown>
  const results = (Array.isArray(d.results) ? d.results : []) as Array<Record<string, unknown>>

  if (results.length === 0) {
    return <div className="text-xs text-[var(--theme-text-muted)]">No results returned</div>
  }

  const getFavicon = (url: string, provided?: string) => {
    if (provided && typeof provided === 'string' && provided.trim()) return provided.trim()
    try {
      const host = new URL(String(url)).hostname
      return `https://www.google.com/s2/favicons?domain=${host}&sz=64`
    } catch {
      return ''
    }
  }

  const shown = results.slice(0, 4)
  const extra = Math.max(0, results.length - 4)

  return (
    <div className="text-sm">
      {/* Continuous icon group + time right next to it, under the Sources label.
          Icons are now clickable links to the source pages (no list below). */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center -space-x-1.5">
          {shown.map((r, idx) => {
            const url = String(r.url || '')
            const fav = getFavicon(url, r.favicon as string | undefined)
            const title = String(r.title || url)
            return (
              <WithTooltip key={idx} tooltip={title}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block hover:z-10 hover:scale-110 transition-transform"
                >
                  <img
                    src={fav}
                    alt=""
                    className="w-6 h-6 rounded-full ring-1 ring-[var(--theme-border)] bg-[var(--theme-surface-subtle)] object-cover"
                    onError={(e) => {
                      const el = e.currentTarget as HTMLImageElement
                      el.style.display = 'none'
                    }}
                  />
                </a>
              </WithTooltip>
            )
          })}
          {extra > 0 && (
            <div className="w-6 h-6 rounded-full bg-[var(--theme-surface-active)] text-xs font-medium flex items-center justify-center ring-1 ring-[var(--theme-border)] text-[var(--theme-text-secondary)]">
              +{extra}
            </div>
          )}
        </div>
        {executionTime != null && (
          <span className="text-sm text-[var(--theme-text-secondary)] font-mono tracking-tight">
            {executionTime}ms
          </span>
        )}
      </div>
    </div>
  )
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

  const skippedReason = (metadata as any)?.skippedReason
  if (toolName === 'web_search' && skippedReason === 'budget') {
    return { label: 'Budget reached', tone: 'warning' }
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
  searchQueries?: string[] // Active search queries when a parallel batch is running
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

function looksLikeStructuredThinkingLine(line: string): boolean {
  return /^(\s*[-*+]\s+|\s*\d+[.)]\s+|\s*#{1,6}\s+|\s*>\s+|\s*```|\s*\|)/.test(line)
}

function normalizeThinkingParagraphForDisplay(paragraph: string): string {
  const lines = paragraph.split('\n')
  const nonEmptyLines = lines.map((line) => line.trim()).filter(Boolean)

  if (nonEmptyLines.length < 3) {
    return paragraph
  }

  if (nonEmptyLines.some(looksLikeStructuredThinkingLine)) {
    return paragraph
  }

  const totalChars = nonEmptyLines.reduce((sum, line) => sum + line.length, 0)
  const averageLineLength = totalChars / nonEmptyLines.length
  const shortLineRatio =
    nonEmptyLines.filter((line) => line.length <= 24).length / nonEmptyLines.length

  if (averageLineLength > 28 || shortLineRatio < 0.75) {
    return paragraph
  }

  return joinTokenizedThinkingLines(nonEmptyLines)
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([([{`])\s+/g, '$1')
    .replace(/\s+([)\]}`])/g, '$1')
    .replace(/(\S)`([^`]+)`(\S)/g, '$1 `$2` $3')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*\/\s*/g, '/')
}

function joinTokenizedThinkingLines(lines: string[]): string {
  const shortWordStoplist = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'be',
    'but',
    'by',
    'can',
    'for',
    'from',
    'have',
    'if',
    'in',
    'is',
    'it',
    'its',
    "it's",
    'need',
    'not',
    'of',
    'on',
    'or',
    'the',
    'to',
    'using',
    'via',
    'we',
    'with',
    'you',
  ])

  return lines.reduce((joined, line, index) => {
    if (!joined) return line

    const previousLine = lines[index - 1] || ''
    const previousLower = previousLine.toLowerCase()
    const currentLower = line.toLowerCase()
    const shouldJoin =
      /^[.,!?;:)\]}]$/.test(line) ||
      /^[-/'’]$/.test(line) ||
      /^[-/'’]$/.test(previousLine) ||
      /^[([{`"]$/.test(previousLine) ||
      /^[)\]}]$/.test(line) ||
      (/^[A-Z]$/.test(previousLine) &&
        previousLine !== 'I' &&
        (/^[A-Z0-9]$/.test(line) || (previousLine === 'Q' && /^[a-z]+$/.test(line)))) ||
      (/^[a-z]+$/.test(previousLine) &&
        /^[a-z]+$/.test(line) &&
        (line.length <= 3 || previousLine.length <= 2) &&
        !shortWordStoplist.has(previousLower) &&
        !shortWordStoplist.has(currentLower))

    return shouldJoin ? `${joined}${line}` : `${joined} ${line}`
  }, '')
}

export function normalizeThinkingContentForDisplay(content: string): string {
  return content
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map(normalizeThinkingParagraphForDisplay)
    .join('\n\n')
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
      // Keep favicon for nice source previews (we no longer hide them)
      const { source, displayed_link, ...rest } = r
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
  const displayName = formatToolDisplayName('web_search', block.toolInput, block.toolOutput?.data)

  return (
    <div className="thinking-block thinking-inline-tool-call">
      <div
        className={`thinking-header tool-call ${hasDetails ? 'clickable' : ''}`}
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
      >
        <div className="thinking-label">
          <span className="thinking-text">
            {query ? (
              <>
                Sourced <span className="search-query">“{query}”</span>
              </>
            ) : (
              displayName
            )}
          </span>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {isExpanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: motionSpringTransition(animationsEnabled, motionSpring.settle),
              opacity: {
                duration: motionDuration(animationsEnabled, motionDurations.fast),
                ease: motionEasing.standard,
              },
            }}
            style={{ overflow: 'hidden' }}
          >
            <div className="thinking-content thinking-tool-details">
              {block.toolOutput && (
                <div className="thinking-tool-json">
                  <div className="thinking-tool-json-label">Sources</div>
                  {block.toolOutput.data && (block.toolOutput.data as any).results ? (
                    <WebSearchSourcesPreview
                      data={block.toolOutput.data}
                      executionTime={block.toolOutput.executionTime}
                    />
                  ) : (
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
                  )}
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
          {normalizeThinkingContentForDisplay(seg)}
        </span>
      )
    }
    if (i < segments.length - 1 && searchBlocksFiltered[i]) {
      nodes.push(<InlineWebSearchBlock key={`search-${i}`} block={searchBlocksFiltered[i]!} />)
    }
  }
  return <>{nodes}</>
}

// Strip ANSI color/style escape sequences so terminal output renders cleanly.
function stripAnsiEscapes(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
}

/** Codex-style terminal panel for system_shell tool output. */
function TerminalToolView({ block }: { block: ThinkingBlockType }) {
  const data = (block.toolOutput?.data ?? {}) as Record<string, unknown>
  const command =
    typeof data.command === 'string'
      ? data.command
      : typeof block.toolInput?.command === 'string'
        ? String(block.toolInput.command)
        : ''
  const cwd =
    typeof data.cwd === 'string'
      ? data.cwd
      : typeof block.toolInput?.cwd === 'string'
        ? String(block.toolInput.cwd)
        : ''
  const stdout =
    typeof data.stdout === 'string' ? stripAnsiEscapes(data.stdout).replace(/\s+$/, '') : ''
  const stderr =
    typeof data.stderr === 'string' ? stripAnsiEscapes(data.stderr).replace(/\s+$/, '') : ''
  const exitCode = typeof data.exitCode === 'number' ? data.exitCode : null
  const error = block.toolOutput?.error ? stripAnsiEscapes(block.toolOutput.error) : ''
  const isSuccess =
    Boolean(block.toolOutput?.success) && !error && (exitCode === null || exitCode === 0)
  const hasOutput = Boolean(stdout || stderr || error)
  const statusLabel = isSuccess ? '✓ Success' : exitCode != null ? `✗ Exit ${exitCode}` : '✗ Failed'

  return (
    <div className={`terminal-tool ${isSuccess ? 'is-success' : 'is-error'}`}>
      <div className="terminal-tool-bar">Shell</div>
      <div className="terminal-tool-body">
        {command && (
          <div className="terminal-tool-command">
            <span className="terminal-tool-prompt">$</span>
            <span>{command}</span>
          </div>
        )}
        {stdout && <pre className="terminal-tool-stream">{stdout}</pre>}
        {stderr && <pre className="terminal-tool-stream terminal-tool-stream-err">{stderr}</pre>}
        {error && <pre className="terminal-tool-stream terminal-tool-stream-err">{error}</pre>}
        {!hasOutput && <div className="terminal-tool-empty">No output</div>}
      </div>
      <div className="terminal-tool-status">
        {cwd && <span className="terminal-tool-cwd">{cwd}</span>}
        <span className="terminal-tool-status-badge">{statusLabel}</span>
      </div>
    </div>
  )
}

function isShellToolBlock(block: ThinkingBlockType): boolean {
  return block.type === 'tool' && block.toolName === 'system_shell'
}

function isShellBlockFailed(block: ThinkingBlockType): boolean {
  const out = block.toolOutput
  if (!out) return false
  if (out.error) return true
  const data = out.data as Record<string, unknown> | undefined
  const exitCode = typeof data?.exitCode === 'number' ? data.exitCode : null
  return out.success === false || (exitCode !== null && exitCode !== 0)
}

/** A single command inside a group: shows the command name; expands to its terminal output. */
function CommandRow({ block }: { block: ThinkingBlockType }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { animationsEnabled } = useMotionPreferences()
  const failed = isShellBlockFailed(block)
  const data = block.toolOutput?.data as Record<string, unknown> | undefined
  const command =
    typeof data?.command === 'string'
      ? data.command
      : typeof block.toolInput?.command === 'string'
        ? String(block.toolInput.command)
        : 'command'

  return (
    <div className="thinking-command-row">
      <div
        className="thinking-command-row__head clickable"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <WithTooltip tooltip={failed ? 'Failed' : 'Success'}>
          <span
            className={`thinking-cmd-blob thinking-cmd-blob--${failed ? 'error' : 'success'}`}
            aria-label={failed ? 'Failed' : 'Success'}
          />
        </WithTooltip>
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={motionSpringTransition(animationsEnabled, motionSpring.bouncy)}
        >
          <ChevronRight size={13} className="thinking-chevron" />
        </motion.div>
        <WithTooltip tooltip={command}>
          <span className="thinking-command-row__name">{command}</span>
        </WithTooltip>
      </div>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: motionSpringTransition(animationsEnabled, motionSpring.settle),
              opacity: {
                duration: motionDuration(animationsEnabled, motionDurations.fast),
                ease: motionEasing.standard,
              },
            }}
            style={{ overflow: 'hidden' }}
          >
            <div className="thinking-command-row__body">
              <TerminalToolView block={block} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Codex-style grouped "Ran N commands" entry for one or more system_shell calls. */
function CommandGroupBlock({
  blocks,
  defaultExpanded,
}: {
  blocks: ThinkingBlockType[]
  defaultExpanded?: boolean
}) {
  const shouldExpand = defaultExpanded ?? false
  const [isExpanded, setIsExpanded] = useState(shouldExpand)
  const { animationsEnabled } = useMotionPreferences()
  const groupKey = blocks.map((b) => b.timestamp).join(',')

  useEffect(() => {
    setIsExpanded(shouldExpand)
  }, [groupKey, shouldExpand])

  const count = blocks.length
  const failed = blocks.some(isShellBlockFailed)
  const label = count <= 1 ? 'Ran a command' : `Ran ${count} commands`

  return (
    <div className="thinking-block completed thinking-tool-call thinking-command-group">
      <div
        className="thinking-header completed tool-call clickable"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <div className="thinking-label">
          <WithTooltip tooltip={failed ? 'Failed' : 'Success'}>
            <span
              className={`thinking-cmd-blob thinking-cmd-blob--${failed ? 'error' : 'success'}`}
              aria-label={failed ? 'Failed' : 'Success'}
            />
          </WithTooltip>
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={motionSpringTransition(animationsEnabled, motionSpring.bouncy)}
          >
            <ChevronRight size={14} className="thinking-chevron" />
          </motion.div>
          <span className="thinking-text thinking-cmd-text">{label}</span>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: motionSpringTransition(animationsEnabled, motionSpring.settle),
              opacity: {
                duration: motionDuration(animationsEnabled, motionDurations.fast),
                ease: motionEasing.standard,
              },
            }}
            style={{ overflow: 'hidden' }}
          >
            <div className="thinking-content thinking-tool-details thinking-command-group-body">
              {count <= 1 ? (
                <TerminalToolView block={blocks[0]!} />
              ) : (
                blocks.map((block, index) => (
                  <CommandRow key={`${block.timestamp}-${index}`} block={block} />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
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
    const status = getCompletedToolStatus(block)
    const auditLine = formatToolAuditLine(block)

    return (
      <div className="thinking-block completed thinking-tool-call">
        <div
          className={`thinking-header completed tool-call ${hasDetails ? 'clickable' : ''}`}
          onClick={() => hasDetails && setIsExpanded(!isExpanded)}
        >
          <div className="thinking-label">
            {toolName === 'web_search' ? (
              <span className="thinking-tool-calling-icon search-icon">
                <Search size={14} />
              </span>
            ) : (
              <span className="thinking-tool-calling-icon default-icon">
                <Box size={14} />
              </span>
            )}
            <span className="thinking-text">{getCompletedToolBlockText(block)}</span>
            {status && (
              <span className={`thinking-tool-status thinking-tool-status-${status.tone}`}>
                {status.label}
              </span>
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
                height: motionSpringTransition(animationsEnabled, motionSpring.settle),
                opacity: {
                  duration: motionDuration(animationsEnabled, motionDurations.fast),
                  ease: motionEasing.standard,
                },
              }}
              style={{ overflow: 'hidden' }}
            >
              <div className="thinking-content thinking-tool-details">
                {block.toolInput &&
                  Object.keys(block.toolInput).length > 0 &&
                  toolName !== 'web_search' && (
                    <div className="thinking-tool-json">
                      <div className="thinking-tool-json-label">Input</div>
                      <pre>{JSON.stringify(block.toolInput, null, 2)}</pre>
                    </div>
                  )}
                {block.toolOutput && (
                  <div className="thinking-tool-json">
                    <div className="thinking-tool-json-label">
                      {toolName === 'web_search' ? 'Sources' : 'Output'}
                    </div>
                    {toolName === 'web_search' &&
                    block.toolOutput.data &&
                    !block.toolOutput.error ? (
                      <WebSearchSourcesPreview
                        data={block.toolOutput.data}
                        executionTime={block.toolOutput.executionTime}
                      />
                    ) : (
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
                    )}
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
    <div className="thinking-block completed">
      <div className="thinking-header completed" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="thinking-label">
          <span className="thinking-tool-calling-icon brain-icon">
            <BrainCircuit size={14} />
          </span>
          <span className="thinking-text">
            Thought for {block.duration ? formatDuration(block.duration) : 'a moment'}
          </span>
          {hasContent && (
            <motion.div
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={motionSpringTransition(animationsEnabled, motionSpring.bouncy)}
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
              height: motionSpringTransition(animationsEnabled, motionSpring.settle),
              opacity: {
                duration: motionDuration(animationsEnabled, motionDurations.fast),
                ease: motionEasing.standard,
              },
            }}
            style={{ overflow: 'hidden' }}
          >
            <div className="thinking-content">
              {normalizeThinkingContentForDisplay(block.content || '')}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CompletedBlocksList({ blocks }: { blocks: ThinkingBlockType[] }) {
  type RenderItem =
    | { kind: 'single'; block: ThinkingBlockType; index: number }
    | { kind: 'shell'; blocks: ThinkingBlockType[]; index: number }

  const items: RenderItem[] = []
  blocks.forEach((block, index) => {
    if (isShellToolBlock(block)) {
      const last = items[items.length - 1]
      if (last && last.kind === 'shell') {
        last.blocks.push(block)
        return
      }
      items.push({ kind: 'shell', blocks: [block], index })
      return
    }
    items.push({ kind: 'single', block, index })
  })

  return (
    <>
      {items.map((item) =>
        item.kind === 'shell' ? (
          <CommandGroupBlock
            key={`cmd-group-${item.index}-${item.blocks[0]?.timestamp}`}
            blocks={item.blocks}
            defaultExpanded={false}
          />
        ) : (
          <CompletedBlock
            key={`completed-${item.index}-${item.block.timestamp}`}
            block={item.block}
            defaultExpanded={false}
          />
        )
      )}
    </>
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
  searchQueries,
  activeToolCalls = [],
  completedBlocks = [],
}: ThinkingBlockProps) {
  const visibleCompletedBlocks = completedBlocks.filter((block) => {
    if (block.type !== 'tool') return true
    return !shouldSuppressNoisyToolUi(block.toolName)
  })
  const hasActiveToolCalls = activeToolCalls && activeToolCalls.length > 0
  const extraActiveToolCalls = hasActiveToolCalls ? activeToolCalls.slice(1) : []
  const { animationsEnabled } = useMotionPreferences()
  const [isExpanded, setIsExpanded] = useState(isThinking || isSearching || hasActiveToolCalls)
  const [isSearchBatchExpanded, setIsSearchBatchExpanded] = useState(true)

  useEffect(() => {
    setIsExpanded(isThinking || isSearching || hasActiveToolCalls)
    setIsSearchBatchExpanded(true)
  }, [messageId, activeBlockKey])

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
    visibleCompletedBlocks.length === 0
  )
    return null

  const hasThinkingContent = thinking && thinking.trim().length > 0
  const showActiveBlock = hasThinkingContent || isThinking || isSearching || hasActiveToolCalls

  const activeThinkingSeconds =
    thinkingDuration !== undefined ? Math.max(0, thinkingDuration / 1000) : null

  // When thinking contains --- and we have search blocks, show them inline (don't duplicate above)
  const searchBlocks = visibleCompletedBlocks.filter((b) => b.type === 'searching')
  const hasCompletedThinkingBlocks = visibleCompletedBlocks.some((block) => block.type === 'thinking')
  const hasLegacyInlineThinkingWithToolCalls =
    hasThinkingContent &&
    !hasCompletedThinkingBlocks &&
    /\n\s*---\s*\n?/.test(thinking) &&
    searchBlocks.length > 0
  const blocksToRender = hasLegacyInlineThinkingWithToolCalls
    ? visibleCompletedBlocks.filter((b) => b.type !== 'searching')
    : visibleCompletedBlocks
  const activeSearchQueries =
    searchQueries && searchQueries.length > 0
      ? searchQueries.filter(Boolean)
      : searchQuery
        ? [searchQuery]
        : []
  const primarySearchQuery = activeSearchQueries[0]
  const searchingMode = inferWebToolModeFromArgs(
    primarySearchQuery ? { query: primarySearchQuery } : undefined
  )
  const activeSearchToolCalls = hasActiveToolCalls
    ? activeToolCalls.filter((toolCall) => toolCall.name === 'web_search')
    : []
  const isActiveSearchBatch =
    hasActiveToolCalls &&
    activeSearchToolCalls.length > 0 &&
    activeSearchToolCalls.length === activeToolCalls.length
  const hasActiveSearches = activeSearchToolCalls.length > 0
  const activeSearchBatchQueries = isActiveSearchBatch
    ? activeSearchToolCalls
        .map((toolCall) => String(toolCall.arguments?.query || '').trim())
        .filter(Boolean)
    : []
  const visibleSearchQueries =
    isActiveSearchBatch && activeSearchBatchQueries.length > 0
      ? activeSearchBatchQueries
      : activeSearchQueries
  const hasVisibleSearchQueryList = visibleSearchQueries.length > 0
  const isSearchBatch = visibleSearchQueries.length > 1
  const primaryVisibleSearchQuery = visibleSearchQueries[0]
  const isExtract = searchingMode === 'extract'
  const sourcingHeaderText = isExtract ? 'Extracting from web' : 'Sourcing the web'
  const searchingText = isSearchBatch
    ? sourcingHeaderText
    : primaryVisibleSearchQuery
      ? `Sourcing “${primaryVisibleSearchQuery}”`
      : sourcingHeaderText
  const showSearchQueryDetail = (isSearching || isActiveSearchBatch) && hasVisibleSearchQueryList
  const showSearchBatchDetails =
    (isSearching || isActiveSearchBatch) && isSearchBatch && hasVisibleSearchQueryList
  const isSourcingBatch =
    (isSearching || isActiveSearchBatch) && isSearchBatch && hasVisibleSearchQueryList
  const showSourcingHeader = !isSourcingBatch
  const handleHeaderClick = () => {
    if (showSearchBatchDetails) {
      setIsSearchBatchExpanded((expanded) => !expanded)
      return
    }
    handleToggle()
  }

  return (
    <div className="thinking-blocks-container">
      {/* Render completed blocks first - exclude search when shown inline in thinking.
          Consecutive system_shell calls are grouped into one "Ran N commands" entry. */}
      {blocksToRender.length > 0 && <CompletedBlocksList blocks={blocksToRender} />}

      {showActiveBlock && (
        <div className="thinking-block">
          {showSourcingHeader && (
            <div
              className={`thinking-header ${hasActiveToolCalls ? (hasActiveSearches ? (isSearchBatch ? 'searching' : 'searching search-sourcing') : 'tool-calling') : isSearching && showSourcingHeader ? 'searching' : ''} ${showSearchBatchDetails ? 'search-batch' : ''}`}
              onClick={handleHeaderClick}
            >
              <div className="thinking-label">
                {hasActiveToolCalls ? (
                  <span
                    key={`tool-calling-row:${getToolCallsAnimationKey(activeToolCalls)}`}
                    className="thinking-text thinking-tool-calling"
                  >
                    <span
                      className={`thinking-tool-calling-icon ${hasActiveSearches ? 'search-icon' : 'default-icon'}`}
                    >
                      {hasActiveSearches ? (
                        <Search size={14} />
                      ) : activeToolCalls[0]?.name === 'system_shell' ? (
                        <span className="thinking-cmd-blob thinking-cmd-blob--running" />
                      ) : (
                        <Box size={14} />
                      )}
                    </span>
                    <AITextLoading
                      text={
                        activeToolCalls[0]?.name === 'system_shell'
                          ? (() => {
                              const shellCount = activeToolCalls.filter(
                                (toolCall) => toolCall.name === 'system_shell'
                              ).length
                              return shellCount <= 1
                                ? 'Running a command…'
                                : `Running ${shellCount} commands…`
                            })()
                          : hasActiveSearches
                            ? searchingText
                            : getToolCallHeaderText(activeToolCalls)
                      }
                      animationKey={`tool-calling:${getToolCallsAnimationKey(activeToolCalls)}`}
                    />
                  </span>
                ) : isSearching && showSourcingHeader ? (
                  <span className="thinking-text thinking-tool-calling">
                    <span className="thinking-tool-calling-icon search-icon">
                      <Search size={14} />
                    </span>
                    <AITextLoading text={searchingText} animationKey="searching" />
                  </span>
                ) : isThinking ? (
                  <span className="thinking-text thinking-thinking">
                    <span className="thinking-tool-calling-icon brain-icon">
                      <BrainCircuit size={14} strokeWidth={2} />
                    </span>
                    {activeThinkingSeconds === null ? (
                      <AITextLoading text="Thinking..." animationKey="thinking" />
                    ) : (
                      <AITextLoading
                        text={`Thinking for ${activeThinkingSeconds.toFixed(1)} seconds`}
                        animationKey="thinking"
                      />
                    )}
                  </span>
                ) : (
                  <>
                    <span className="thinking-tool-calling-icon brain-icon">
                      <BrainCircuit size={14} strokeWidth={2} />
                    </span>
                    <span className="thinking-text">
                      <AITextLoading
                        text={
                          activeThinkingSeconds === null
                            ? 'Thought for a moment'
                            : `Thought for ${activeThinkingSeconds.toFixed(1)} seconds`
                        }
                        animationKey="completed"
                      />
                    </span>
                    <motion.div
                      animate={{ rotate: isExpanded ? 90 : 0 }}
                      transition={motionSpringTransition(animationsEnabled, motionSpring.bouncy)}
                    >
                      <ChevronRight size={14} className="thinking-chevron" />
                    </motion.div>
                  </>
                )}
                {showSearchBatchDetails && showSourcingHeader && (
                  <motion.div
                    animate={{ rotate: isSearchBatchExpanded ? 90 : 0 }}
                    transition={motionSpringTransition(animationsEnabled, motionSpring.bouncy)}
                  >
                    <ChevronRight size={14} className="thinking-chevron" />
                  </motion.div>
                )}
              </div>
            </div>
          )}
          <AnimatePresence initial={false}>
            {isExpanded && hasThinkingContent && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  height: motionSpringTransition(animationsEnabled, motionSpring.settle),
                  opacity: {
                    duration: motionDuration(animationsEnabled, motionDurations.fast),
                    ease: motionEasing.standard,
                  },
                }}
                style={{ overflow: 'hidden' }}
              >
                <div className="thinking-content">
                  {hasLegacyInlineThinkingWithToolCalls
                    ? renderThinkingWithToolCalls(thinking, visibleCompletedBlocks)
                    : normalizeThinkingContentForDisplay(thinking)}
                </div>
              </motion.div>
            )}
            {isExpanded && !isActiveSearchBatch && extraActiveToolCalls.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  height: motionSpringTransition(animationsEnabled, motionSpring.settle),
                  opacity: {
                    duration: motionDuration(animationsEnabled, motionDurations.fast),
                    ease: motionEasing.standard,
                  },
                }}
                style={{ overflow: 'hidden' }}
              >
                <div className="thinking-content thinking-active-tool-list">
                  {isActiveSearchBatch
                    ? activeSearchBatchQueries.map((query, index) => (
                        <div key={`${query}-${index}`} className="thinking-active-tool-item">
                          {getActiveSearchItemText(query)}
                        </div>
                      ))
                    : extraActiveToolCalls.map((toolCall, index) => (
                        <div
                          key={`${toolCall.name}-${index}`}
                          className="thinking-active-tool-item"
                        >
                          {index + 2}. {getToolCallText(toolCall)}
                        </div>
                      ))}
                </div>
              </motion.div>
            )}
            {isExpanded && showSearchQueryDetail && visibleSearchQueries.length > 1 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  height: motionSpringTransition(animationsEnabled, motionSpring.settle),
                  opacity: {
                    duration: motionDuration(animationsEnabled, motionDurations.fast),
                    ease: motionEasing.standard,
                  },
                }}
                style={{ overflow: 'hidden' }}
              >
                <div className="thinking-active-search-batch">
                  {visibleSearchQueries.map((query, index) => (
                    <div key={`${query}-${index}`} className="thinking-active-tool-item">
                      {getActiveSearchItemText(query)}
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
