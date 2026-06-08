import { useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import type {
  ChatDiagnosticEvent,
  ChatDiagnosticPhase,
} from '@/diagnostics/chatDiagnostics'

export type ChatDebugCategoryId = 'request' | 'tools' | 'streaming' | 'usage' | 'memory' | 'errors'

export const CHAT_DEBUG_CATEGORIES: ReadonlyArray<{
  id: ChatDebugCategoryId
  label: string
}> = [
  { id: 'request', label: 'Request' },
  { id: 'tools', label: 'Tool Calls' },
  { id: 'streaming', label: 'Streaming' },
  { id: 'usage', label: 'Usage' },
  { id: 'memory', label: 'Memory' },
  { id: 'errors', label: 'Errors' },
] as const

const REQUEST_PHASES = new Set<ChatDiagnosticPhase>([
  'request-start',
  'request-shape',
  'context-optimized',
  'round-start',
  'round-finish',
])

const STREAMING_PHASES = new Set<ChatDiagnosticPhase>(['stream-chunk'])
const USAGE_PHASES = new Set<ChatDiagnosticPhase>(['usage', 'finish'])
const TOOL_PHASES = new Set<ChatDiagnosticPhase>(['tool-start', 'tool-complete'])
const MEMORY_PHASES = new Set<ChatDiagnosticPhase>([
  'memory-extraction-start',
  'memory-extraction-result',
  'memory-extraction-error',
])

function partitionEvents(events: ChatDiagnosticEvent[]) {
  const byCategory: Record<ChatDebugCategoryId, ChatDiagnosticEvent[]> = {
    request: [],
    tools: [],
    streaming: [],
    usage: [],
    memory: [],
    errors: [],
  }

  for (const event of events) {
    if (REQUEST_PHASES.has(event.phase)) byCategory.request.push(event)
    if (TOOL_PHASES.has(event.phase)) byCategory.tools.push(event)
    if (STREAMING_PHASES.has(event.phase)) byCategory.streaming.push(event)
    if (USAGE_PHASES.has(event.phase)) byCategory.usage.push(event)
    if (MEMORY_PHASES.has(event.phase)) byCategory.memory.push(event)
    if (
      event.phase === 'provider-error' ||
      event.phase === 'memory-extraction-error' ||
      (event.phase === 'tool-complete' && event.tool?.success === false)
    ) {
      byCategory.errors.push(event)
    }
  }
  return byCategory
}

interface ToolPair {
  id: string | undefined
  name: string
  start?: ChatDiagnosticEvent
  complete?: ChatDiagnosticEvent
}

function pairToolEvents(events: ChatDiagnosticEvent[]): ToolPair[] {
  const byId = new Map<string, ToolPair>()
  const orphans: ToolPair[] = []
  for (const event of events) {
    const tool = event.tool
    if (!tool) continue
    const id = tool.id
    if (!id) {
      orphans.push({ id: undefined, name: tool.name, [event.phase === 'tool-start' ? 'start' : 'complete']: event } as ToolPair)
      continue
    }
    let pair = byId.get(id)
    if (!pair) {
      pair = { id, name: tool.name }
      byId.set(id, pair)
    }
    if (event.phase === 'tool-start') pair.start = event
    if (event.phase === 'tool-complete') pair.complete = event
  }
  return [...byId.values(), ...orphans]
}

function renderUsageRow(event: ChatDiagnosticEvent) {
  const usage = event.usage
  if (!usage) return null
  return (
    <div className="chat-debug-cat__row">
      <span className="chat-debug-cat__row-tag">round {event.round ?? '?'}</span>
      <span className="chat-debug-cat__row-meta">{event.roundType ?? ''}</span>
      <span className="chat-debug-cat__row-stat">in: {usage.inputTokens ?? '—'}</span>
      <span className="chat-debug-cat__row-stat">out: {usage.outputTokens ?? '—'}</span>
      <span className="chat-debug-cat__row-stat">total: {usage.totalTokens ?? '—'}</span>
    </div>
  )
}

interface ChatDebugCategorizedProps {
  events: ChatDiagnosticEvent[]
  category: ChatDebugCategoryId
}

export function ChatDebugCategorized({ events, category }: ChatDebugCategorizedProps) {
  const partitioned = useMemo(() => partitionEvents(events), [events])
  const slice = partitioned[category]

  if (slice.length === 0) {
    return (
      <div className="chat-debug-panel__empty chat-debug-cat__empty">
        No {category === 'errors' ? 'errors' : `${category} events`} captured for this session yet.
      </div>
    )
  }

  if (category === 'tools') {
    const pairs = pairToolEvents(slice)
    return (
      <div className="chat-debug-cat">
        {pairs.map((pair, index) => {
          const failed = pair.complete?.tool?.success === false
          const ms = pair.complete?.tool?.executionTime
          return (
            <div
              key={`${pair.id ?? 'orphan'}-${index}`}
              className={`chat-debug-cat__row chat-debug-cat__row--card ${failed ? 'chat-debug-cat__row--error' : ''}`}
            >
              <Badge variant="outline">{pair.name}</Badge>
              <span className="chat-debug-cat__row-meta">{pair.id ?? '(no id)'}</span>
              <span className="chat-debug-cat__row-stat">
                {pair.complete ? (failed ? 'failed' : 'ok') : 'in flight'}
              </span>
              {typeof ms === 'number' && (
                <span className="chat-debug-cat__row-stat">{Math.round(ms)}ms</span>
              )}
              {pair.complete?.tool?.error && (
                <span className="chat-debug-cat__row-error-msg">{pair.complete.tool.error}</span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  if (category === 'streaming') {
    let totalChunks = 0
    let totalToolDeltas = 0
    let lastCumulativeLength = 0
    for (const event of slice) {
      const chunk = event.streamChunk
      if (!chunk) continue
      totalChunks += 1
      totalToolDeltas += chunk.toolCallDeltaCount ?? 0
      lastCumulativeLength = Math.max(lastCumulativeLength, chunk.cumulativeTextLength)
    }
    return (
      <div className="chat-debug-cat">
        <div className="chat-debug-cat__row chat-debug-cat__row--card chat-debug-cat__row--summary">
          <span className="chat-debug-cat__row-stat">{totalChunks} chunks</span>
          <span className="chat-debug-cat__row-stat">{lastCumulativeLength} chars</span>
          <span className="chat-debug-cat__row-stat">{totalToolDeltas} tool deltas</span>
        </div>
        {slice.slice(-10).map((event) => (
          <div
            key={`${event.timestamp}-${event.streamChunk?.chunkIndex ?? 0}`}
            className="chat-debug-cat__row"
          >
            <span className="chat-debug-cat__row-tag">#{event.streamChunk?.chunkIndex}</span>
            <span className="chat-debug-cat__row-meta">
              {event.streamChunk?.cumulativeTextLength ?? 0} chars cumulative
            </span>
            {event.streamChunk?.toolCallDeltaCount ? (
              <span className="chat-debug-cat__row-stat">+{event.streamChunk.toolCallDeltaCount} tool deltas</span>
            ) : null}
            {event.streamChunk?.textDelta && (
              <span className="chat-debug-cat__row-preview">{event.streamChunk.textDelta}</span>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (category === 'usage') {
    return (
      <div className="chat-debug-cat">
        {slice.map((event, index) => {
          const node = renderUsageRow(event)
          if (node) return <div key={`${event.timestamp}-${index}`}>{node}</div>
          if (event.phase === 'finish') {
            return (
              <div key={`${event.timestamp}-${index}`} className="chat-debug-cat__row">
                <Badge variant="outline">finish</Badge>
                <span className="chat-debug-cat__row-meta">round {event.round ?? '?'}</span>
                <span className="chat-debug-cat__row-stat">{event.finishReason ?? '—'}</span>
              </div>
            )
          }
          return null
        })}
      </div>
    )
  }

  if (category === 'errors') {
    return (
      <div className="chat-debug-cat">
        {slice.map((event, index) => (
          <div
            key={`${event.timestamp}-${index}`}
            className="chat-debug-cat__row chat-debug-cat__row--card chat-debug-cat__row--error"
          >
            <Badge variant="outline">{event.phase}</Badge>
            {event.tool?.name && (
              <span className="chat-debug-cat__row-meta">{event.tool.name}</span>
            )}
            <span className="chat-debug-cat__row-error-msg">
              {event.error ?? event.tool?.error ?? 'unknown error'}
            </span>
          </div>
        ))}
      </div>
    )
  }

  if (category === 'memory') {
    return (
      <div className="chat-debug-cat">
        {slice.map((event, index) => {
          const failed = event.phase === 'memory-extraction-error'
          let detail: string
          if (event.phase === 'memory-extraction-start') {
            detail = `${event.model ?? 'no-model'} · ${event.messageCount ?? 0} msgs`
          } else if (event.phase === 'memory-extraction-result') {
            const facts = `${event.factCount ?? 0} fact${event.factCount === 1 ? '' : 's'}`
            detail = `${facts} · ${event.summaryKept ? 'summary kept' : 'summary empty'}`
          } else {
            detail = event.memoryErrorCode
              ? `[${event.memoryErrorCode}] ${event.error ?? 'unknown error'}`
              : event.error ?? 'unknown error'
          }
          return (
            <div
              key={`${event.timestamp}-${index}`}
              className={`chat-debug-cat__row chat-debug-cat__row--card ${failed ? 'chat-debug-cat__row--error' : ''}`}
            >
              <Badge variant="outline">{event.phase.replace('memory-extraction-', '')}</Badge>
              {failed ? (
                <span className="chat-debug-cat__row-error-msg">{detail}</span>
              ) : (
                <span className="chat-debug-cat__row-meta">{detail}</span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Request category — chronological grouped by round.
  return (
    <div className="chat-debug-cat">
      {slice.map((event, index) => (
        <div key={`${event.timestamp}-${index}`} className="chat-debug-cat__row">
          <Badge variant="outline">{event.phase}</Badge>
          {event.round != null && (
            <span className="chat-debug-cat__row-meta">round {event.round}</span>
          )}
          {event.messageCount != null && (
            <span className="chat-debug-cat__row-stat">{event.messageCount} msgs</span>
          )}
          {event.requestShape && (
            <span className="chat-debug-cat__row-stat">tools: {event.requestShape.toolCount}</span>
          )}
          {event.context && (
            <span className="chat-debug-cat__row-stat">
              ctx {event.context.originalMessageCount}→{event.context.finalMessageCount}
            </span>
          )}
          {event.finishReason && (
            <span className="chat-debug-cat__row-stat">finish: {event.finishReason}</span>
          )}
        </div>
      ))}
    </div>
  )
}
