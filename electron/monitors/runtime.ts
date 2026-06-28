import {
  BrowserWindow,
  Notification,
  ipcMain,
  type IpcMain,
  type NotificationConstructorOptions,
  type WebContents,
} from 'electron'
import { randomUUID } from 'crypto'
import { fetchMonitorPage, buildChangedExcerpt } from './content'
import { getMonitorIntervalMs } from './schedule'
import {
  getScheduledTask,
  getSnapshotsForTask,
  listScheduledTasks,
  saveScheduledTaskRun,
} from './storage'
import type {
  ScheduledTaskDefinition,
  ScheduledTaskRun,
  ScheduledTaskSnapshot,
  ScheduledTaskSummaryRequest,
  ScheduledTaskSummaryResponse,
  ScheduledTaskLog,
} from './types'
import { sendScheduledTaskEmail } from '../notifications/email'

const SUMMARY_TIMEOUT_MS = 45_000
const NOTIFICATION_BODY_LIMIT = 240

function logMonitorWarning(message: string): void {
  console.warn(`[scheduled-tasks] ${message}`)
}

interface PendingSummary {
  resolve: (value: string) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface MonitorRuntimeDeps {
  fetchImpl?: typeof fetch
  setTimeoutImpl?: typeof setTimeout
  clearTimeoutImpl?: typeof clearTimeout
  now?: () => number
  notificationsSupported?: () => boolean
  notificationFactory?: (options: NotificationConstructorOptions) => ScheduledTaskNotification
  emailSender?: (task: ScheduledTaskDefinition, run: ScheduledTaskRun) => Promise<{ ok: boolean; error?: string; skipped?: boolean }>
}

interface ScheduledTaskNotification {
  show: () => void
  on: (event: 'click', listener: () => void) => ScheduledTaskNotification
}

interface MonitorRuntime {
  start: () => Promise<void>
  stop: () => void
  reschedule: () => Promise<void>
  runNow: (taskId: string) => Promise<ScheduledTaskRun>
  setExtensionEnabled: (enabled: boolean) => Promise<void>
  isExtensionEnabled: () => boolean
}

function buildDiffSummary(task: ScheduledTaskDefinition, changedResults: ScheduledTaskLog[]): string {
  const lines = [`${task.title}: ${changedResults.length} monitored page(s) changed.`]
  for (const result of changedResults) {
    lines.push(`- ${result.url}`)
    if (result.changedExcerpt) lines.push(result.changedExcerpt)
  }
  return lines.join('\n\n').slice(0, 6000)
}

function buildSummaryRequest(
  task: ScheduledTaskDefinition,
  diffSummary: string,
  changedResults: ScheduledTaskLog[]
): ScheduledTaskSummaryRequest {
  return {
    requestId: randomUUID(),
    taskId: task.id,
    taskTitle: task.title,
    instructions: task.instructions,
    diffSummary,
    changes: changedResults.map((result) => ({
      url: result.url,
      excerpt: result.changedExcerpt || '',
    })),
  }
}

function findSummaryTarget(): WebContents | null {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue
    return window.webContents
  }
  return null
}

function compactNotificationBody(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, NOTIFICATION_BODY_LIMIT)
}

function buildNotificationOptions(
  task: ScheduledTaskDefinition,
  run: ScheduledTaskRun
): NotificationConstructorOptions | null {
  if (task.type === 'reminder') {
    const body = compactNotificationBody(task.reminderText || task.instructions || run.logs[0]?.message || task.title)
    return {
      title: `Reminder: ${task.title}`,
      body: body || 'Scheduled reminder is due.',
    }
  }

  if (task.type === 'web_lookout' && run.status === 'changed') {
    const changedUrls = run.logs
      .filter((log) => log.status === 'changed' && log.url)
      .map((log) => log.url)
    const body =
      compactNotificationBody(run.aiSummary || run.diffSummary || changedUrls.join(', ')) ||
      `${changedUrls.length || 1} watched page changed.`
    return {
      title: `Lookout changed: ${task.title}`,
      body,
    }
  }

  return null
}

function focusAppWindow(): void {
  const target = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())
  if (!target) return
  if (target.isMinimized()) target.restore()
  target.show()
  target.focus()
}

