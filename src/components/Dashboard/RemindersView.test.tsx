import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'

import type { ScheduledTaskDefinition, ScheduledTaskRun } from '@/electron/types'
import RemindersView from './RemindersView'

const mockSetDraftText = vi.fn()
const mockSetDashboardView = vi.fn()

vi.mock('@/contexts/ComposerDraftContext', () => ({
  useComposerDraft: () => ({ setDraftText: mockSetDraftText }),
}))

vi.mock('@/contexts/AppShellContext', () => ({
  useAppShell: () => ({ setDashboardView: mockSetDashboardView }),
}))

const lookoutTask: ScheduledTaskDefinition = {
  id: 'task-1',
  type: 'web_lookout',
  title: 'Watch changelog',
  enabled: true,
  urls: ['https://example.com/changelog'],
  instructions: 'Only important product updates',
  intervalPreset: 'daily',
  createdAt: 1,
  updatedAt: 1,
  lastRunAt: 2,
  nextRunAt: Date.now() + 86_400_000,
}

const reminderTask: ScheduledTaskDefinition = {
  id: 'task-2',
  type: 'reminder',
  title: 'Review weekly launches',
  enabled: false,
  urls: [],
  reminderText: 'Review launch notes',
  instructions: 'Prepare a brief checklist',
  intervalPreset: 'weekly',
  createdAt: 1,
  updatedAt: 1,
  nextRunAt: Date.now() + 604_800_000,
}

const run: ScheduledTaskRun = {
  id: 'run-1',
  taskId: 'task-1',
  startedAt: 2,
  finishedAt: 3,
  status: 'changed',
  logs: [
    {
      url: 'https://example.com/changelog',
      status: 'changed',
      changedExcerpt: 'New API release notes',
    },
  ],
  aiSummary: 'The changelog added a new API release.',
}

describe('RemindersView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetDraftText.mockClear()
    window.scheduledTasks = {
      list: vi.fn().mockResolvedValue([lookoutTask, reminderTask]),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue(lookoutTask),
      delete: vi.fn().mockResolvedValue(true),
      runNow: vi.fn(),
      listRuns: vi.fn().mockResolvedValue([run]),
      getRun: vi.fn(),
      resolveSummary: vi.fn(),
      onChanged: vi.fn(() => vi.fn()),
      onSummaryRequest: vi.fn(() => vi.fn()),
    }
  })

  it('renders a centered panel with Reminders and Lookouts groups', async () => {
    render(<RemindersView />)

    expect(await screen.findByRole('heading', { name: 'Reminders & Lookouts' })).toBeInTheDocument()
    const reminders = screen.getByRole('region', { name: 'Reminders' })
    const lookouts = screen.getByRole('region', { name: 'Lookouts' })

    expect(within(reminders).getByText('Review weekly launches')).toBeInTheDocument()
    expect(within(lookouts).getByText('Watch changelog')).toBeInTheDocument()
  })

  it('sets draft text when Ask agent is clicked', async () => {
    render(<RemindersView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Ask agent' }))

    expect(mockSetDraftText).toHaveBeenCalledWith('Help me create a reminder or lookout.')
    expect(mockSetDashboardView).toHaveBeenCalledWith('chat')
  })

  it('opens logs in the side drawer', async () => {
    render(<RemindersView />)

    const lookouts = await screen.findByRole('region', { name: 'Lookouts' })
    fireEvent.click(within(lookouts).getByRole('button', { name: 'Logs' }))

    expect(screen.getByRole('complementary', { name: /logs for watch changelog/i })).toBeInTheDocument()
    expect(screen.getByText('The changelog added a new API release.')).toBeInTheDocument()
    expect(screen.getByText('New API release notes')).toBeInTheDocument()
  })

  it('opens task details and sets draft text for agent edit prompt', async () => {
    render(<RemindersView />)

    const reminders = await screen.findByRole('region', { name: 'Reminders' })
    fireEvent.click(within(reminders).getByRole('button', { name: 'Edit' }))

    expect(screen.getByRole('complementary', { name: /details for review weekly launches/i })).toBeInTheDocument()
    expect(screen.getByText('Prepare a brief checklist')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit this with agent' }))

    expect(mockSetDraftText).toHaveBeenCalledWith(expect.stringContaining('Task id: task-2'))
    expect(mockSetDraftText).toHaveBeenCalledWith(expect.stringContaining('scheduled_task_update'))
    expect(mockSetDashboardView).toHaveBeenCalledWith('chat')
  })

  it('pauses/resumes and deletes scheduled tasks from row actions', async () => {
    render(<RemindersView />)

    const lookouts = await screen.findByRole('region', { name: 'Lookouts' })
    fireEvent.click(within(lookouts).getByRole('button', { name: 'Pause' }))

    await waitFor(() => {
      expect(window.scheduledTasks.update).toHaveBeenCalledWith('task-1', { enabled: false })
    })

    fireEvent.click(within(lookouts).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(window.scheduledTasks.delete).toHaveBeenCalledWith('task-1')
    })
  })

  it('renders compact empty states for empty groups', async () => {
    window.scheduledTasks.list = vi.fn().mockResolvedValue([])
    window.scheduledTasks.listRuns = vi.fn().mockResolvedValue([])

    render(<RemindersView />)

    expect(await screen.findByText('No reminders yet. Ask the agent to schedule one.')).toBeInTheDocument()
    expect(screen.getByText('No lookouts yet. Ask the agent to watch a page.')).toBeInTheDocument()
  })
})
