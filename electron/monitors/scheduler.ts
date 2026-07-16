import { getMonitorIntervalMs } from './schedule'
import type { ScheduledTaskDefinition, ScheduledTaskRun } from './types'

interface SchedulerOptions {
  setTimeoutImpl: typeof setTimeout
  clearTimeoutImpl: typeof clearTimeout
  now: () => number
  startupOverdueCatchUpDelayMs: number
  listTasks: () => Promise<ScheduledTaskDefinition[]>
  getTask: (id: string) => Promise<ScheduledTaskDefinition | null>
  runTask: (task: ScheduledTaskDefinition) => Promise<ScheduledTaskRun>
  isTaskRunning: (id: string) => boolean
  warn: (message: string) => void
}

export interface ScheduledTaskScheduler {
  start: () => Promise<void>
  stop: () => void
  reschedule: (options?: { runOverdue?: boolean }) => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>
  isEnabled: () => boolean
}

export function createScheduledTaskScheduler(options: SchedulerOptions): ScheduledTaskScheduler {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const launchedDueKeys = new Set<string>()
  let enabled = false
  let hasScheduledStartupCatchUp = false
  let startupCatchUpTimer: ReturnType<typeof setTimeout> | null = null

  const clearStartupCatchUpTimer = () => {
    if (!startupCatchUpTimer) return
    options.clearTimeoutImpl(startupCatchUpTimer)
    startupCatchUpTimer = null
  }

  const scheduleTask = (task: ScheduledTaskDefinition) => {
    const existing = timers.get(task.id)
    if (existing) options.clearTimeoutImpl(existing)
    timers.delete(task.id)
    if (!enabled || !task.enabled || task.nextRunAt <= options.now()) return
    const delay = Math.max(
      0,
      Math.min(task.nextRunAt - options.now(), getMonitorIntervalMs(task.intervalPreset))
    )
    const timer = options.setTimeoutImpl(() => {
      timers.delete(task.id)
      void options
        .getTask(task.id)
        .then((freshTask) => {
          if (!enabled || !freshTask?.enabled) return undefined
          return options.runTask(freshTask)
        })
        .catch((error) => {
          options.warn(
            `scheduled task failed: ${error instanceof Error ? error.message : String(error)}`
          )
        })
    }, delay)
    timers.set(task.id, timer)
  }

  const runDueTasks = (tasks: ScheduledTaskDefinition[], reason: string) => {
    if (!enabled) return
    const dueAt = options.now()
    for (const task of tasks) {
      if (!task.enabled || task.nextRunAt > dueAt || options.isTaskRunning(task.id)) continue
      const dueKey = `${task.id}:${task.nextRunAt}`
      if (launchedDueKeys.has(dueKey)) continue
      launchedDueKeys.add(dueKey)
      const timer = timers.get(task.id)
      if (timer) options.clearTimeoutImpl(timer)
      timers.delete(task.id)
      void options.runTask(task).catch((error) => {
        options.warn(`${reason}: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
  }

  const scheduleStartupOverdueCatchUp = (tasks: ScheduledTaskDefinition[]) => {
    if (hasScheduledStartupCatchUp || startupCatchUpTimer) return
    hasScheduledStartupCatchUp = true
    if (!tasks.some((task) => task.enabled && task.nextRunAt <= options.now())) return
    startupCatchUpTimer = options.setTimeoutImpl(() => {
      startupCatchUpTimer = null
      if (!enabled) return
      void options
        .listTasks()
        .then((current) => runDueTasks(current, 'startup overdue scheduled task failed'))
        .catch((error) => {
          options.warn(
            `startup overdue catch-up failed: ${error instanceof Error ? error.message : String(error)}`
          )
        })
    }, options.startupOverdueCatchUpDelayMs)
  }

  const reschedule = async (rescheduleOptions?: { runOverdue?: boolean }) => {
    for (const timer of timers.values()) options.clearTimeoutImpl(timer)
    timers.clear()
    if (!enabled) {
      clearStartupCatchUpTimer()
      return
    }
    const tasks = await options.listTasks()
    for (const task of tasks) scheduleTask(task)
    if (rescheduleOptions?.runOverdue !== false) {
      runDueTasks(tasks, 'overdue scheduled task failed')
    }
  }

  const setEnabled = async (value: boolean) => {
    const nextEnabled = value === true
    if (enabled === nextEnabled) return
    enabled = nextEnabled
    if (!nextEnabled) {
      clearStartupCatchUpTimer()
      await reschedule()
      return
    }
    const shouldDelayStartupCatchUp = !hasScheduledStartupCatchUp
    await reschedule({ runOverdue: !shouldDelayStartupCatchUp })
    if (shouldDelayStartupCatchUp) scheduleStartupOverdueCatchUp(await options.listTasks())
  }

  return {
    start: () => (enabled ? reschedule() : Promise.resolve()),
    stop: () => {
      for (const timer of timers.values()) options.clearTimeoutImpl(timer)
      timers.clear()
      clearStartupCatchUpTimer()
    },
    reschedule,
    setEnabled,
    isEnabled: () => enabled,
  }
}
