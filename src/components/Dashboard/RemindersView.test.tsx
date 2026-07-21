import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'

import type { ScheduledTaskDefinition, ScheduledTaskRun } from '@/electron/types'
import RemindersView from './RemindersView'

const mockSetDraftText = vi.fn()
const mockSetDashboardView = vi.fn()
const mockSwitchSession = vi.fn()

vi.mock('@/contexts/ComposerDraftContext', () => ({
  useComposerDraft: () => ({ setDraftText: mockSetDraftText }),
}))

vi.mock('@/contexts/AppShellContext', () => ({
  useAppShell: () => ({ setDashboardView: mockSetDashboardView }),
}))

vi.mock('@/contexts/ChatHistoryContext', () => ({
  useChatHistory: () => ({
    switchSession: mockSwitchSession,
    sessions: [{ id: 'automation-chat-1', title: 'Automation run' }],
  }),
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

const automationTask: ScheduledTaskDefinition = {
  id: 'task-3',
  type: 'ai_automation',
  title: 'AI news brief',
  enabled: true,
  urls: [],
  instructions: '',
  intervalPreset: '30m',
  schedule: { kind: 'agent', intervalPreset: '30m' },
  prompt: 'Summarize AI news',
  automationMode: 'prompt',
  createdAt: 1,
  updatedAt: 1,
  nextRunAt: Date.now() + 3_600_000,
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

const automationRun: ScheduledTaskRun = {
  id: 'run-2',
  taskId: 'task-3',
  startedAt: 4,
  finishedAt: 5,
  status: 'unchanged',
  logs: [],
  outputText: 'Fresh AI headlines today.',
  automationChatSessionId: 'automation-chat-1',
}

describe('RemindersView (Schedules)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetDraftText.mockClear()
    mockSwitchSession.mockClear()
    window.scheduledTasks = {
      list: vi.fn().mockResolvedValue([lookoutTask, reminderTask, automationTask]),
      create: vi.fn().mockResolvedValue(reminderTask),
      update: vi.fn().mockResolvedValue(lookoutTask),
      delete: vi.fn().mockResolvedValue(true),
      runNow: vi.fn(),
      listRuns: vi.fn().mockResolvedValue([run, automationRun]),
      getRun: vi.fn(),
      resolveSummary: vi.fn(),
      resolveAutomationRun: vi.fn(),
      onChanged: vi.fn(() => vi.fn()),
      onSummaryRequest: vi.fn(() => vi.fn()),
      onAutomationRunRequest: vi.fn(() => vi.fn()),
    }
  })

  it('renders Schedules title and all task types', async () => {
    render(<RemindersView />)

    expect(await screen.findByRole('heading', { name: 'Schedules' })).toBeInTheDocument()
    expect(
      screen.getByText(/only run while ZuraAI is open/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'All 3' })).toHaveAttribute('aria-selected', 'true')
    const allTasks = screen.getByRole('region', { name: 'All schedules' })

    expect(within(allTasks).getByText('Review weekly launches')).toBeInTheDocument()
    expect(within(allTasks).getByText('Watch changelog')).toBeInTheDocument()
    expect(within(allTasks).getByText('AI news brief')).toBeInTheDocument()
    expect(within(allTasks).getByText('Reminder')).toBeInTheDocument()
    expect(within(allTasks).getByText('Lookout')).toBeInTheDocument()
    expect(within(allTasks).getByText('Automation')).toBeInTheDocument()
    expect(within(allTasks).getByText('Prompt only')).toBeInTheDocument()
    expect(within(allTasks).getByText(/Last: Changed/i)).toBeInTheDocument()
  })

  it('opens create form from New button', async () => {
    render(<RemindersView />)

    fireEvent.click(await screen.findByRole('button', { name: /new/i }))

    expect(
      screen.getByRole('complementary', { name: /create schedule for new schedule/i })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create schedule' })).toBeInTheDocument()
  })

  it('sets draft text when Ask agent is clicked', async () => {
    render(<RemindersView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Ask agent' }))

    expect(mockSetDraftText).toHaveBeenCalledWith(
      'Help me create a reminder, lookout, or AI automation.'
    )
    expect(mockSetDashboardView).toHaveBeenCalledWith('chat')
  })

  it('opens history in the side drawer with type-aware status labels', async () => {
    render(<RemindersView />)

    const allTasks = await screen.findByRole('region', { name: 'All schedules' })
    const row = within(allTasks).getByText('Watch changelog').closest('article')
    expect(row).not.toBeNull()
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'History' }))

    expect(
      screen.getByRole('complementary', { name: /run history for watch changelog/i })
    ).toBeInTheDocument()
    expect(screen.getByText('Changed')).toBeInTheDocument()
    expect(screen.getByText('The changelog added a new API release.')).toBeInTheDocument()
    expect(screen.getByText('New API release notes')).toBeInTheDocument()
  })

  it('opens edit form when Edit is chosen', async () => {
    render(<RemindersView />)

    const allTasks = await screen.findByRole('region', { name: 'All schedules' })
    const row = within(allTasks).getByText('Review weekly launches').closest('article')
    expect(row).not.toBeNull()
    const menuTrigger = within(row as HTMLElement).getByRole('button', { name: 'More actions' })
    menuTrigger.focus()
    fireEvent.keyDown(menuTrigger, { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('menuitem', { name: /^edit$/i }))

    expect(
      screen.getByRole('complementary', { name: /edit schedule for edit review weekly launches/i })
    ).toBeInTheDocument()
    expect(screen.getByDisplayValue('Review weekly launches')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Review launch notes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('confirms before deleting a schedule', async () => {
    render(<RemindersView />)

    const allTasks = await screen.findByRole('region', { name: 'All schedules' })
    const row = within(allTasks).getByText('Watch changelog').closest('article')
    expect(row).not.toBeNull()
    const menuTrigger = within(row as HTMLElement).getByRole('button', { name: 'More actions' })
    menuTrigger.focus()
    fireEvent.keyDown(menuTrigger, { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('menuitem', { name: /delete/i }))

    expect(screen.getByRole('heading', { name: 'Delete schedule?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await vi.waitFor(() => {
      expect(window.scheduledTasks.delete).toHaveBeenCalledWith('task-1')
    })
  })

  it('opens automation run chat from history', async () => {
    render(<RemindersView />)

    const allTasks = await screen.findByRole('region', { name: 'All schedules' })
    const row = within(allTasks).getByText('AI news brief').closest('article')
    expect(row).not.toBeNull()
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'History' }))

    fireEvent.click(await screen.findByRole('button', { name: /open run chat/i }))
    expect(mockSwitchSession).toHaveBeenCalledWith('automation-chat-1')
    expect(mockSetDashboardView).toHaveBeenCalledWith('chat')
  })

  it('uses shadcn dropdown triggers for row actions', async () => {
    render(<RemindersView />)

    const allTasks = await screen.findByRole('region', { name: 'All schedules' })
    const row = within(allTasks).getByText('Watch changelog').closest('article')
    expect(row).not.toBeNull()
    const trigger = within(row as HTMLElement).getByRole('button', { name: 'More actions' })

    expect(trigger).toHaveAttribute('data-slot', 'dropdown-menu-trigger')
    expect(trigger).toHaveAttribute('data-variant', 'ghost')
  })

  it('renders empty state with create shortcuts', async () => {
    window.scheduledTasks.list = vi.fn().mockResolvedValue([])
    window.scheduledTasks.listRuns = vi.fn().mockResolvedValue([])

    render(<RemindersView />)

    expect(await screen.findByText('No schedules yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New reminder' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New lookout' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New automation' })).toBeInTheDocument()
  })
})
