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
  listRuns,
  listScheduledTasks,
  saveScheduledTaskRun,
} from './storage'
import type {
  ScheduledAutomationRunRequest,
  ScheduledAutomationRunResponse,
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
const STARTUP_OVERDUE_CATCH_UP_DELAY_MS = 180_000

function logMonitorWarning(message: string): void {
  console.warn(`[scheduled-tasks] ${message}`)
}

interface PendingSummary {
  resolve: (value: string) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface PendingAutomationRun {
  resolve: (value: ScheduledAutomationRunResponse) => void
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
  emailSender?: (
    task: ScheduledTaskDefinition,
    run: ScheduledTaskRun
  ) => Promise<{ ok: boolean; error?: string; skipped?: boolean }>
  startupOverdueCatchUpDelayMs?: number
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

function buildDiffSummary(
  task: ScheduledTaskDefinition,
  changedResults: ScheduledTaskLog[]
): string {
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
  const candidates = BrowserWindow.getAllWindows().filter((window) => {
    return !window.isDestroyed() && !window.webContents.isDestroyed()
  })
  const mainRenderer = candidates.find((window) => {
    const getURL = (window.webContents as WebContents & { getURL?: () => string }).getURL
    const url = typeof getURL === 'function' ? getURL.call(window.webContents) : ''
    if (!url) return false
    if (url.startsWith('data:') || url.includes('#/about') || url.includes('#/command-center'))
      return false
    return (
      url.includes('#/dashboard') ||
      url.includes('#/chat') ||
      url.endsWith('/index.html') ||
      url.endsWith('/')
    )
  })
  if (mainRenderer) {
    return mainRenderer.webContents
  }
  return candidates[0]?.webContents ?? null
}

const findAutomationRunTarget = findSummaryTarget

function compactNotificationBody(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, NOTIFICATION_BODY_LIMIT)
}

function buildNotificationOptions(
  task: ScheduledTaskDefinition,
  run: ScheduledTaskRun
): NotificationConstructorOptions | null {
  if (task.type === 'reminder') {
    const body = compactNotificationBody(
      task.reminderText || task.instructions || run.logs[0]?.message || task.title
    )
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

  if (task.type === 'ai_automation') {
    const notifyPolicy = task.notifyPolicy ?? 'every_run'
    const destinations = task.outputDestinations ?? ['log']
    if (!destinations.includes('notification')) return null
    if (notifyPolicy === 'error_only' && run.status !== 'error') return null
    if (notifyPolicy === 'meaningful_change' && run.status !== 'changed') return null
    const body =
      compactNotificationBody(
        run.changeVerdict?.summary || run.aiSummary || run.outputText || run.error
      ) || 'Scheduled AI automation finished.'
    return {
      title: `${run.status === 'error' ? 'Automation failed' : 'Automation'}: ${task.title}`,
      body,
    }
  }

  return null
}

function compactAutomationText(value: string | undefined, limit = 12000): string | undefined {
  const text = (value || '').trim()
  return text ? text.slice(0, limit) : undefined
}

function sanitizeGeneratedFiles(
  files: ScheduledAutomationRunResponse['generatedFiles']
): ScheduledAutomationRunResponse['generatedFiles'] | undefined {
  if (!Array.isArray(files)) return undefined
  const sanitized = files
    .map((file) => {
      if (!file || typeof file !== 'object') return null
      return {
        id: compactAutomationText(typeof file.id === 'string' ? file.id : undefined, 120) || '',
        name:
          compactAutomationText(typeof file.name === 'string' ? file.name : undefined, 200) || '',
        ...(typeof file.type === 'string' && compactAutomationText(file.type, 80)
          ? { type: compactAutomationText(file.type, 80) }
          : {}),
      }
    })
    .filter((file): file is { id: string; name: string; type?: string } =>
      Boolean(file?.id && file.name)
    )
    .slice(0, 20)
  return sanitized.length > 0 ? sanitized : undefined
}

function sanitizeToolCallSummaries(
  summaries: ScheduledAutomationRunResponse['toolCallSummaries']
): ScheduledAutomationRunResponse['toolCallSummaries'] | undefined {
  if (!Array.isArray(summaries)) return undefined
  const sanitized = summaries
    .map((summary) => {
      if (!summary || typeof summary !== 'object') return null
      const name = compactAutomationText(
        typeof summary.name === 'string' ? summary.name : undefined,
        120
      )
      if (!name) return null
      return {
        name,
        success: summary.success === true,
        ...(typeof summary.error === 'string' && compactAutomationText(summary.error, 1000)
          ? { error: compactAutomationText(summary.error, 1000) }
          : {}),
      }
    })
    .filter((summary): summary is { name: string; success: boolean; error?: string } =>
      Boolean(summary)
    )
    .slice(0, 100)
  return sanitized.length > 0 ? sanitized : undefined
}

function sanitizeUsage(
  usage: ScheduledAutomationRunResponse['usage']
): ScheduledAutomationRunResponse['usage'] | undefined {
  if (!usage || typeof usage !== 'object') return undefined
  const sanitized: NonNullable<ScheduledAutomationRunResponse['usage']> = {}
  const inputTokens = Number(usage.inputTokens)
  if (Number.isFinite(inputTokens) && inputTokens >= 0)
    sanitized.inputTokens = Math.round(inputTokens)
  const outputTokens = Number(usage.outputTokens)
  if (Number.isFinite(outputTokens) && outputTokens >= 0)
    sanitized.outputTokens = Math.round(outputTokens)
  const totalTokens = Number(usage.totalTokens)
  if (Number.isFinite(totalTokens) && totalTokens >= 0)
    sanitized.totalTokens = Math.round(totalTokens)
  const cost = Number(usage.cost)
  if (Number.isFinite(cost) && cost >= 0) sanitized.cost = cost
  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

function sanitizeDeliveryStatus(
  status: ScheduledAutomationRunResponse['deliveryStatus']
): ScheduledAutomationRunResponse['deliveryStatus'] | undefined {
  if (!status || typeof status !== 'object') return undefined
  const sanitized: NonNullable<ScheduledAutomationRunResponse['deliveryStatus']> = {}
  for (const destination of ['log', 'notification', 'email', 'chat', 'artifact'] as const) {
    const value = status[destination]
    if (value === 'sent' || value === 'skipped' || value === 'error') {
      sanitized[destination] = value
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

function buildAutomationRequest(
  task: ScheduledTaskDefinition,
  previousOutput?: string
): ScheduledAutomationRunRequest {
  return {
    requestId: randomUUID(),
    taskId: task.id,
    taskTitle: task.title,
    prompt: task.prompt || task.instructions || task.title,
    instructions: task.instructions,
    automationMode: task.automationMode ?? 'prompt',
    contextSources: task.contextSources ?? [],
    allowedTools: task.allowedTools ?? [],
    approvalMode: task.approvalMode ?? 'read_only',
    outputDestinations: task.outputDestinations ?? ['log'],
    notifyPolicy: task.notifyPolicy ?? 'every_run',
    budgets: task.budgets ?? {},
    ...(previousOutput ? { previousOutput } : {}),
  }
}

function sanitizeAutomationResponse(
  response: ScheduledAutomationRunResponse
): ScheduledAutomationRunResponse {
  const generatedFiles = sanitizeGeneratedFiles(response.generatedFiles)
  const toolCallSummaries = sanitizeToolCallSummaries(response.toolCallSummaries)
  const usage = sanitizeUsage(response.usage)
  const deliveryStatus = sanitizeDeliveryStatus(response.deliveryStatus)
  return {
    requestId: response.requestId,
    ...(compactAutomationText(response.outputText)
      ? { outputText: compactAutomationText(response.outputText) }
      : {}),
    ...(compactAutomationText(response.resolvedContextSummary, 4000)
      ? { resolvedContextSummary: compactAutomationText(response.resolvedContextSummary, 4000) }
      : {}),
    ...(compactAutomationText(response.model, 200)
      ? { model: compactAutomationText(response.model, 200) }
      : {}),
    ...(compactAutomationText(response.provider, 80)
      ? { provider: compactAutomationText(response.provider, 80) }
      : {}),
    ...(Array.isArray(response.artifactIds)
      ? {
          artifactIds: response.artifactIds
            .filter((id): id is string => typeof id === 'string')
            .slice(0, 20),
        }
      : {}),
    ...(generatedFiles ? { generatedFiles } : {}),
    ...(toolCallSummaries ? { toolCallSummaries } : {}),
    ...(usage ? { usage } : {}),
    ...(response.changeVerdict && typeof response.changeVerdict === 'object'
      ? {
          changeVerdict: {
            changed: response.changeVerdict.changed === true,
            ...(compactAutomationText(response.changeVerdict.summary, 1000)
              ? { summary: compactAutomationText(response.changeVerdict.summary, 1000) }
              : {}),
          },
        }
      : {}),
    ...(deliveryStatus ? { deliveryStatus } : {}),
    ...(compactAutomationText(response.error, 2000)
      ? { error: compactAutomationText(response.error, 2000) }
      : {}),
  }
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
  const startupOverdueCatchUpDelayMs = Math.max(
    0,
    deps.startupOverdueCatchUpDelayMs ?? STARTUP_OVERDUE_CATCH_UP_DELAY_MS
  )
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const running = new Set<string>()
  const launchedDueKeys = new Set<string>()
  const pendingSummaries = new Map<string, PendingSummary>()
  const pendingAutomationRuns = new Map<string, PendingAutomationRun>()
  let extensionEnabled = false
  let hasScheduledStartupCatchUp = false
  let startupCatchUpTimer: ReturnType<typeof setTimeout> | null = null

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

  const requestAutomationRun = (
    request: ScheduledAutomationRunRequest
  ): Promise<ScheduledAutomationRunResponse> => {
    const target = findAutomationRunTarget()
    if (!target) {
      return Promise.reject(new Error('No renderer is available to run AI automation.'))
    }

    const timeoutMs = Math.max(10_000, Math.min(15 * 60_000, request.budgets.timeoutMs ?? 120_000))
    return new Promise((resolve, reject) => {
      const timer = setTimeoutFn(() => {
        pendingAutomationRuns.delete(request.requestId)
        reject(new Error('AI automation timed out.'))
      }, timeoutMs)
      pendingAutomationRuns.set(request.requestId, { resolve, reject, timer })
      target.send('scheduled-tasks:automation-run-request', request)
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

      if (task.type === 'ai_automation') {
        const previousRun = (await listRuns(task.id)).find(
          (run) => typeof run.outputText === 'string' && run.outputText.trim()
        )
        let automationResponse: ScheduledAutomationRunResponse | undefined
        let automationError: string | undefined
        try {
          automationResponse = sanitizeAutomationResponse(
            await requestAutomationRun(buildAutomationRequest(task, previousRun?.outputText))
          )
        } catch (error) {
          automationError = error instanceof Error ? error.message : String(error)
        }

        const finishedAt = now()
        const changed =
          task.automationMode === 'watch'
            ? automationResponse?.changeVerdict?.changed === true
            : false
        const run: ScheduledTaskRun = {
          id: randomUUID(),
          taskId: task.id,
          startedAt,
          finishedAt,
          status:
            automationError || automationResponse?.error
              ? 'error'
              : changed
                ? 'changed'
                : 'unchanged',
          logs: [
            {
              url: '',
              status: automationError || automationResponse?.error ? 'error' : 'completed',
              ...(automationError || automationResponse?.error
                ? { error: automationError || automationResponse?.error || 'AI automation failed.' }
                : { message: 'AI automation completed.' }),
            },
          ],
          promptSnapshot: task.prompt || task.instructions || task.title,
          ...(automationResponse?.resolvedContextSummary
            ? { resolvedContextSummary: automationResponse.resolvedContextSummary }
            : {}),
          ...(automationResponse?.model ? { model: automationResponse.model } : {}),
          ...(automationResponse?.provider ? { provider: automationResponse.provider } : {}),
          ...(automationResponse?.outputText
            ? {
                outputText: automationResponse.outputText,
                aiSummary: automationResponse.outputText.slice(0, 1000),
              }
            : {}),
          ...(automationResponse?.artifactIds
            ? { artifactIds: automationResponse.artifactIds }
            : {}),
          ...(automationResponse?.generatedFiles
            ? { generatedFiles: automationResponse.generatedFiles }
            : {}),
          ...(automationResponse?.toolCallSummaries
            ? { toolCallSummaries: automationResponse.toolCallSummaries }
            : {}),
          ...(automationResponse?.usage ? { usage: automationResponse.usage } : {}),
          ...(automationResponse?.changeVerdict
            ? { changeVerdict: automationResponse.changeVerdict }
            : {}),
          ...(automationResponse?.deliveryStatus
            ? { deliveryStatus: automationResponse.deliveryStatus }
            : {}),
          ...(automationError || automationResponse?.error
            ? { error: automationError || automationResponse?.error }
            : {}),
        }
        await appendEmailNotificationLog(task, run)
        showRunNotification(task, run)
        await saveScheduledTaskRun(task, run, [])
        void reschedule()
        broadcastChanged()
        return run
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
      const diffSummary =
        changedResults.length > 0 ? buildDiffSummary(task, changedResults) : undefined
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
        status:
          changedResults.length > 0 ? 'changed' : errorResults.length > 0 ? 'error' : 'unchanged',
        logs,
        ...(diffSummary ? { diffSummary } : {}),
        ...(aiSummary ? { aiSummary } : {}),
        ...(summaryError || errorResults.length > 0
          ? { error: summaryError || `${errorResults.length} URL(s) failed.` }
          : {}),
      }
      await appendEmailNotificationLog(task, run)
      showRunNotification(task, run)
      await saveScheduledTaskRun(task, run, nextSnapshots)
      void reschedule()
      broadcastChanged()
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
        if (task.type === 'ai_automation') {
          run.deliveryStatus = { ...run.deliveryStatus, email: 'sent' }
        }
        run.logs.push({
          url: '',
          status: 'completed',
          message: 'Email notification sent.',
        })
        return
      }
      if (task.type === 'ai_automation') {
        run.deliveryStatus = { ...run.deliveryStatus, email: 'error' }
      }
      run.logs.push({
        url: '',
        status: 'error',
        error: result.error || 'Email notification failed.',
      })
    } catch (error) {
      if (task.type === 'ai_automation') {
        run.deliveryStatus = { ...run.deliveryStatus, email: 'error' }
      }
      run.logs.push({
        url: '',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const showRunNotification = (task: ScheduledTaskDefinition, run: ScheduledTaskRun): void => {
    const options = buildNotificationOptions(task, run)
    if (!options) {
      if (task.type === 'ai_automation' && task.outputDestinations?.includes('notification')) {
        run.deliveryStatus = { ...run.deliveryStatus, notification: 'skipped' }
      }
      return
    }

    try {
      if (!notificationsSupported()) {
        if (task.type === 'ai_automation') {
          run.deliveryStatus = { ...run.deliveryStatus, notification: 'skipped' }
        }
        return
      }
      const notification = notificationFactory(options)
      notification.on('click', focusAppWindow)
      notification.show()
      if (task.type === 'ai_automation') {
        run.deliveryStatus = { ...run.deliveryStatus, notification: 'sent' }
      }
    } catch (error) {
      if (task.type === 'ai_automation') {
        run.deliveryStatus = { ...run.deliveryStatus, notification: 'error' }
      }
      logMonitorWarning(
        `notification failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  const scheduleTask = (task: ScheduledTaskDefinition) => {
    const existing = timers.get(task.id)
    if (existing) clearTimeoutFn(existing)
    timers.delete(task.id)
    if (!extensionEnabled) return
    if (!task.enabled) return
    if (task.nextRunAt <= now()) return

    const delay = Math.max(
      0,
      Math.min(task.nextRunAt - now(), getMonitorIntervalMs(task.intervalPreset))
    )
    const timer = setTimeoutFn(() => {
      timers.delete(task.id)
      void getScheduledTask(task.id)
        .then((freshTask) => {
          if (!extensionEnabled) return undefined
          if (!freshTask?.enabled) return undefined
          return runTask(freshTask)
        })
        .catch((error) => {
          logMonitorWarning(
            `scheduled task failed: ${error instanceof Error ? error.message : String(error)}`
          )
        })
    }, delay)
    timers.set(task.id, timer)
  }

  const runDueTasks = (tasks: ScheduledTaskDefinition[], reason: string): void => {
    if (!extensionEnabled) return
    const dueAt = now()
    for (const task of tasks) {
      if (!task.enabled || task.nextRunAt > dueAt) continue
      if (running.has(task.id)) continue
      const dueKey = `${task.id}:${task.nextRunAt}`
      if (launchedDueKeys.has(dueKey)) continue
      launchedDueKeys.add(dueKey)
      const timer = timers.get(task.id)
      if (timer) clearTimeoutFn(timer)
      timers.delete(task.id)
      void runTask(task).catch((error) => {
        logMonitorWarning(`${reason}: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
  }

  const clearStartupCatchUpTimer = (): void => {
    if (!startupCatchUpTimer) return
    clearTimeoutFn(startupCatchUpTimer)
    startupCatchUpTimer = null
  }

  const hasDueTasks = (tasks: ScheduledTaskDefinition[]): boolean => {
    const dueAt = now()
    return tasks.some((task) => task.enabled && task.nextRunAt <= dueAt)
  }

  const scheduleStartupOverdueCatchUp = (tasks: ScheduledTaskDefinition[]): void => {
    if (hasScheduledStartupCatchUp || startupCatchUpTimer) return
    hasScheduledStartupCatchUp = true
    if (!hasDueTasks(tasks)) return
    startupCatchUpTimer = setTimeoutFn(() => {
      startupCatchUpTimer = null
      if (!extensionEnabled) return
      void listScheduledTasks()
        .then((tasks) => runDueTasks(tasks, 'startup overdue scheduled task failed'))
        .catch((error) => {
          logMonitorWarning(
            `startup overdue catch-up failed: ${error instanceof Error ? error.message : String(error)}`
          )
        })
    }, startupOverdueCatchUpDelayMs)
  }

  const reschedule = async (options?: { runOverdue?: boolean }) => {
    for (const timer of timers.values()) clearTimeoutFn(timer)
    timers.clear()
    if (!extensionEnabled) {
      clearStartupCatchUpTimer()
      return
    }
    const tasks = await listScheduledTasks()
    for (const task of tasks) scheduleTask(task)
    if (options?.runOverdue !== false) {
      runDueTasks(tasks, 'overdue scheduled task failed')
    }
  }

  const start = async () => {
    if (!extensionEnabled) return
    await reschedule()
  }

  const stop = () => {
    for (const timer of timers.values()) clearTimeoutFn(timer)
    timers.clear()
    clearStartupCatchUpTimer()
    for (const [requestId, pending] of pendingSummaries) {
      clearTimeoutFn(pending.timer)
      pending.reject(new Error('Monitor runtime stopped.'))
      pendingSummaries.delete(requestId)
    }
    for (const [requestId, pending] of pendingAutomationRuns) {
      clearTimeoutFn(pending.timer)
      pending.reject(new Error('Monitor runtime stopped.'))
      pendingAutomationRuns.delete(requestId)
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
    if (!nextEnabled) {
      clearStartupCatchUpTimer()
      await reschedule()
      return
    }
    const shouldDelayStartupCatchUp = !hasScheduledStartupCatchUp
    await reschedule({ runOverdue: !shouldDelayStartupCatchUp })
    if (shouldDelayStartupCatchUp) {
      const tasks = await listScheduledTasks()
      scheduleStartupOverdueCatchUp(tasks)
    }
  }

  const isExtensionEnabled = (): boolean => extensionEnabled

  ipcMain.handle(
    'scheduled-tasks:resolve-summary',
    (_event, response: ScheduledTaskSummaryResponse) => {
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
        pending.reject(
          new Error(typeof response.error === 'string' ? response.error : 'AI summary failed.')
        )
      }
      return true
    }
  )

  ipcMain.handle(
    'scheduled-tasks:resolve-automation-run',
    (_event, response: ScheduledAutomationRunResponse) => {
      if (!response || typeof response !== 'object' || typeof response.requestId !== 'string') {
        return false
      }
      const pending = pendingAutomationRuns.get(response.requestId)
      if (!pending) return false
      pendingAutomationRuns.delete(response.requestId)
      clearTimeoutFn(pending.timer)
      pending.resolve(sanitizeAutomationResponse(response))
      return true
    }
  )

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
  const runtime = activeRuntime ?? (await startMonitorRuntime())
  await runtime.setExtensionEnabled(enabled)
}

export function stopMonitorRuntime(ipc: IpcMain = ipcMain): void {
  if (!activeRuntime) return
  activeRuntime.stop()
  activeRuntime = null
  ipc.removeHandler('scheduled-tasks:resolve-summary')
  ipc.removeHandler('scheduled-tasks:resolve-automation-run')
}

export const __test__ = {
  createRuntime,
  buildDiffSummary,
  buildNotificationOptions,
}
