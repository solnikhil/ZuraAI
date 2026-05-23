import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { MemorySection } from './MemorySection'
import type { Memory } from '@/electron/types'
import { defaultSkillsSettings, withSkillEnabled, type SkillsSettings } from '@/skills'

const memoryAPI = {
  list: vi.fn<(scope?: unknown) => Promise<Memory[]>>(),
  add: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  search: vi.fn(),
  onChanged: vi.fn(() => () => undefined),
}

const enabledSkills: SkillsSettings = withSkillEnabled(defaultSkillsSettings, 'memory', true)
const disabledSkills: SkillsSettings = withSkillEnabled(defaultSkillsSettings, 'memory', false)

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
  it('renders header and the single skill-driven toggle', async () => {
    render(<MemorySection skills={enabledSkills} onChange={vi.fn()} />)
    expect(screen.getByText('Memory')).toBeInTheDocument()
    await waitFor(() => expect(memoryAPI.list).toHaveBeenCalled())
    expect(screen.getByText(/Enable memory/i)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Enable memory/i })).toBeChecked()
  })

  it('reflects the disabled skill state on the toggle', () => {
    render(<MemorySection skills={disabledSkills} onChange={vi.fn()} />)
    const toggle = screen.getByRole('switch', { name: /Enable memory/i })
    expect(toggle).not.toBeChecked()
  })

  it('toggling the switch dispatches a skills update', async () => {
    const onChange = vi.fn()
    render(<MemorySection skills={enabledSkills} onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch', { name: /Enable memory/i }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const update = onChange.mock.calls[0]?.[0] as { skills?: SkillsSettings }
    expect(update.skills?.memory.enabled).toBe(false)
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

    render(<MemorySection skills={enabledSkills} onChange={vi.fn()} />)
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
    render(<MemorySection skills={enabledSkills} onChange={vi.fn()} />)
    await waitFor(() => expect(memoryAPI.list).toHaveBeenCalled())
    expect(await screen.findByText(/Tip: in chat/)).toBeInTheDocument()
  })
})
