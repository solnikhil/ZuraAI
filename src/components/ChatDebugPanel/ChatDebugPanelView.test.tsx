// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import type { ChatDiagnosticEvent } from '@/diagnostics/chatDiagnostics'

const mockEvents: ChatDiagnosticEvent[] = [
  {
    sessionId: 'session-test',
    messageId: 'm-1',
    phase: 'request-start',
    timestamp: 1700000000000,
    provider: 'openrouter',
    model: 'claude-sonnet',
    messageCount: 5,
  },
  {
    sessionId: 'session-test',
    messageId: 'm-2',
    phase: 'tool-start',
    timestamp: 1700000001000,
    tool: { name: 'web_search', id: 'tool-1' },
  },
  {
    sessionId: 'session-test',
    messageId: 'm-3',
    phase: 'tool-complete',
    timestamp: 1700000002000,
    tool: { name: 'web_search', id: 'tool-1', success: false, error: 'rate limited' },
  },
  {
    sessionId: 'session-test',
    messageId: 'm-4',
    phase: 'stream-chunk',
    timestamp: 1700000003000,
    streamChunk: { chunkIndex: 0, cumulativeTextLength: 42, textDelta: 'hello world' },
  },
  {
    sessionId: 'session-test',
    messageId: 'm-5',
    phase: 'finish',
    timestamp: 1700000004000,
    finishReason: 'stop',
  },
]

vi.mock('@/diagnostics/useChatDiagnosticsStream', () => ({
  CHAT_DIAGNOSTICS_BUFFER_LIMIT: 1000,
  useChatDiagnosticsStream: () => ({
    events: mockEvents,
    clear: vi.fn(),
    isAvailable: true,
  }),
}))

vi.mock('@/components/shared', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('@/utils/clipboard', () => ({
  writeTextToClipboard: vi.fn(async () => true),
}))

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ data, itemContent }: {
    data: ChatDiagnosticEvent[]
    itemContent: (index: number, event: ChatDiagnosticEvent) => React.ReactNode
  }) => (
    <div data-testid="timeline">
      {data.map((event, index) => (
        <div key={`${event.timestamp}-${event.phase}-${event.messageId}`}>
          {itemContent(index, event)}
        </div>
      ))}
    </div>
  ),
}))

import { ChatDebugPanelView } from './ChatDebugPanelView'

function getTimelineRowCount(): number {
  return screen.getAllByText(/^\d{2}:\d{2}:\d{2}\.\d{3}$/).length
}

function getTimeline(): HTMLElement {
  return screen.getByTestId('timeline')
}

describe('ChatDebugPanelView (standalone window)', () => {
  it('renders the timeline of events with phase chips', () => {
    render(<ChatDebugPanelView sessionId="session-test" />)

    expect(screen.getByText('Chat Debug Logs')).toBeInTheDocument()
    expect(getTimelineRowCount()).toBe(mockEvents.length)
    expect(within(getTimeline()).getByText(/web_search.*fail/i)).toBeInTheDocument()
  })

  it('filters events via the search input', () => {
    render(<ChatDebugPanelView sessionId="session-test" />)

    fireEvent.change(screen.getByPlaceholderText('Search events…'), {
      target: { value: 'web_search' },
    })

    expect(getTimelineRowCount()).toBe(2)
  })

  it('toggles a phase chip to filter events', () => {
    render(<ChatDebugPanelView sessionId="session-test" />)

    expect(getTimelineRowCount()).toBe(mockEvents.length)

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByText(/No events match the current filters/)).toBeInTheDocument()

    const chipsContainer = screen.getByRole('button', { name: 'Select all' }).parentElement!
    const streamChunkChip = within(chipsContainer).getByRole('button', { name: 'stream-chunk' })
    fireEvent.click(streamChunkChip)

    expect(getTimelineRowCount()).toBe(1)
    expect(within(getTimeline()).getByText(/chunk 0/)).toBeInTheDocument()
  })

  it('expands a row to reveal the JSON body', () => {
    render(<ChatDebugPanelView sessionId="session-test" />)

    const finishSummary = within(getTimeline()).getByText(/finish=stop/)
    fireEvent.click(finishSummary)

    const json = within(getTimeline()).getByText((_content, node) =>
      node?.tagName === 'PRE' && (node?.textContent?.includes('"finishReason": "stop"') ?? false)
    )
    expect(json).toBeInTheDocument()
  })

  it('shows the count metabar with filtered/total events', () => {
    render(<ChatDebugPanelView sessionId="session-test" />)
    expect(screen.getByText(/5 \/ 5 events/)).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search events…'), {
      target: { value: 'tool' },
    })
    expect(screen.getByText(/2 \/ 5 events/)).toBeInTheDocument()
  })

  it('toggles to the categorized view and persists the choice', () => {
    window.localStorage.removeItem('zura.chatDebugPanel.view')
    const { unmount } = render(<ChatDebugPanelView sessionId="session-test" />)

    fireEvent.click(screen.getByRole('button', { name: 'Categories' }))
    expect(screen.getByRole('button', { name: 'Tool Calls' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Errors' })).toBeInTheDocument()

    expect(window.localStorage.getItem('zura.chatDebugPanel.view')).toBe('categories')

    unmount()
    render(<ChatDebugPanelView sessionId="session-test" />)
    expect(screen.getByRole('button', { name: 'Tool Calls' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Timeline' })).toBeInTheDocument()
  })

  it('groups tool start+complete events under the Tool Calls tab and surfaces failures under Errors', () => {
    window.localStorage.setItem('zura.chatDebugPanel.view', 'categories')
    window.localStorage.setItem('zura.chatDebugPanel.category', 'tools')

    render(<ChatDebugPanelView sessionId="session-test" />)

    expect(screen.getByText('failed')).toBeInTheDocument()
    expect(screen.getByText('rate limited')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Errors' }))
    expect(screen.getByText('rate limited')).toBeInTheDocument()
  })

  it('groups the memory-extraction phases under a single "dreaming" chip', () => {
    window.localStorage.setItem('zura.chatDebugPanel.view', 'timeline')
    render(<ChatDebugPanelView sessionId="session-test" />)

    const chipsContainer = screen.getByRole('button', { name: 'Select all' }).parentElement!
    expect(within(chipsContainer).getByRole('button', { name: 'dreaming' })).toBeInTheDocument()
    expect(
      within(chipsContainer).queryByRole('button', { name: 'memory-extraction-start' })
    ).not.toBeInTheDocument()
    expect(
      within(chipsContainer).queryByRole('button', { name: 'memory-extraction-result' })
    ).not.toBeInTheDocument()
    expect(
      within(chipsContainer).queryByRole('button', { name: 'memory-extraction-error' })
    ).not.toBeInTheDocument()
  })

  it('renders Streaming aggregate stats from stream-chunk events', () => {
    window.localStorage.setItem('zura.chatDebugPanel.view', 'categories')
    window.localStorage.setItem('zura.chatDebugPanel.category', 'streaming')

    render(<ChatDebugPanelView sessionId="session-test" />)

    expect(screen.getByText(/1 chunks/)).toBeInTheDocument()
    expect(screen.getAllByText('42 chars').length).toBeGreaterThan(0)
  })
})
