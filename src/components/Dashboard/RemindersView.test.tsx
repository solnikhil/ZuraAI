import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
      resolveAutomationRun: vi.fn(),
      onChanged: vi.fn(() => vi.fn()),
      onSummaryRequest: vi.fn(() => vi.fn()),
      onAutomationRunRequest: vi.fn(() => vi.fn()),
    }
  })

  it('renders a centered panel with All Tasks group', async () => {
    render(<RemindersView />)

    expect(await screen.findByRole('heading', { name: 'Reminders & Lookouts' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'All 2' })).toHaveAttribute('aria-selected', 'true')
    const allTasks = screen.getByRole('region', { name: 'All tasks' })

    expect(within(allTasks).getByText('Review weekly launches')).toBeInTheDocument()
    expect(within(allTasks).getByText('Watch changelog')).toBeInTheDocument()
    expect(within(allTasks).getByText('Reminder')).toBeInTheDocument()
    expect(within(allTasks).getByText('Lookout')).toBeInTheDocument()
  })

  it('sets draft text when Ask agent is clicked', async () => {
    render(<RemindersView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Ask agent' }))

    expect(mockSetDraftText).toHaveBeenCalledWith(
      'Help me create a reminder, lookout, or AI automation.'
    )
    expect(mockSetDashboardView).toHaveBeenCalledWith('chat')
  })

  it('opens logs in the side drawer', async () => {
    render(<RemindersView />)

    const allTasks = await screen.findByRole('region', { name: 'All tasks' })
    const row = within(allTasks).getByText('Watch changelog').closest('article')
    expect(row).not.toBeNull()
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Logs' }))

    expect(
      screen.getByRole('complementary', { name: /logs for watch changelog/i })
    ).toBeInTheDocument()
    expect(document.querySelector('.reminders-view__drawer-divider')).toBeInTheDocument()
    expect(screen.getByText('The changelog added a new API release.')).toBeInTheDocument()
    expect(screen.getByText('New API release notes')).toBeInTheDocument()
  })

  it('opens task details and sets draft text for agent edit prompt', async () => {
    render(<RemindersView />)

    const allTasks = await screen.findByRole('region', { name: 'All tasks' })
    const row = within(allTasks).getByText('Review weekly launches').closest('article')
    expect(row).not.toBeNull()
    const menuTrigger = within(row as HTMLElement).getByRole('button', { name: 'More actions' })
    menuTrigger.focus()
    fireEvent.keyDown(menuTrigger, { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('menuitem', { name: /edit/i }))

    const detailsDrawer = screen.getByRole('complementary', {
      name: /details for review weekly launches/i,
    })
    expect(within(detailsDrawer).getByText('Task details')).toBeInTheDocument()
    expect(
      within(detailsDrawer).getByRole('heading', { name: 'Review weekly launches' })
    ).toBeInTheDocument()
    expect(within(detailsDrawer).getByText('Type')).toBeInTheDocument()
    expect(within(detailsDrawer).getByText('Status')).toBeInTheDocument()
    expect(within(detailsDrawer).getByText('Schedule')).toBeInTheDocument()
    expect(within(detailsDrawer).getByText('Next run')).toBeInTheDocument()
    expect(within(detailsDrawer).getByText('Reminder text')).toBeInTheDocument()
    expect(within(detailsDrawer).getByText('Review launch notes')).toBeInTheDocument()

    fireEvent.click(within(detailsDrawer).getByRole('button', { name: 'Edit this with agent' }))

    expect(mockSetDraftText).toHaveBeenCalledWith(expect.stringContaining('Task id: task-2'))
    expect(mockSetDashboardView).toHaveBeenCalledWith('chat')
  })

  it('uses shadcn dropdown triggers for row actions', async () => {
    render(<RemindersView />)

    const allTasks = await screen.findByRole('region', { name: 'All tasks' })
    const row = within(allTasks).getByText('Watch changelog').closest('article')
    expect(row).not.toBeNull()
    const trigger = within(row as HTMLElement).getByRole('button', { name: 'More actions' })

    expect(trigger).toHaveAttribute('data-slot', 'dropdown-menu-trigger')
    expect(trigger).toHaveAttribute('data-variant', 'ghost')
  })

  it('renders compact empty state for empty group', async () => {
    window.scheduledTasks.list = vi.fn().mockResolvedValue([])
    window.scheduledTasks.listRuns = vi.fn().mockResolvedValue([])

    render(<RemindersView />)

    expect(await screen.findByText('No matching tasks')).toBeInTheDocument()
    expect(
      screen.getByText('Ask the agent to create a reminder, lookout, or AI automation.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remind me tomorrow at 9 AM' })).toBeInTheDocument()
  })
})
