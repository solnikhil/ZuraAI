import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduledTaskDefinition, ScheduledTaskRun, ScheduledTaskSnapshot } from './types'

const electronMock = vi.hoisted(() => ({
  windows: [] as Array<{
    isDestroyed: ReturnType<typeof vi.fn>
    isMinimized: ReturnType<typeof vi.fn>
    restore: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    webContents: {
      isDestroyed: ReturnType<typeof vi.fn>
      send: ReturnType<typeof vi.fn>
    }
  }>,
  ipcHandle: vi.fn(),
  ipcRemoveHandler: vi.fn(),
}))

const storageMock = vi.hoisted(() => ({
  task: null as ScheduledTaskDefinition | null,
  snapshots: [] as ScheduledTaskSnapshot[],
  savedRuns: [] as ScheduledTaskRun[],
  getScheduledTask: vi.fn(async (id: string) =>
    storageMock.task?.id === id ? storageMock.task : null
  ),
  getSnapshotsForTask: vi.fn(async () => storageMock.snapshots),
  listScheduledTasks: vi.fn(async () => (storageMock.task ? [storageMock.task] : [])),
  listRuns: vi.fn(async () => storageMock.savedRuns),
  saveScheduledTaskRun: vi.fn(async (_task: ScheduledTaskDefinition, run: ScheduledTaskRun) => {
    storageMock.savedRuns.push(run)
  }),
}))

const contentMock = vi.hoisted(() => ({
  page: {
    contentHash: 'next-hash',
    normalizedText: 'new readable content',
    excerpt: 'new readable content',
  },
  fetchMonitorPage: vi.fn(async () => contentMock.page),
  buildChangedExcerpt: vi.fn(() => 'Changed text excerpt'),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => electronMock.windows,
  },
  ipcMain: {
    handle: electronMock.ipcHandle,
    removeHandler: electronMock.ipcRemoveHandler,
  },
  Notification: class Notification {
    static isSupported(): boolean {
      return true
    }
  },
}))

vi.mock('./storage', () => ({
  getScheduledTask: storageMock.getScheduledTask,
  getSnapshotsForTask: storageMock.getSnapshotsForTask,
  listScheduledTasks: storageMock.listScheduledTasks,
  listRuns: storageMock.listRuns,
  saveScheduledTaskRun: storageMock.saveScheduledTaskRun,
}))

vi.mock('./content', () => ({
  fetchMonitorPage: contentMock.fetchMonitorPage,
  buildChangedExcerpt: contentMock.buildChangedExcerpt,
}))

vi.mock('../notifications/email', () => ({
  sendScheduledTaskEmail: vi.fn(async () => ({ ok: true, skipped: true })),
}))

