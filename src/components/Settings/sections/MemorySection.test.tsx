import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { MemorySection } from './MemorySection'
import type { Memory } from '@/electron/types'

const memoryAPI = {
  list: vi.fn<(scope?: unknown) => Promise<Memory[]>>(),
  add: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  search: vi.fn(),
  onChanged: vi.fn(() => () => undefined),
}

beforeEach(() => {
  Object.values(memoryAPI).forEach((fn) => {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  })
  memoryAPI.list.mockResolvedValue([])
  memoryAPI.add.mockResolvedValue({
    id: 'm-new',
    content: 'I prefer dark mode',
    createdAt: 1,
    updatedAt: 1,
    source: 'user',
    scope: { type: 'global' },
  })
  memoryAPI.delete.mockResolvedValue(true)
  memoryAPI.clear.mockResolvedValue(true)
  memoryAPI.onChanged.mockReturnValue(() => undefined)
  ;(globalThis as unknown as { window: Window & { memory: typeof memoryAPI } }).window.memory = memoryAPI
})

describe('MemorySection', () => {
  it('renders headers and toggles', async () => {
    render(<MemorySection memoryEnabled autoMemoryEnabled onChange={vi.fn()} />)
    expect(screen.getByText('Memory')).toBeInTheDocument()
    await waitFor(() => expect(memoryAPI.list).toHaveBeenCalled())
    expect(screen.getByText(/Enable memory/i)).toBeInTheDocument()
    expect(screen.getByText(/Let AI manage memories automatically/i)).toBeInTheDocument()
  })

  it('disables auto-management toggle when memory is disabled', () => {
    render(<MemorySection memoryEnabled={false} autoMemoryEnabled onChange={vi.fn()} />)
    const autoSwitch = screen.getByRole('switch', { name: /Let AI manage memories/i })
    expect(autoSwitch).toBeDisabled()
  })

  it('add flow calls window.memory.add and refreshes list', async () => {
    memoryAPI.list
      .mockResolvedValueOnce([]) // initial load
      .mockResolvedValue([
        {
          id: 'm-new',
          content: 'I prefer dark mode',
          createdAt: 1,
          updatedAt: 1,
          source: 'user',
          scope: { type: 'global' },
        } satisfies Memory,
      ])

    render(<MemorySection memoryEnabled autoMemoryEnabled onChange={vi.fn()} />)
    await waitFor(() => expect(memoryAPI.list).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /Add memory/i }))
    const textarea = await screen.findByPlaceholderText(/I prefer/i)
    fireEvent.change(textarea, { target: { value: 'I prefer dark mode' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))

    await waitFor(() =>
      expect(memoryAPI.add).toHaveBeenCalledWith({ content: 'I prefer dark mode', source: 'user' })
    )
    await screen.findByText(/I prefer dark mode/)
  })

  it('shows empty hint when there are no memories', async () => {
    render(<MemorySection memoryEnabled autoMemoryEnabled onChange={vi.fn()} />)
    await waitFor(() => expect(memoryAPI.list).toHaveBeenCalled())
    expect(await screen.findByText(/Tip: in chat/)).toBeInTheDocument()
  })
})
