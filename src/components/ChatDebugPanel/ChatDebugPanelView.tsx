import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/shared'
import { writeTextToClipboard } from '@/utils/clipboard'
import {
  CHAT_DIAGNOSTICS_BUFFER_LIMIT,
  useChatDiagnosticsStream,
} from '@/diagnostics/useChatDiagnosticsStream'
import type {
  ChatDiagnosticEvent,
  ChatDiagnosticPhase,
} from '@/diagnostics/chatDiagnostics'

import {
  CHAT_DEBUG_CATEGORIES,
  ChatDebugCategorized,
  type ChatDebugCategoryId,
} from './ChatDebugCategorized'

import './ChatDebugPanel.css'

type ViewMode = 'timeline' | 'categories'

const VIEW_MODE_STORAGE_KEY = 'zura.chatDebugPanel.view'
const CATEGORY_STORAGE_KEY = 'zura.chatDebugPanel.category'

function readStoredViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'timeline'
  const value = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
  return value === 'categories' ? 'categories' : 'timeline'
}

function readStoredCategory(): ChatDebugCategoryId {
  if (typeof window === 'undefined') return 'request'
  const value = window.localStorage.getItem(CATEGORY_STORAGE_KEY)
  const found = CHAT_DEBUG_CATEGORIES.find((category) => category.id === value)
  return found?.id ?? 'request'
}

interface ChatDebugPanelViewProps {
  sessionId: string
}

const ALL_PHASES: ChatDiagnosticPhase[] = [
  'request-start',
  'request-shape',
  'context-optimized',
  'round-start',
  'round-finish',
  'usage',
  'tool-start',
  'tool-complete',
  'stream-chunk',
  'research-state',
  'memory-extraction-start',
  'memory-extraction-result',
  'memory-extraction-error',
  'provider-error',
  'finish',
]

const PHASE_TONE: Record<ChatDiagnosticPhase, string> = {
  'request-start': 'phase--neutral',
  'request-shape': 'phase--neutral',
  'context-optimized': 'phase--neutral',
  'round-start': 'phase--info',
  'round-finish': 'phase--info',
  'usage': 'phase--success',
  'tool-start': 'phase--info',
  'tool-complete': 'phase--info',
  'stream-chunk': 'phase--muted',
  'research-state': 'phase--info',
  'memory-extraction-start': 'phase--neutral',
  'memory-extraction-result': 'phase--success',
  'memory-extraction-error': 'phase--error',
  'provider-error': 'phase--error',
  'finish': 'phase--success',
}

// The three memory-extraction phases are the background "dreaming" pipeline.
// They're grouped under a single "dreaming" filter chip instead of three chips.
const DREAMING_PHASES: ChatDiagnosticPhase[] = [
  'memory-extraction-start',
  'memory-extraction-result',
  'memory-extraction-error',
]

interface PhaseChip {
  id: string
  label: string
  phases: ChatDiagnosticPhase[]
}

// Chip descriptors: one chip per phase, except the dreaming phases which collapse
// into a single grouped chip (rendered in place of the first memory phase).
const PHASE_CHIPS: PhaseChip[] = (() => {
  const chips: PhaseChip[] = []
  let dreamingAdded = false
  for (const phase of ALL_PHASES) {
    if (DREAMING_PHASES.includes(phase)) {
      if (!dreamingAdded) {
        chips.push({ id: 'dreaming', label: 'dreaming', phases: DREAMING_PHASES })
        dreamingAdded = true
      }
      continue
    }
    chips.push({ id: phase, label: phase, phases: [phase] })
  }
  return chips
})()

function isFailedToolComplete(event: ChatDiagnosticEvent): boolean {
  return event.phase === 'tool-complete' && event.tool?.success === false
}

