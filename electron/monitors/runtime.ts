import { BrowserWindow, Notification, type NotificationConstructorOptions } from 'electron'
import { randomUUID } from 'crypto'
import { fetchMonitorPage, buildChangedExcerpt } from './content'
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
  ScheduledTaskLog,
} from './types'
import { sendScheduledTaskEmail } from '../notifications/email'
import { createRendererTaskBroker } from './rendererBroker'
import {
  buildNotificationOptions,
  createScheduledTaskDelivery,
  type ScheduledTaskNotification,
} from './delivery'
import { createScheduledTaskScheduler } from './scheduler'

const STARTUP_OVERDUE_CATCH_UP_DELAY_MS = 180_000

function logMonitorWarning(message: string): void {
  console.warn(`[scheduled-tasks] ${message}`)
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
  getMainWindow?: () => BrowserWindow | null
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
    ...(compactAutomationText(response.automationChatSessionId, 200)
      ? { automationChatSessionId: compactAutomationText(response.automationChatSessionId, 200) }
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

function focusAppWindow(target: BrowserWindow | null): void {
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
  const resolveMainWindow = deps.getMainWindow ?? (() => null)
  const startupOverdueCatchUpDelayMs = Math.max(
    0,
    deps.startupOverdueCatchUpDelayMs ?? STARTUP_OVERDUE_CATCH_UP_DELAY_MS
  )
  const running = new Set<string>()
  const rendererBroker = createRendererTaskBroker({
    setTimeoutImpl: setTimeoutFn,
    clearTimeoutImpl: clearTimeoutFn,
    sanitizeAutomationResponse,
  })
  const delivery = createScheduledTaskDelivery({
    notificationsSupported,
    notificationFactory,
    emailSender,
    focusMainWindow: () => focusAppWindow(resolveMainWindow()),
    warn: logMonitorWarning,
  })

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
            await rendererBroker.requestAutomationRun(
              buildAutomationRequest(task, previousRun?.outputText)
            )
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
          ...(automationResponse?.automationChatSessionId
            ? { automationChatSessionId: automationResponse.automationChatSessionId }
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
        await delivery.appendEmailLog(task, run)
        delivery.showNotification(task, run)
        await saveScheduledTaskRun(task, run, [])
        void scheduler.reschedule()
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
          aiSummary = await rendererBroker.requestSummary(
            buildSummaryRequest(task, diffSummary, changedResults)
          )
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
      await delivery.appendEmailLog(task, run)
      delivery.showNotification(task, run)
      await saveScheduledTaskRun(task, run, nextSnapshots)
      void scheduler.reschedule()
      broadcastChanged()
      return run
    } finally {
      running.delete(task.id)
    }
  }

  const scheduler = createScheduledTaskScheduler({
    setTimeoutImpl: setTimeoutFn,
    clearTimeoutImpl: clearTimeoutFn,
    now,
    startupOverdueCatchUpDelayMs,
    listTasks: listScheduledTasks,
    getTask: getScheduledTask,
    runTask,
    isTaskRunning: (id) => running.has(id),
    warn: logMonitorWarning,
  })

  const runNow = async (taskId: string): Promise<ScheduledTaskRun> => {
    if (!scheduler.isEnabled()) throw new Error('Reminders & Lookouts extension is disabled')
    const task = await getScheduledTask(taskId)
    if (!task) throw new Error('Scheduled task not found')
    return runTask(task)
  }

  return {
    start: scheduler.start,
    stop: () => {
      scheduler.stop()
      rendererBroker.stop()
    },
    reschedule: () => scheduler.reschedule(),
    runNow,
    setExtensionEnabled: scheduler.setEnabled,
    isExtensionEnabled: scheduler.isEnabled,
  }
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

export function stopMonitorRuntime(): void {
  if (!activeRuntime) return
  activeRuntime.stop()
  activeRuntime = null
}

export const __test__ = {
  createRuntime,
  buildDiffSummary,
  buildNotificationOptions,
}
