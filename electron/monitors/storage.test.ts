import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

const electronMock = vi.hoisted(() => ({ userDataPath: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.userDataPath),
  },
}))

describe('scheduled task storage', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-16T12:00:00.000Z'))
    electronMock.userDataPath = await mkdtemp(path.join(os.tmpdir(), 'zura-scheduled-tasks-'))
  })

  afterEach(async () => {
    vi.useRealTimers()
    await rm(electronMock.userDataPath, { recursive: true, force: true })
  })

  it('defaults the repeat interval when a concrete dueAt is provided', async () => {
    const { createScheduledTask, sanitizeScheduledTaskInput } = await import('./storage')
    const dueAt = Date.now() + 60_000
    const input = sanitizeScheduledTaskInput({
      type: 'reminder',
      title: 'One minute test',
      reminderText: 'This should fire in one minute.',
      dueAt,
    })

    const task = await createScheduledTask(input)

    expect(task.intervalPreset).toBe('30m')
    expect(task.nextRunAt).toBe(dueAt)
  })

  it('normalizes epoch-second dueAt values to milliseconds', async () => {
    const { sanitizeScheduledTaskInput } = await import('./storage')
    const dueAtSeconds = Math.floor((Date.now() + 60_000) / 1000)

    const input = sanitizeScheduledTaskInput({
      type: 'reminder',
      title: 'Epoch seconds test',
      reminderText: 'This should normalize.',
      dueAt: dueAtSeconds,
    })

    expect(input.dueAt).toBe(dueAtSeconds * 1000)
  })

  it('accepts one-minute recurring intervals for lookouts', async () => {
    const { createScheduledTask, updateScheduledTask, sanitizeScheduledTaskInput } =
      await import('./storage')

    const task = await createScheduledTask(
      sanitizeScheduledTaskInput({
        type: 'web_lookout',
        title: 'Fast lookout',
        urls: ['https://example.com/status'],
        instructions: 'Watch for status changes.',
        intervalPreset: '1m',
      })
    )

    expect(task.intervalPreset).toBe('1m')
    expect(task.nextRunAt).toBe(Date.now() + 60_000)

    const updated = await updateScheduledTask(
      task.id,
      sanitizeScheduledTaskInput({ intervalPreset: '30m' }, true)
    )

    expect(updated?.intervalPreset).toBe('30m')
  })

  it('creates AI automations with defaults, context, destinations, and exact schedules', async () => {
    const { createScheduledTask, sanitizeScheduledTaskInput } = await import('./storage')

    const task = await createScheduledTask(
      sanitizeScheduledTaskInput({
        type: 'ai_automation',
        title: 'Morning briefing',
        prompt: 'Summarize my day.',
        schedule: { kind: 'daily', timeOfDay: '08:30' },
        contextSources: [
          { type: 'current_datetime' },
          { type: 'chat', id: 'chat-1', label: 'Planning' },
        ],
        outputDestinations: ['log', 'notification', 'chat', 'artifact'],
        notifyPolicy: 'every_run',
        budgets: { timeoutMs: 45_000, maxWebSearches: 3, maxToolCalls: 4, maxTokens: 900 },
      })
    )

    expect(task.type).toBe('ai_automation')
    expect(task.prompt).toBe('Summarize my day.')
    expect(task.automationMode).toBe('prompt')
    expect(task.approvalMode).toBe('read_only')
    expect(task.schedule).toEqual({ kind: 'daily', timeOfDay: '08:30' })
    expect(task.contextSources).toHaveLength(2)
    expect(task.outputDestinations).toEqual(['log', 'notification', 'chat', 'artifact'])
    expect(task.budgets).toEqual({
      timeoutMs: 45_000,
      maxToolCalls: 4,
      maxWebSearches: 3,
      maxTokens: 900,
    })
    expect(new Date(task.nextRunAt).toISOString()).toBe('2026-06-17T03:00:00.000Z')
  })

  it('uses the schedule timezone for exact daily automations', async () => {
    const { createScheduledTask, sanitizeScheduledTaskInput } = await import('./storage')

    const task = await createScheduledTask(
      sanitizeScheduledTaskInput({
        type: 'ai_automation',
        title: 'New York morning',
        prompt: 'Brief me.',
        schedule: { kind: 'daily', timeOfDay: '08:30', timezone: 'America/New_York' },
      })
    )

    expect(new Date(task.nextRunAt).toISOString()).toBe('2026-06-16T12:30:00.000Z')
  })

  it('clamps interval automations into configured work hours', async () => {
    const { createScheduledTask, sanitizeScheduledTaskInput } = await import('./storage')

    const task = await createScheduledTask(
      sanitizeScheduledTaskInput({
        type: 'ai_automation',
        title: 'Work hours digest',
        prompt: 'Digest files.',
        intervalPreset: '1h',
        schedule: {
          kind: 'interval',
          intervalPreset: '1h',
          timezone: 'Asia/Calcutta',
          workHours: { enabled: true, start: '09:00', end: '18:00' },
        },
      })
    )

    expect(new Date(task.nextRunAt).toISOString()).toBe('2026-06-17T03:30:00.000Z')
  })

  it('keeps weekly work-hours adjustments on selected weekdays', async () => {
    const { createScheduledTask, sanitizeScheduledTaskInput } = await import('./storage')

    const task = await createScheduledTask(
      sanitizeScheduledTaskInput({
        type: 'ai_automation',
        title: 'Weekly work window',
        prompt: 'Summarize the week.',
        schedule: {
          kind: 'weekly',
          weekdays: [2],
          timeOfDay: '20:00',
          timezone: 'Asia/Calcutta',
          workHours: { enabled: true, start: '09:00', end: '18:00' },
        },
      })
    )

    expect(new Date(task.nextRunAt).toISOString()).toBe('2026-06-23T03:30:00.000Z')
  })

  it('defaults AI automations without a fixed interval to agent-owned cadence', async () => {
    const { createScheduledTask, sanitizeScheduledTaskInput, saveScheduledTaskRun, getScheduledTask } =
      await import('./storage')

    const task = await createScheduledTask(
      sanitizeScheduledTaskInput({
        type: 'ai_automation',
        title: 'Free-running news',
        prompt: 'Summarize AI news.',
      })
    )

    expect(task.schedule).toEqual({ kind: 'agent', intervalPreset: '30m' })
    expect(task.nextRunAt).toBe(Date.now())

    await saveScheduledTaskRun(
      task,
      {
        id: 'run-agent-1',
        taskId: task.id,
        startedAt: Date.now(),
        finishedAt: Date.now() + 1000,
        status: 'unchanged',
        logs: [],
        outputText: 'Latest AI news…\n\n[[next_run:+2h]]',
      },
      [],
      { nextRunInMs: 2 * 60 * 60 * 1000 }
    )

    const saved = await getScheduledTask(task.id)
    expect(saved?.enabled).toBe(true)
    expect(saved?.nextRunAt).toBe(Date.now() + 1000 + 2 * 60 * 60 * 1000)
    expect(saved?.lastRunAt).toBe(Date.now() + 1000)
  })

  it('uses a fixed interval schedule when intervalPreset is explicit', async () => {
    const { createScheduledTask, sanitizeScheduledTaskInput } = await import('./storage')

    const task = await createScheduledTask(
      sanitizeScheduledTaskInput({
        type: 'ai_automation',
        title: 'Fixed cadence',
        prompt: 'Ping every hour.',
        intervalPreset: '1h',
      })
    )

    expect(task.schedule).toEqual({ kind: 'interval', intervalPreset: '1h' })
    expect(task.nextRunAt).toBe(Date.now() + 60 * 60 * 1000)
  })

  it('treats AI automation dueAt as a one-off schedule and disables after running', async () => {
    const {
      createScheduledTask,
      getScheduledTask,
      getRun,
      sanitizeScheduledTaskInput,
      saveScheduledTaskRun,
    } = await import('./storage')
    const dueAt = Date.now() + 60_000

    const task = await createScheduledTask(
      sanitizeScheduledTaskInput({
        type: 'ai_automation',
        title: 'One-off automation',
        prompt: 'Run once.',
        dueAt,
      })
    )

    expect(task.schedule).toEqual({ kind: 'once' })
    expect(task.nextRunAt).toBe(dueAt)

    await saveScheduledTaskRun(
      {
        ...task,
        nextRunAt: dueAt,
      },
      {
        id: 'run-1',
        taskId: task.id,
        startedAt: dueAt,
        finishedAt: dueAt + 1000,
        status: 'unchanged',
        logs: [],
        automationChatSessionId: 'automation-chat-run-1',
      },
      []
    )

    const saved = await getScheduledTask(task.id)
    expect(saved?.enabled).toBe(false)
    const savedRun = await getRun('run-1')
    expect(savedRun?.automationChatSessionId).toBe('automation-chat-run-1')
  })

  it('rejects invalid AI automation payloads', async () => {
    const { sanitizeScheduledTaskInput } = await import('./storage')

    expect(() =>
      sanitizeScheduledTaskInput({
        type: 'ai_automation',
        title: 'Missing prompt',
      })
    ).toThrow('Automation prompt is required')

    expect(() =>
      sanitizeScheduledTaskInput({
        type: 'ai_automation',
        title: 'Bad schedule',
        prompt: 'Run this',
        schedule: { kind: 'daily', timeOfDay: '25:99' },
      })
    ).toThrow('Invalid automation schedule')

    expect(() =>
      sanitizeScheduledTaskInput({
        type: 'ai_automation',
        title: 'Bad timezone',
        prompt: 'Run this',
        schedule: { kind: 'daily', timeOfDay: '09:00', timezone: 'Mars/Base' },
      })
    ).toThrow('Invalid automation schedule')
  })
})
