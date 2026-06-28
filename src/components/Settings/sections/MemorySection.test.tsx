import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { MemorySection } from './MemorySection'
import type { ConversationSummary, Memory } from '@/electron/types'

const appShellMock = vi.hoisted(() => ({
  setDashboardView: vi.fn(),
}))

const chatHistoryMock = vi.hoisted(() => ({
  sessions: [] as Array<{ id: string }>,
  folders: [] as Array<{ id: string; name: string }>,
  switchSession: vi.fn(),
}))

vi.mock('@/contexts/AppShellContext', () => ({
  useAppShell: () => appShellMock,
}))

vi.mock('@/contexts/ChatHistoryContext', () => ({
  useChatHistory: () => chatHistoryMock,
}))

const memoryAPI = {
  list: vi.fn<(scope?: unknown) => Promise<Memory[]>>(),
  add: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  search: vi.fn(),
  onChanged: vi.fn(() => () => undefined),
  summaries: {
    list: vi.fn<() => Promise<ConversationSummary[]>>(),
    upsert: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  },
}

function backgroundMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'bg-1',
    content: 'User prefers dark mode',
    createdAt: 1,
    updatedAt: 1,
    source: 'model',
    origin: 'background',
    status: 'active',
    scope: { type: 'global' },
    category: 'context',
    ...overrides,
  }
}

beforeEach(() => {
  memoryAPI.list.mockReset()
  memoryAPI.add.mockReset()
  memoryAPI.update.mockReset()
  memoryAPI.delete.mockReset()
  memoryAPI.clear.mockReset()
  memoryAPI.search.mockReset()
  memoryAPI.onChanged.mockReset()
  memoryAPI.summaries.list.mockReset()
  memoryAPI.summaries.upsert.mockReset()
  memoryAPI.summaries.delete.mockReset()
  memoryAPI.summaries.clear.mockReset()
  appShellMock.setDashboardView.mockReset()
  chatHistoryMock.switchSession.mockReset()
  chatHistoryMock.sessions = []
  chatHistoryMock.folders = []

  memoryAPI.list.mockResolvedValue([])
  memoryAPI.delete.mockResolvedValue(true)
  memoryAPI.clear.mockResolvedValue(true)
  memoryAPI.onChanged.mockReturnValue(() => undefined)
  memoryAPI.summaries.list.mockResolvedValue([])
  memoryAPI.summaries.delete.mockResolvedValue(true)
  memoryAPI.summaries.clear.mockResolvedValue(true)
  ;(globalThis as unknown as { window: Window & { memory: typeof memoryAPI } }).window.memory = memoryAPI
})

