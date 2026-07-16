import type { NotificationConstructorOptions } from 'electron'
import type { ScheduledTaskDefinition, ScheduledTaskRun } from './types'

const NOTIFICATION_BODY_LIMIT = 240

export interface ScheduledTaskNotification {
  show: () => void
  on: (event: 'click', listener: () => void) => ScheduledTaskNotification
}

export interface ScheduledTaskDelivery {
  appendEmailLog: (task: ScheduledTaskDefinition, run: ScheduledTaskRun) => Promise<void>
  showNotification: (task: ScheduledTaskDefinition, run: ScheduledTaskRun) => void
}

interface DeliveryOptions {
  notificationsSupported: () => boolean
  notificationFactory: (options: NotificationConstructorOptions) => ScheduledTaskNotification
  emailSender: (
    task: ScheduledTaskDefinition,
    run: ScheduledTaskRun
  ) => Promise<{ ok: boolean; error?: string; skipped?: boolean }>
  focusMainWindow: () => void
  warn: (message: string) => void
}

function compactNotificationBody(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, NOTIFICATION_BODY_LIMIT)
}

export function buildNotificationOptions(
  task: ScheduledTaskDefinition,
  run: ScheduledTaskRun
): NotificationConstructorOptions | null {
  if (task.type === 'reminder') {
    return {
      title: `Reminder: ${task.title}`,
      body:
        compactNotificationBody(
          task.reminderText || task.instructions || run.logs[0]?.message || task.title
        ) || 'Scheduled reminder is due.',
    }
  }
  if (task.type === 'web_lookout' && run.status === 'changed') {
    const changedUrls = run.logs
      .filter((log) => log.status === 'changed' && log.url)
      .map((log) => log.url)
    return {
      title: `Lookout changed: ${task.title}`,
      body:
        compactNotificationBody(run.aiSummary || run.diffSummary || changedUrls.join(', ')) ||
        `${changedUrls.length || 1} watched page changed.`,
    }
  }
  if (task.type === 'ai_automation') {
    const notifyPolicy = task.notifyPolicy ?? 'every_run'
    if (!(task.outputDestinations ?? ['log']).includes('notification')) return null
    if (notifyPolicy === 'error_only' && run.status !== 'error') return null
    if (notifyPolicy === 'meaningful_change' && run.status !== 'changed') return null
    return {
      title: `${run.status === 'error' ? 'Automation failed' : 'Automation'}: ${task.title}`,
      body:
        compactNotificationBody(
          run.changeVerdict?.summary || run.aiSummary || run.outputText || run.error
        ) || 'Scheduled AI automation finished.',
    }
  }
  return null
}

export function createScheduledTaskDelivery(options: DeliveryOptions): ScheduledTaskDelivery {
  const appendEmailLog = async (
    task: ScheduledTaskDefinition,
    run: ScheduledTaskRun
  ): Promise<void> => {
    try {
      const result = await options.emailSender(task, run)
      if (result.skipped) return
      if (result.ok) {
        if (task.type === 'ai_automation') {
          run.deliveryStatus = { ...run.deliveryStatus, email: 'sent' }
        }
        run.logs.push({ url: '', status: 'completed', message: 'Email notification sent.' })
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

  const showNotification = (task: ScheduledTaskDefinition, run: ScheduledTaskRun): void => {
    const notificationOptions = buildNotificationOptions(task, run)
    if (!notificationOptions) {
      if (task.type === 'ai_automation' && task.outputDestinations?.includes('notification')) {
        run.deliveryStatus = { ...run.deliveryStatus, notification: 'skipped' }
      }
      return
    }
    try {
      if (!options.notificationsSupported()) {
        if (task.type === 'ai_automation') {
          run.deliveryStatus = { ...run.deliveryStatus, notification: 'skipped' }
        }
        return
      }
      const notification = options.notificationFactory(notificationOptions)
      notification.on('click', options.focusMainWindow)
      notification.show()
      if (task.type === 'ai_automation') {
        run.deliveryStatus = { ...run.deliveryStatus, notification: 'sent' }
      }
    } catch (error) {
      if (task.type === 'ai_automation') {
        run.deliveryStatus = { ...run.deliveryStatus, notification: 'error' }
      }
      options.warn(`notification failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return { appendEmailLog, showNotification }
}
