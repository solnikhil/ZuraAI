import React, { useState } from 'react'
import { Brain } from '@/components/icons'
import { isMemoryToolEvent, type MemoryToolEvent } from '@/tools/memoryTools'
import type { ToolCallResult } from '@/tools/types'

export interface MemoryUpdatePillProps {
  /**
   * The memory tool events to summarize (extracted from a message's
   * `toolResults` by {@link extractMemoryEvents}). All events from a single
   * assistant turn are grouped into one pill.
   */
  events: MemoryToolEvent[]
  /** Called when the user clicks "Manage memories"; jumps to settings. */
  onManageMemories?: () => void
}

/**
 * Filters a message's `toolResults` to memory events only. Used by the chat
 * message renderer to split memory events out from generic tool results so
 * they can render through this compact pill instead of the full
 * `ToolResultDisplay`.
 */
export function extractMemoryEvents(
  toolResults: ToolCallResult[] | undefined | null
): MemoryToolEvent[] {
  if (!Array.isArray(toolResults)) return []
  const events: MemoryToolEvent[] = []
  for (const entry of toolResults) {
    if (!entry?.result?.success) continue
    const data = entry.result.data
    if (isMemoryToolEvent(data)) events.push(data)
  }
  return events
}

function summarize(events: MemoryToolEvent[]): string {
  const counts = { added: 0, updated: 0, deleted: 0, searched: 0 }
  for (const event of events) {
    if (event.kind === 'memory.added') counts.added += 1
    else if (event.kind === 'memory.updated') counts.updated += 1
    else if (event.kind === 'memory.deleted') counts.deleted += 1
    else if (event.kind === 'memory.searched') counts.searched += 1
  }

  const totalChanges = counts.added + counts.updated + counts.deleted
  if (totalChanges === 0) {
    if (counts.searched === 1) return 'Searched memories'
    return `Searched memories · ${counts.searched} times`
  }

  if (totalChanges === 1) return 'Memory updated'
  return `Memory updated · ${totalChanges} changes`
}

export function MemoryUpdatePill({ events, onManageMemories }: MemoryUpdatePillProps): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false)
  if (!events.length) return null

  return (
    <div className="memory-pill" role="group" aria-label="Memory changes">
      <button
        type="button"
        className="memory-pill__trigger"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="memory-pill__icon" aria-hidden>
          <Brain size={14} />
        </span>
        <span className="memory-pill__label">{summarize(events)}</span>
      </button>

      {expanded && (
        <div className="memory-pill__details">
          <ul className="memory-pill__list" role="list">
            {events.map((event, index) => (
              <li key={index} className={`memory-pill__row memory-pill__row--${rowKind(event)}`}>
                <span className="memory-pill__row-tag">{rowLabel(event)}</span>
                <span className="memory-pill__row-text">{rowText(event)}</span>
                {event.kind === 'memory.updated' && (
                  <span className="memory-pill__row-previous">was: “{event.previousContent}”</span>
                )}
              </li>
            ))}
          </ul>
          {onManageMemories && (
            <button type="button" className="memory-pill__manage" onClick={onManageMemories}>
              Manage memories →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function rowKind(event: MemoryToolEvent): 'added' | 'updated' | 'deleted' | 'searched' {
  if (event.kind === 'memory.added') return 'added'
  if (event.kind === 'memory.updated') return 'updated'
  if (event.kind === 'memory.deleted') return 'deleted'
  return 'searched'
}

function rowLabel(event: MemoryToolEvent): string {
  switch (event.kind) {
    case 'memory.added':
      return 'Added'
    case 'memory.updated':
      return 'Updated'
    case 'memory.deleted':
      return 'Removed'
    case 'memory.searched':
      return 'Searched'
  }
}

function rowText(event: MemoryToolEvent): string {
  switch (event.kind) {
    case 'memory.added':
    case 'memory.updated':
      return event.content
    case 'memory.deleted':
      return event.previousContent
    case 'memory.searched':
      return `“${event.query}” — ${event.matches.length} match${event.matches.length === 1 ? '' : 'es'}`
  }
}

export default MemoryUpdatePill