describe('MemorySection', () => {
  it('renders header and loads memories on mount', async () => {
    render(<MemorySection />)

    expect(screen.getByText('Memory')).toBeInTheDocument()
    expect(screen.queryByLabelText('Recent activity')).not.toBeInTheDocument()

    await waitFor(() => expect(memoryAPI.list).toHaveBeenCalled())
    expect(memoryAPI.list).toHaveBeenCalledWith()
  })

  it('surfaces background memories in the viewer when onChange is provided', async () => {
    memoryAPI.list.mockResolvedValue([backgroundMemory({ content: 'I prefer dark mode' })])

    const onChange = vi.fn()
    render(<MemorySection onChange={onChange} />)

    await waitFor(() => expect(memoryAPI.list).toHaveBeenCalled())

    // Background-management toggle is exposed only in the managed (onChange) variant.
    expect(
      screen.getByRole('switch', { name: /manage memory automatically/i })
    ).toBeInTheDocument()

    // The count reflects the one extracted background memory.
    await screen.findByText('1 fact · 0 activity items')

    expect(await screen.findByText('I prefer dark mode')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Facts 1/i })).toBeInTheDocument()
    expect(screen.getAllByText('Context').length).toBeGreaterThan(0)
  })

  it('surfaces project-scoped memories in the extension library', async () => {
    chatHistoryMock.folders = [{ id: 'project-1', name: 'Launch Plan' }]
    memoryAPI.list.mockResolvedValue([
      backgroundMemory({
        id: 'project-memory',
        content: 'Launch checklist lives in Linear',
        scope: { type: 'project', projectId: 'project-1', includeGlobal: false },
      }),
      backgroundMemory({
        id: 'global-memory',
        content: 'User prefers concise answers',
      }),
    ])

    const onChange = vi.fn()
    render(<MemorySection onChange={onChange} />)

    await screen.findByText('Launch checklist lives in Linear')
    expect(screen.getByText('Launch Plan')).toBeInTheDocument()
    expect(screen.getByText('2 facts · 0 activity items · 1 project memory')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Project memory 1/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /Project memory 1/i }))
    expect(screen.getByText('Launch checklist lives in Linear')).toBeInTheDocument()
    expect(screen.queryByText('User prefers concise answers')).not.toBeInTheDocument()
  })

  it('deletes a background memory from the library', async () => {
    memoryAPI.list
      .mockResolvedValueOnce([backgroundMemory({ id: 'bg-1', content: 'I prefer dark mode' })])
      .mockResolvedValueOnce([])

    const onChange = vi.fn()
    render(<MemorySection onChange={onChange} />)

    expect(await screen.findByText('I prefer dark mode')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /delete background fact/i }))

    await waitFor(() => expect(memoryAPI.delete).toHaveBeenCalledWith('bg-1'))
    await waitFor(() => expect(memoryAPI.list).toHaveBeenCalledTimes(2))
  })

  it('shows recent activity inside the saved background memories viewer', async () => {
    memoryAPI.summaries.list.mockResolvedValue([
      {
        sessionId: 'session-1',
        summary: 'User prefers to be called Unc.',
        updatedAt: Date.UTC(2026, 5, 10),
      },
    ])

    const onChange = vi.fn()
    render(<MemorySection onChange={onChange} />)

    await waitFor(() => expect(memoryAPI.summaries.list).toHaveBeenCalled())

    await screen.findByText('0 facts · 1 activity item')

    expect(await screen.findByText('Recent activity')).toBeInTheDocument()
    expect(screen.getByText('User prefers to be called Unc.')).toBeInTheDocument()
  })

  it('filters by category and needs review', async () => {
    memoryAPI.list.mockResolvedValue([
      backgroundMemory({
        id: 'pref-1',
        content: 'User prefers concise answers',
        category: 'preference',
      }),
      backgroundMemory({
        id: 'review-1',
        content: 'User wants to be reminded tomorrow to submit the report',
        category: 'workflow',
      }),
    ])

    const onChange = vi.fn()
    render(<MemorySection onChange={onChange} />)

    expect(await screen.findByText('User prefers concise answers')).toBeInTheDocument()
    expect(screen.getByText('User wants to be reminded tomorrow to submit the report')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /Preferences 1/i }))
    expect(screen.getByText('User prefers concise answers')).toBeInTheDocument()
    expect(screen.queryByText('User wants to be reminded tomorrow to submit the report')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /Needs review 1/i }))
    expect(screen.queryByText('User prefers concise answers')).not.toBeInTheDocument()
    expect(screen.getByText('User wants to be reminded tomorrow to submit the report')).toBeInTheDocument()
  })

  it('shows simple filter counts for facts, activity, and review items', async () => {
    memoryAPI.list.mockResolvedValue([
      backgroundMemory({
        id: 'old-review',
        content: 'User wants to watch https://example.com for changes',
        updatedAt: Date.now() - 120 * 24 * 60 * 60 * 1000,
      }),
    ])
    memoryAPI.summaries.list.mockResolvedValue([
      {
        sessionId: 'session-1',
        summary: 'User prefers concise answers',
        updatedAt: Date.now(),
      },
    ])

    const onChange = vi.fn()
    render(<MemorySection onChange={onChange} />)

    await screen.findByText('User wants to watch https://example.com for changes')
    expect(screen.getByRole('tab', { name: /Facts 1/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Activity 1/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Needs review 1/i })).toBeInTheDocument()
  })

  it('opens the source chat when the linked session exists', async () => {
    chatHistoryMock.sessions = [{ id: 'session-1' }]
    memoryAPI.list.mockResolvedValue([
      backgroundMemory({
        id: 'bg-source',
        content: 'User prefers concise answers',
        sessionId: 'session-1',
      }),
    ])

    const onChange = vi.fn()
    render(<MemorySection onChange={onChange} />)

    fireEvent.click(await screen.findByRole('button', { name: /Open chat/i }))

    expect(chatHistoryMock.switchSession).toHaveBeenCalledWith('session-1')
    expect(appShellMock.setDashboardView).toHaveBeenCalledWith('chat')
  })

  it('disables the source action when the linked chat is missing', async () => {
    memoryAPI.list.mockResolvedValue([
      backgroundMemory({
        id: 'bg-missing-source',
        content: 'User prefers concise answers',
        sessionId: 'deleted-session',
      }),
    ])

    const onChange = vi.fn()
    render(<MemorySection onChange={onChange} />)

    const sourceButton = await screen.findByRole('button', { name: /Source unavailable/i })
    expect(sourceButton).toBeDisabled()
  })

  it('deletes recent activity from the library', async () => {
    memoryAPI.summaries.list
      .mockResolvedValueOnce([
        {
          sessionId: 'session-1',
          summary: 'User prefers to be called Unc.',
          updatedAt: Date.UTC(2026, 5, 10),
        },
      ])
      .mockResolvedValueOnce([])

    const onChange = vi.fn()
    render(<MemorySection onChange={onChange} />)

    expect(await screen.findByText('User prefers to be called Unc.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /delete recent activity/i }))

    await waitFor(() => expect(memoryAPI.summaries.delete).toHaveBeenCalledWith('session-1'))
    await waitFor(() => expect(memoryAPI.summaries.list).toHaveBeenCalledTimes(2))
  })

  it('shows empty hints when there are no background memories', async () => {
    const onChange = vi.fn()
    render(<MemorySection onChange={onChange} />)

    await waitFor(() => expect(memoryAPI.list).toHaveBeenCalled())

    expect(await screen.findByText('No saved facts or recent activity yet.')).toBeInTheDocument()
    expect(screen.getByText('No memories saved yet')).toBeInTheDocument()
  })
})