describe('scheduled task runtime notifications', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    storageMock.task = null
    storageMock.snapshots = []
    storageMock.savedRuns = []
    electronMock.windows = []
  })

  it('shows an OS notification when a reminder runs', async () => {
    const { __test__ } = await import('./runtime')
    const show = vi.fn()
    const on = vi.fn(() => ({ show, on }))
    const notificationFactory = vi.fn(() => ({ show, on }))
    storageMock.task = createTask({
      type: 'reminder',
      reminderText: 'Review weekly launches',
    })

    const runtime = __test__.createRuntime({
      notificationsSupported: () => true,
      notificationFactory,
      setTimeoutImpl: vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>),
      clearTimeoutImpl: vi.fn(),
      now: () => 1_000,
    })

    await runtime.setExtensionEnabled(true)
    await runtime.runNow('task-1')
    runtime.stop()

    expect(notificationFactory).toHaveBeenCalledWith({
      title: 'Reminder: Review weekly launches',
      body: 'Review weekly launches',
    })
    expect(show).toHaveBeenCalledTimes(1)
    expect(storageMock.savedRuns[0]?.logs[0]?.status).toBe('completed')
  })

  it('shows an OS notification when a lookout detects changed content', async () => {
    const { __test__ } = await import('./runtime')
    const show = vi.fn()
    const on = vi.fn(() => ({ show, on }))
    const notificationFactory = vi.fn(() => ({ show, on }))
    storageMock.task = createTask({
      type: 'web_lookout',
      urls: ['https://example.com/pricing'],
    })
    storageMock.snapshots = [
      {
        taskId: 'task-1',
        url: 'https://example.com/pricing',
        contentHash: 'old-hash',
        normalizedTextExcerpt: 'old readable content',
        capturedAt: 500,
      },
    ]

    const runtime = __test__.createRuntime({
      notificationsSupported: () => true,
      notificationFactory,
      setTimeoutImpl: vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>),
      clearTimeoutImpl: vi.fn(),
      now: () => 1_000,
    })

    await runtime.setExtensionEnabled(true)
    await runtime.runNow('task-1')
    runtime.stop()

    expect(notificationFactory).toHaveBeenCalledWith({
      title: 'Lookout changed: Review weekly launches',
      body: 'Review weekly launches: 1 monitored page(s) changed. - https://example.com/pricing Changed text excerpt',
    })
    expect(show).toHaveBeenCalledTimes(1)
    expect(storageMock.savedRuns[0]?.status).toBe('changed')
  })

  it('does not notify for a lookout baseline run', async () => {
    const { __test__ } = await import('./runtime')
    const notificationFactory = vi.fn()
    storageMock.task = createTask({
      type: 'web_lookout',
      urls: ['https://example.com/pricing'],
    })

    const runtime = __test__.createRuntime({
      notificationsSupported: () => true,
      notificationFactory,
      setTimeoutImpl: vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>),
      clearTimeoutImpl: vi.fn(),
      now: () => 1_000,
    })

    await runtime.setExtensionEnabled(true)
    await runtime.runNow('task-1')
    runtime.stop()

    expect(notificationFactory).not.toHaveBeenCalled()
    expect(storageMock.savedRuns[0]?.logs[0]?.status).toBe('baseline')
  })

  it('sends an email notification when a reminder runs', async () => {
    const { __test__ } = await import('./runtime')
    const emailSender = vi.fn(async () => ({ ok: true }))
    storageMock.task = createTask({
      type: 'reminder',
      reminderText: 'Review weekly launches',
    })

    const runtime = __test__.createRuntime({
      emailSender,
      notificationsSupported: () => false,
      setTimeoutImpl: vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>),
      clearTimeoutImpl: vi.fn(),
      now: () => 1_000,
    })

    await runtime.setExtensionEnabled(true)
    await runtime.runNow('task-1')
    runtime.stop()

    expect(emailSender).toHaveBeenCalledWith(
      storageMock.task,
      expect.objectContaining({
        taskId: 'task-1',
        status: 'unchanged',
      })
    )
    expect(storageMock.savedRuns[0]?.logs).toContainEqual({
      url: '',
      status: 'completed',
      message: 'Email notification sent.',
    })
  })

  it('records email failures without blocking a scheduled task run', async () => {
    const { __test__ } = await import('./runtime')
    const emailSender = vi.fn(async () => ({
      ok: false,
      error: 'Brevo email request failed (401)',
    }))
    storageMock.task = createTask({
      type: 'reminder',
      reminderText: 'Review weekly launches',
    })

    const runtime = __test__.createRuntime({
      emailSender,
      notificationsSupported: () => false,
      setTimeoutImpl: vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>),
      clearTimeoutImpl: vi.fn(),
      now: () => 1_000,
    })

    await runtime.setExtensionEnabled(true)
    await expect(runtime.runNow('task-1')).resolves.toEqual(
      expect.objectContaining({
        taskId: 'task-1',
      })
    )
    runtime.stop()

    expect(storageMock.saveScheduledTaskRun).toHaveBeenCalledTimes(1)
    expect(storageMock.savedRuns[0]?.logs).toContainEqual({
      url: '',
      status: 'error',
      error: 'Brevo email request failed (401)',
    })
  })

  it('does not send email when the email sender reports the run was skipped', async () => {
    const { __test__ } = await import('./runtime')
    const emailSender = vi.fn(async () => ({ ok: true, skipped: true }))
    storageMock.task = createTask({
      type: 'web_lookout',
      urls: ['https://example.com/pricing'],
    })

    const runtime = __test__.createRuntime({
      emailSender,
      notificationsSupported: () => false,
      setTimeoutImpl: vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>),
      clearTimeoutImpl: vi.fn(),
      now: () => 1_000,
    })

    await runtime.setExtensionEnabled(true)
    await runtime.runNow('task-1')
    runtime.stop()

    expect(emailSender).toHaveBeenCalledTimes(1)
    expect(storageMock.savedRuns[0]?.logs).not.toContainEqual(
      expect.objectContaining({ message: 'Email notification sent.' })
    )
  })

  it('does not schedule tasks while the extension is disabled', async () => {
    const { __test__ } = await import('./runtime')
    const setTimeoutImpl = vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>)
    const clearTimeoutImpl = vi.fn()
    storageMock.task = createTask({})

    const runtime = __test__.createRuntime({
      setTimeoutImpl,
      clearTimeoutImpl,
      now: () => 1_000,
    })

    await runtime.reschedule()
    await expect(runtime.runNow('task-1')).rejects.toThrow(
      'Reminders & Lookouts extension is disabled'
    )
    runtime.stop()

    expect(setTimeoutImpl).not.toHaveBeenCalled()
    expect(storageMock.saveScheduledTaskRun).not.toHaveBeenCalled()
  })

  it('runs overdue tasks once after the startup catch-up delay when the extension is restored', async () => {
    const { __test__ } = await import('./runtime')
    let startupCatchUp: (() => void) | null = null
    const setTimeoutImpl = vi.fn((callback: () => void) => {
      startupCatchUp = callback
      return 1 as unknown as ReturnType<typeof setTimeout>
    })
    storageMock.task = createTask({
      type: 'reminder',
      reminderText: 'Review weekly launches',
      nextRunAt: 500,
    })

    const runtime = __test__.createRuntime({
      notificationsSupported: () => false,
      setTimeoutImpl,
      clearTimeoutImpl: vi.fn(),
      now: () => 1_000,
    })

    await runtime.start()
    expect(storageMock.saveScheduledTaskRun).not.toHaveBeenCalled()

    await runtime.setExtensionEnabled(true)
    expect(storageMock.saveScheduledTaskRun).not.toHaveBeenCalled()
    expect(setTimeoutImpl).toHaveBeenCalledTimes(1)
    expect(setTimeoutImpl).toHaveBeenCalledWith(expect.any(Function), 180_000)

    startupCatchUp?.()
    await vi.waitFor(() => expect(storageMock.saveScheduledTaskRun).toHaveBeenCalledTimes(1))
    startupCatchUp?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    runtime.stop()

    expect(storageMock.saveScheduledTaskRun).toHaveBeenCalledTimes(1)
    expect(storageMock.savedRuns[0]).toEqual(
      expect.objectContaining({
        taskId: 'task-1',
        status: 'unchanged',
      })
    )
    expect(storageMock.savedRuns[0]?.logs[0]).toEqual({
      url: '',
      status: 'completed',
      message: 'Review weekly launches',
    })
  })

  it('clears scheduled timers when the extension is disabled', async () => {
    const { __test__ } = await import('./runtime')
    const timer = 1 as unknown as ReturnType<typeof setTimeout>
    const setTimeoutImpl = vi.fn(() => timer)
    const clearTimeoutImpl = vi.fn()
    storageMock.task = createTask({ nextRunAt: 2_000 })

    const runtime = __test__.createRuntime({
      setTimeoutImpl,
      clearTimeoutImpl,
      now: () => 1_000,
    })

    await runtime.setExtensionEnabled(true)
    await runtime.setExtensionEnabled(false)
    runtime.stop()

    expect(setTimeoutImpl).toHaveBeenCalledTimes(1)
    expect(clearTimeoutImpl).toHaveBeenCalledWith(timer)
  })

  it('requests renderer execution for AI automations and records the returned output', async () => {
    const { __test__ } = await import('./runtime')
    const webContents = { isDestroyed: vi.fn(() => false), send: vi.fn() }
    electronMock.windows = [
      {
        isDestroyed: vi.fn(() => false),
        isMinimized: vi.fn(() => false),
        restore: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
        webContents,
      },
    ]
    storageMock.task = createTask({
      type: 'ai_automation',
      prompt: 'Summarize my day',
      automationMode: 'watch',
      outputDestinations: ['log', 'notification'],
      notifyPolicy: 'meaningful_change',
    })

    const runtime = __test__.createRuntime({
      notificationsSupported: () => false,
      setTimeoutImpl: vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>),
      clearTimeoutImpl: vi.fn(),
      now: () => 1_000,
    })

    await runtime.setExtensionEnabled(true)
    const runPromise = runtime.runNow('task-1')
    await vi.waitFor(() =>
      expect(webContents.send).toHaveBeenCalledWith(
        'scheduled-tasks:automation-run-request',
        expect.objectContaining({ taskId: 'task-1', prompt: 'Summarize my day' })
      )
    )
    const request = webContents.send.mock.calls[0][1]
    const resolveHandler = electronMock.ipcHandle.mock.calls.find(
      ([channel]) => channel === 'scheduled-tasks:resolve-automation-run'
    )?.[1]
    expect(resolveHandler).toBeDefined()
    resolveHandler(
      {},
      {
        requestId: request.requestId,
        outputText: 'Briefing output',
        automationChatSessionId: 'automation-task-1-request-1',
        model: 'openrouter/fake-model',
        provider: 'openrouter',
        changeVerdict: { changed: true, summary: 'Important change' },
        deliveryStatus: { log: 'sent', chat: 'sent' },
      }
    )

    await expect(runPromise).resolves.toEqual(
      expect.objectContaining({
        taskId: 'task-1',
        status: 'changed',
        outputText: 'Briefing output',
        automationChatSessionId: 'automation-task-1-request-1',
        deliveryStatus: expect.objectContaining({ chat: 'sent' }),
      })
    )
    runtime.stop()
  })

  it('records an error run when no renderer is available for AI automations', async () => {
    const { __test__ } = await import('./runtime')
    storageMock.task = createTask({
      type: 'ai_automation',
      prompt: 'Summarize my day',
      automationMode: 'prompt',
    })

    const runtime = __test__.createRuntime({
      notificationsSupported: () => false,
      setTimeoutImpl: vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>),
      clearTimeoutImpl: vi.fn(),
      now: () => 1_000,
    })

    await runtime.setExtensionEnabled(true)
    const run = await runtime.runNow('task-1')
    runtime.stop()

    expect(run.status).toBe('error')
    expect(run.error).toBe('No renderer is available to run AI automation.')
    expect(storageMock.saveScheduledTaskRun).toHaveBeenCalledTimes(1)
  })
})

function createTask(patch: Partial<ScheduledTaskDefinition>): ScheduledTaskDefinition {
  return {
    id: 'task-1',
    type: 'reminder',
    title: 'Review weekly launches',
    enabled: true,
    urls: [],
    instructions: '',
    intervalPreset: 'daily',
    createdAt: 0,
    updatedAt: 0,
    nextRunAt: 2_000,
    ...patch,
  }
}
