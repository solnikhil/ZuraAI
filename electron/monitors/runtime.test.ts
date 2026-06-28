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
  getScheduledTask: vi.fn(async (id: string) => (storageMock.task?.id === id ? storageMock.task : null)),
  getSnapshotsForTask: vi.fn(async () => storageMock.snapshots),
  listScheduledTasks: vi.fn(async () => (storageMock.task ? [storageMock.task] : [])),
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

    expect(emailSender).toHaveBeenCalledWith(storageMock.task, expect.objectContaining({
      taskId: 'task-1',
      status: 'unchanged',
    }))
    expect(storageMock.savedRuns[0]?.logs).toContainEqual({
      url: '',
      status: 'completed',
      message: 'Email notification sent.',
    })
  })

  it('records email failures without blocking a scheduled task run', async () => {
    const { __test__ } = await import('./runtime')
    const emailSender = vi.fn(async () => ({ ok: false, error: 'Brevo email request failed (401)' }))
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
    await expect(runtime.runNow('task-1')).resolves.toEqual(expect.objectContaining({
      taskId: 'task-1',
    }))
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
    await expect(runtime.runNow('task-1')).rejects.toThrow('Reminders & Lookouts extension is disabled')
    runtime.stop()

    expect(setTimeoutImpl).not.toHaveBeenCalled()
    expect(storageMock.saveScheduledTaskRun).not.toHaveBeenCalled()
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
    nextRunAt: 0,
    ...patch,
  }
}