function summarizeEvent(event: ChatDiagnosticEvent): string {
  switch (event.phase) {
    case 'request-start':
      return `${event.provider ?? 'unknown'} · ${event.model ?? 'no-model'} · ${event.messageCount ?? 0} msgs`
    case 'round-start':
      return `round ${event.round ?? '?'} (${event.roundType ?? 'plain'}) · ${event.messageCount ?? 0} msgs`
    case 'round-finish':
      return `round ${event.round ?? '?'} finish=${event.finishReason ?? 'unknown'}`
    case 'usage': {
      const usage = event.usage
      if (!usage) return 'usage'
      return `in=${usage.inputTokens ?? '?'} out=${usage.outputTokens ?? '?'} total=${usage.totalTokens ?? '?'}`
    }
    case 'tool-start':
      return `tool: ${event.tool?.name ?? 'unknown'}`
    case 'tool-complete': {
      const ok = event.tool?.success ? 'ok' : 'fail'
      const ms = event.tool?.executionTime != null ? `${Math.round(event.tool.executionTime)}ms` : '—'
      return `tool: ${event.tool?.name ?? 'unknown'} (${ok}) ${ms}`
    }
    case 'stream-chunk': {
      const chunk = event.streamChunk
      if (!chunk) return 'stream-chunk'
      const parts = [`+${chunk.cumulativeTextLength}b`]
      if (chunk.toolCallDeltaCount) parts.push(`+${chunk.toolCallDeltaCount} tool deltas`)
      return `chunk ${chunk.chunkIndex} ${parts.join(' · ')}`
    }
    case 'provider-error':
      return event.error ? `error: ${event.error.slice(0, 120)}` : 'error'
    case 'research-state': {
      const parts = [event.researchState ?? 'research']
      if (event.searchBudgetRemaining != null) parts.push(`${event.searchBudgetRemaining} search left`)
      if (event.recoveredQueryCount != null) parts.push(`${event.recoveredQueryCount} recovered`)
      if (event.skippedReason) parts.push(`skipped=${event.skippedReason}`)
      if (event.deterministicAnswerUsed) parts.push('deterministic')
      return parts.join(' | ')
    }
    case 'finish':
      return `finish=${event.finishReason ?? 'unknown'}`
    case 'memory-extraction-start':
      return `dreaming · ${event.model ?? 'no-model'} · ${event.messageCount ?? 0} msgs`
    case 'memory-extraction-result': {
      const facts = `${event.factCount ?? 0} fact${event.factCount === 1 ? '' : 's'}`
      const summary = event.summaryKept ? 'summary kept' : 'summary empty'
      return `${facts} · ${summary}`
    }
    case 'memory-extraction-error':
      return event.error
        ? `memory error${event.memoryErrorCode ? ` [${event.memoryErrorCode}]` : ''}: ${event.error.slice(0, 120)}`
        : 'memory error'
    case 'context-optimized': {
      const ctx = event.context
      if (!ctx) return 'context-optimized'
      return `${ctx.originalMessageCount}→${ctx.finalMessageCount} msgs · ${ctx.finalTokens}/${ctx.maxTokens} tok`
    }
    case 'request-shape':
      return `roles=${event.requestShape?.roleOrder.join(',') ?? '?'} tools=${event.requestShape?.toolCount ?? 0}`
    default:
      return event.phase
  }
}

function formatTimestamp(timestamp: number | undefined): string {
  if (!timestamp) return '—'
  const date = new Date(timestamp)
  return date.toLocaleTimeString(undefined, { hour12: false }) + '.' + String(date.getMilliseconds()).padStart(3, '0')
}

interface TimelineRowProps {
  event: ChatDiagnosticEvent
  expanded: boolean
  onToggle: () => void
}

function TimelineRow({ event, expanded, onToggle }: TimelineRowProps) {
  const failed = isFailedToolComplete(event)
  const tone = failed ? 'phase--error' : PHASE_TONE[event.phase] ?? 'phase--muted'

  return (
    <div className={`chat-debug-row ${expanded ? 'chat-debug-row--expanded' : ''}`}>
      <button type="button" className="chat-debug-row__head" onClick={onToggle}>
        <span className="chat-debug-row__time" title={String(event.timestamp ?? '')}>
          {formatTimestamp(event.timestamp)}
        </span>
        <Badge className={`chat-debug-row__phase ${tone}`} variant="outline">
          {event.phase}
        </Badge>
        <span className="chat-debug-row__summary">{summarizeEvent(event)}</span>
      </button>
      {expanded && (
        <pre className="chat-debug-row__json">{JSON.stringify(event, null, 2)}</pre>
      )}
    </div>
  )
}

/**
 * Standalone in-window chat debug panel.
 *
 * Designed to fill its host {@link BrowserWindow} (the dev-only `#/chat-debug`
 * window) — there's no modal/dialog wrapping. Renders nothing in production
 * builds so the panel can never be reached if the window is somehow opened.
 */
