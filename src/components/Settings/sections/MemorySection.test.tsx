import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { MemorySection } from './MemorySection'
import type { ConversationSummary, Memory } from '@/electron/types'

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

  memoryAPI.list.mockResolvedValue([])
  memoryAPI.delete.mockResolvedValue(true)
  memoryAPI.clear.mockResolvedValue(true)
  memoryAPI.onChanged.mockReturnValue(() => undefined)
  memoryAPI.summaries.list.mockResolvedValue([])
  ;(globalThis as unknown as { window: Window & { memory: typeof memoryAPI } }).window.memory = memoryAPI
})

describe('MemorySection', () => {
  it('renders header and loads global memories on mount', async () => {
    render(<MemorySection />)

    expect(screen.getByText('Memory')).toBeInTheDocument()
    expect(screen.queryByLabelText('Recent activity')).not.toBeInTheDocument()

    await waitFor(() => expect(memoryAPI.list).toHaveBeenCalled())
    expect(memoryAPI.list).toHaveBeenCalledWith({ type: 'global' })
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
    await screen.findByText('1 item extracted from conversations, including recent activity.')

    // Opening "View all" reveals the extracted memory content.
    fireEvent.click(screen.getByRole('button', { name: /View all/i }))
    expect(await screen.findByText('I prefer dark mode')).toBeInTheDocument()
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

    await screen.findByText('1 item extracted from conversations, including recent activity.')

    fireEvent.click(screen.getByRole('button', { name: /View all/i }))
    expect(await screen.findByText('Recent activity')).toBeInTheDocument()
    expect(screen.getByText('User prefers to be called Unc.')).toBeInTheDocument()
  })

  it('shows empty hints when there are no background memories', async () => {
    const onChange = vi.fn()
    render(<MemorySection onChange={onChange} />)

    await waitFor(() => expect(memoryAPI.list).toHaveBeenCalled())

    expect(
      await screen.findByText(
        'No background memories yet. Enable Background Active Memory to start extracting facts.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Recent activity')).not.toBeInTheDocument()
  })
})
