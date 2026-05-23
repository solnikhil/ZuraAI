import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryUpdatePill, extractMemoryEvents } from './MemoryUpdatePill'
import type { MemoryToolEvent } from '@/tools/memoryTools'

const added: MemoryToolEvent = {
  kind: 'memory.added',
  id: 'm1',
  content: 'I prefer TypeScript',
  updatedAt: 1,
}
const updated: MemoryToolEvent = {
  kind: 'memory.updated',
  id: 'm2',
  content: 'I love Rust too',
  previousContent: 'I love Rust',
  updatedAt: 2,
}
const deleted: MemoryToolEvent = {
  kind: 'memory.deleted',
  id: 'm3',
  previousContent: 'old fact',
}
const searched: MemoryToolEvent = {
  kind: 'memory.searched',
  query: 'rust',
  matches: [],
}

describe('extractMemoryEvents', () => {
  it('returns memory events from successful tool results', () => {
    const events = extractMemoryEvents([
      // memory event
      { toolCall: { id: '1', name: 'save_memory', arguments: {} }, result: { success: true, data: added } },
      // failed result — ignored
      { toolCall: { id: '2', name: 'save_memory', arguments: {} }, result: { success: false, error: 'oops' } },
      // unrelated tool result — ignored
      { toolCall: { id: '3', name: 'web_search', arguments: {} }, result: { success: true, data: { foo: 1 } } },
    ])
    expect(events).toEqual([added])
  })

  it('returns [] for missing input', () => {
    expect(extractMemoryEvents(undefined)).toEqual([])
    expect(extractMemoryEvents(null)).toEqual([])
  })
})

describe('MemoryUpdatePill', () => {
  it('renders nothing when there are no events', () => {
    const { container } = render(<MemoryUpdatePill events={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows "Memory updated" for a single change', () => {
    render(<MemoryUpdatePill events={[added]} />)
    expect(screen.getByText('Memory updated')).toBeInTheDocument()
  })

  it('shows aggregated change count for multiple mutations', () => {
    render(<MemoryUpdatePill events={[added, updated, deleted]} />)
    expect(screen.getByText(/Memory updated · 3 changes/)).toBeInTheDocument()
  })

  it('shows search-only label when only searches happened', () => {
    render(<MemoryUpdatePill events={[searched]} />)
    expect(screen.getByText('Searched memories')).toBeInTheDocument()
  })

  it('expands on click and shows added/updated/removed rows', () => {
    render(<MemoryUpdatePill events={[added, updated, deleted]} />)
    const trigger = screen.getByRole('button', { name: /Memory updated/i })
    fireEvent.click(trigger)
    expect(screen.getByText('Added')).toBeInTheDocument()
    expect(screen.getByText('Updated')).toBeInTheDocument()
    expect(screen.getByText('Removed')).toBeInTheDocument()
    expect(screen.getByText('I prefer TypeScript')).toBeInTheDocument()
    expect(screen.getByText(/was: “I love Rust”/)).toBeInTheDocument()
  })

  it('calls onManageMemories when Manage memories is clicked', () => {
    const onManage = vi.fn()
    render(<MemoryUpdatePill events={[added]} onManageMemories={onManage} />)
    fireEvent.click(screen.getByRole('button', { name: /Memory updated/i }))
    fireEvent.click(screen.getByRole('button', { name: /Manage memories/ }))
    expect(onManage).toHaveBeenCalled()
  })
})