export function ChatDebugPanelView({ sessionId }: ChatDebugPanelViewProps) {
  if (!import.meta.env.DEV) return null

  const { events, clear, isAvailable } = useChatDiagnosticsStream(sessionId)
  const { showToast } = useToast()

  const [searchTerm, setSearchTerm] = useState('')
  const [activePhases, setActivePhases] = useState<Set<ChatDiagnosticPhase>>(
    () => new Set(ALL_PHASES.filter((p) => p !== 'stream-chunk'))
  )
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [autoScroll, setAutoScroll] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>(() => readStoredViewMode())
  const [activeCategory, setActiveCategory] = useState<ChatDebugCategoryId>(() => readStoredCategory())

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(CATEGORY_STORAGE_KEY, activeCategory)
  }, [activeCategory])

  const virtuosoRef = useRef<VirtuosoHandle>(null)

  // Toggle a chip that may map to one or more phases (e.g. the grouped
  // "dreaming" chip). On when every mapped phase is active; click flips all.
  const toggleChip = useCallback((phases: ChatDiagnosticPhase[]) => {
    setActivePhases((current) => {
      const next = new Set(current)
      const allOn = phases.every((phase) => next.has(phase))
      for (const phase of phases) {
        if (allOn) {
          next.delete(phase)
        } else {
          next.add(phase)
        }
      }
      return next
    })
  }, [])

  const toggleAllPhases = useCallback(() => {
    setActivePhases((current) =>
      current.size === ALL_PHASES.length ? new Set<ChatDiagnosticPhase>() : new Set(ALL_PHASES)
    )
  }, [])

  const filteredEvents = useMemo(() => {
    const lowered = searchTerm.trim().toLowerCase()
    return events.filter((event) => {
      if (!activePhases.has(event.phase)) return false
      if (!lowered) return true
      return JSON.stringify(event).toLowerCase().includes(lowered)
    })
  }, [events, activePhases, searchTerm])

  const handleCopySession = useCallback(async () => {
    const ok = await writeTextToClipboard(sessionId)
    showToast(ok ? 'Session id copied' : 'Could not copy session id', ok ? 'success' : 'error')
  }, [sessionId, showToast])

  const toggleRow = useCallback((key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  // Auto-scroll to bottom when new events come in, unless the user has paused.
  useEffect(() => {
    if (!autoScroll) return
    if (filteredEvents.length === 0) return
    virtuosoRef.current?.scrollToIndex({
      index: filteredEvents.length - 1,
      align: 'end',
      behavior: 'auto',
    })
  }, [autoScroll, filteredEvents.length])

  const handleScrollPause = useCallback((atBottom: boolean) => {
    setAutoScroll(atBottom)
  }, [])

  return (
    <div className="chat-debug-page">
      <header className="chat-debug-page__header">
        <div>
          <h1 className="chat-debug-panel__title">Chat Debug Logs</h1>
          <p className="chat-debug-page__subtitle">
            Live diagnostic events for this chat session. Dev-only; capped at {CHAT_DIAGNOSTICS_BUFFER_LIMIT} events
            in memory and 500 events per session on disk. Secrets (API keys, tokens, base64 images) are redacted.
          </p>
        </div>
      </header>

      <div className="chat-debug-panel__metabar">
        <div className="chat-debug-panel__session" title={sessionId}>
          <span className="chat-debug-panel__session-label">session</span>
          <code className="chat-debug-panel__session-id">{sessionId.slice(0, 12)}…</code>
          <Button size="sm" variant="ghost" onClick={handleCopySession}>
            Copy
          </Button>
        </div>
        <div className="chat-debug-panel__counts">
          {filteredEvents.length} / {events.length} events
        </div>
        <div className="chat-debug-panel__actions">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewMode((mode) => (mode === 'timeline' ? 'categories' : 'timeline'))}
          >
            {viewMode === 'timeline' ? 'Categories' : 'Timeline'}
          </Button>
          <Button size="sm" variant="ghost" onClick={clear} disabled={events.length === 0}>
            Clear view
          </Button>
        </div>
      </div>

      {viewMode === 'timeline' && (
        <div className="chat-debug-panel__filters">
          <Input
            placeholder="Search events…"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <div className="chat-debug-panel__chips">
            <button
              type="button"
              className="chat-debug-panel__chip-toggle"
              onClick={toggleAllPhases}
            >
              {activePhases.size === ALL_PHASES.length ? 'Clear all' : 'Select all'}
            </button>
            {PHASE_CHIPS.map((chip) => {
              const enabled = chip.phases.every((phase) => activePhases.has(phase))
              return (
                <button
                  key={chip.id}
                  type="button"
                  className={`chat-debug-panel__chip ${enabled ? 'chat-debug-panel__chip--on' : ''}`}
                  onClick={() => toggleChip(chip.phases)}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {viewMode === 'categories' && (
        <div className="chat-debug-panel__tabs">
          {CHAT_DEBUG_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`chat-debug-panel__tab ${
                activeCategory === category.id ? 'chat-debug-panel__tab--active' : ''
              }`}
              onClick={() => setActiveCategory(category.id)}
            >
              {category.label}
            </button>
          ))}
        </div>
      )}

      <div className="chat-debug-panel__body chat-debug-panel__body--page">
        {!isAvailable ? (
          <div className="chat-debug-panel__empty">
            Chat diagnostics bridge is not available in this environment.
          </div>
        ) : viewMode === 'categories' ? (
          <ChatDebugCategorized events={events} category={activeCategory} />
        ) : filteredEvents.length === 0 ? (
          <div className="chat-debug-panel__empty">
            {events.length === 0
              ? 'No events yet. Send a message to start streaming diagnostics.'
              : 'No events match the current filters.'}
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={filteredEvents}
            atBottomStateChange={handleScrollPause}
            followOutput={autoScroll ? 'smooth' : false}
            itemContent={(_index, event) => {
              const key = `${event.timestamp}-${event.phase}-${event.messageId}`
              const expanded = expandedKeys.has(key)
              return (
                <TimelineRow
                  event={event}
                  expanded={expanded}
                  onToggle={() => toggleRow(key)}
                />
              )
            }}
          />
        )}
      </div>
    </div>
  )
}