function createRuntime(deps: MonitorRuntimeDeps = {}): MonitorRuntime {
  const fetchImpl = deps.fetchImpl ?? fetch
  const setTimeoutFn = deps.setTimeoutImpl ?? setTimeout
  const clearTimeoutFn = deps.clearTimeoutImpl ?? clearTimeout
  const now = deps.now ?? Date.now
  const notificationsSupported = deps.notificationsSupported ?? (() => Notification.isSupported())
  const notificationFactory = deps.notificationFactory ?? ((options) => new Notification(options))
  const emailSender = deps.emailSender ?? sendScheduledTaskEmail
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const running = new Set<string>()
  const pendingSummaries = new Map<string, PendingSummary>()
  let extensionEnabled = false

  const requestAiSummary = (request: ScheduledTaskSummaryRequest): Promise<string> => {
    const target = findSummaryTarget()
    if (!target) {
      return Promise.reject(new Error('No renderer is available to summarize monitor changes.'))
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeoutFn(() => {
        pendingSummaries.delete(request.requestId)
        reject(new Error('AI summary timed out.'))
      }, SUMMARY_TIMEOUT_MS)
      pendingSummaries.set(request.requestId, { resolve, reject, timer })
      target.send('scheduled-tasks:summary-request', request)
    })
  }

  const runTask = async (task: ScheduledTaskDefinition): Promise<ScheduledTaskRun> => {
    if (running.has(task.id)) {
      throw new Error('Scheduled task is already running')
    }
    running.add(task.id)
    const startedAt = now()
    const previousSnapshots = await getSnapshotsForTask(task.id)
    const previousByUrl = new Map(previousSnapshots.map((snapshot) => [snapshot.url, snapshot]))
    const logs: ScheduledTaskLog[] = []
    const nextSnapshots: ScheduledTaskSnapshot[] = []

    try {
      if (task.type === 'reminder') {
        logs.push({
          url: '',
          status: 'completed',
          message: task.reminderText || task.instructions || task.title,
        })
      }

      for (const url of task.type === 'web_lookout' ? task.urls : []) {
        try {
          const page = await fetchMonitorPage(url, fetchImpl)
          const previous = previousByUrl.get(url)
          const status = !previous
            ? 'baseline'
            : previous.contentHash === page.contentHash
              ? 'unchanged'
              : 'changed'
          const changedExcerpt =
            status === 'changed'
              ? buildChangedExcerpt(previous?.normalizedTextExcerpt, page.normalizedText)
              : undefined
          logs.push({
            url,
            status,
            contentHash: page.contentHash,
            previousHash: previous?.contentHash,
            ...(changedExcerpt ? { changedExcerpt } : {}),
          })
          nextSnapshots.push({
            taskId: task.id,
            url,
            contentHash: page.contentHash,
            normalizedTextExcerpt: page.excerpt,
            capturedAt: now(),
          })
        } catch (error) {
          logs.push({
            url,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      const changedResults = logs.filter((result) => result.status === 'changed')
      const errorResults = logs.filter((result) => result.status === 'error')
      const diffSummary = changedResults.length > 0 ? buildDiffSummary(task, changedResults) : undefined
      let aiSummary: string | undefined
      let summaryError: string | undefined

      if (diffSummary) {
        try {
          aiSummary = await requestAiSummary(buildSummaryRequest(task, diffSummary, changedResults))
        } catch (error) {
          summaryError = error instanceof Error ? error.message : String(error)
        }
      }

      const finishedAt = now()
      const run: ScheduledTaskRun = {
        id: randomUUID(),
        taskId: task.id,
        startedAt,
        finishedAt,
        status: changedResults.length > 0 ? 'changed' : errorResults.length > 0 ? 'error' : 'unchanged',
        logs,
        ...(diffSummary ? { diffSummary } : {}),
        ...(aiSummary ? { aiSummary } : {}),
        ...(summaryError || errorResults.length > 0
          ? { error: summaryError || `${errorResults.length} URL(s) failed.` }
          : {}),
      }
      await appendEmailNotificationLog(task, run)
      await saveScheduledTaskRun(task, run, nextSnapshots)
      void reschedule()
      broadcastChanged()
      showRunNotification(task, run)
      return run
    } finally {
      running.delete(task.id)
    }
  }

  const appendEmailNotificationLog = async (
    task: ScheduledTaskDefinition,
    run: ScheduledTaskRun
  ): Promise<void> => {
    try {
      const result = await emailSender(task, run)
      if (result.skipped) return
      if (result.ok) {
        run.logs.push({
          url: '',
          status: 'completed',
          message: 'Email notification sent.',
        })
        return
      }
      run.logs.push({
        url: '',
        status: 'error',
        error: result.error || 'Email notification failed.',
      })
    } catch (error) {
      run.logs.push({
        url: '',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const showRunNotification = (task: ScheduledTaskDefinition, run: ScheduledTaskRun): void => {
    const options = buildNotificationOptions(task, run)
    if (!options) return

    try {
      if (!notificationsSupported()) return
      const notification = notificationFactory(options)
      notification.on('click', focusAppWindow)
      notification.show()
    } catch (error) {
      logMonitorWarning(`notification failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const scheduleTask = (task: ScheduledTaskDefinition) => {
    const existing = timers.get(task.id)
    if (existing) clearTimeoutFn(existing)
    timers.delete(task.id)
    if (!extensionEnabled) return
    if (!task.enabled) return

    const delay = Math.max(0, Math.min(task.nextRunAt - now(), getMonitorIntervalMs(task.intervalPreset)))
    const timer = setTimeoutFn(() => {
      timers.delete(task.id)
      void getScheduledTask(task.id)
        .then((freshTask) => {
          if (!extensionEnabled) return undefined
          if (!freshTask?.enabled) return undefined
          return runTask(freshTask)
        })
        .catch((error) => {
          logMonitorWarning(`scheduled task failed: ${error instanceof Error ? error.message : String(error)}`)
        })
    }, delay)
    timers.set(task.id, timer)
  }

  const reschedule = async () => {
    for (const timer of timers.values()) clearTimeoutFn(timer)
    timers.clear()
    if (!extensionEnabled) return
    const tasks = await listScheduledTasks()
    for (const task of tasks) scheduleTask(task)
  }

  const start = async () => {
    if (!extensionEnabled) return
    await reschedule()
    const due = (await listScheduledTasks()).filter((task) => task.enabled && task.nextRunAt <= now())
    for (const task of due) {
      void runTask(task).catch((error) => {
        logMonitorWarning(`startup scheduled task failed: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
  }

  const stop = () => {
    for (const timer of timers.values()) clearTimeoutFn(timer)
    timers.clear()
    for (const [requestId, pending] of pendingSummaries) {
      clearTimeoutFn(pending.timer)
      pending.reject(new Error('Monitor runtime stopped.'))
      pendingSummaries.delete(requestId)
    }
  }

  const runNow = async (taskId: string): Promise<ScheduledTaskRun> => {
    if (!extensionEnabled) throw new Error('Reminders & Lookouts extension is disabled')
    const task = await getScheduledTask(taskId)
    if (!task) throw new Error('Scheduled task not found')
    return runTask(task)
  }

  const setExtensionEnabled = async (enabled: boolean): Promise<void> => {
    const nextEnabled = enabled === true
    if (extensionEnabled === nextEnabled) return
    extensionEnabled = nextEnabled
    await reschedule()
  }

  const isExtensionEnabled = (): boolean => extensionEnabled

  ipcMain.handle('scheduled-tasks:resolve-summary', (_event, response: ScheduledTaskSummaryResponse) => {
    if (!response || typeof response !== 'object' || typeof response.requestId !== 'string') {
      return false
    }
    const pending = pendingSummaries.get(response.requestId)
    if (!pending) return false
    pendingSummaries.delete(response.requestId)
    clearTimeoutFn(pending.timer)
    if (typeof response.summary === 'string' && response.summary.trim()) {
      pending.resolve(response.summary.trim())
    } else {
      pending.reject(new Error(typeof response.error === 'string' ? response.error : 'AI summary failed.'))
    }
    return true
  })

  return { start, stop, reschedule, runNow, setExtensionEnabled, isExtensionEnabled }
}

function broadcastChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    window.webContents.send('scheduled-tasks:changed')
  }
}

let activeRuntime: MonitorRuntime | null = null

export async function startMonitorRuntime(deps?: MonitorRuntimeDeps): Promise<MonitorRuntime> {
  if (activeRuntime) return activeRuntime
  activeRuntime = createRuntime(deps)
  await activeRuntime.start()
  return activeRuntime
}

export function getMonitorRuntime(): MonitorRuntime | null {
  return activeRuntime
}

export function isMonitorRuntimeExtensionEnabled(): boolean {
  return activeRuntime?.isExtensionEnabled() === true
}

export async function setMonitorRuntimeExtensionEnabled(enabled: boolean): Promise<void> {
  const runtime = activeRuntime ?? await startMonitorRuntime()
  await runtime.setExtensionEnabled(enabled)
}

export function stopMonitorRuntime(ipc: IpcMain = ipcMain): void {
  if (!activeRuntime) return
  activeRuntime.stop()
  activeRuntime = null
  ipc.removeHandler('scheduled-tasks:resolve-summary')
}

export const __test__ = {
  createRuntime,
  buildDiffSummary,
  buildNotificationOptions,
}
