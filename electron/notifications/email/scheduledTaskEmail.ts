import type { ScheduledTaskDefinition, ScheduledTaskRun } from '../../monitors/types'
import { getEmailNotificationSettings } from './settings'
import { sendBrevoEmail } from './service'
import { getSecureValueAsync } from '../../secureStorage'
import type { EmailNotificationResult } from './types'
import { buildNotificationEmailHtml } from './template'

function stripEmptyLines(lines: Array<string | undefined>): string {
  return lines.filter((line): line is string => Boolean(line && line.trim())).join('\n')
}

function buildReminderBody(task: ScheduledTaskDefinition): string {
  return stripEmptyLines([
    `Reminder: ${task.title}`,
    '',
    task.reminderText || task.instructions || task.title,
  ])
}

function buildLookoutBody(task: ScheduledTaskDefinition, run: ScheduledTaskRun): string {
  const changedUrls = run.logs
    .filter((log) => log.status === 'changed' && log.url)
    .map((log) => log.url)
  return stripEmptyLines([
    `Lookout changed: ${task.title}`,
    '',
    run.aiSummary || run.diffSummary || 'A watched page changed.',
    '',
    changedUrls.length > 0 ? 'Changed URLs:' : undefined,
    ...changedUrls.map((url) => `- ${url}`),
  ])
}

function buildAutomationBody(task: ScheduledTaskDefinition, run: ScheduledTaskRun): string {
  return stripEmptyLines([
    `AI automation: ${task.title}`,
    '',
    run.changeVerdict?.summary || run.outputText || run.aiSummary || run.error || 'The automation finished.',
    '',
    run.resolvedContextSummary ? `Context: ${run.resolvedContextSummary}` : undefined,
  ])
}

function getChangedUrls(run: ScheduledTaskRun): string[] {
  return run.logs
    .filter((log) => log.status === 'changed' && log.url)
    .map((log) => log.url)
}

function buildHtmlContent(
  task: ScheduledTaskDefinition,
  run: ScheduledTaskRun,
  subject: string,
  textContent: string
): string {
  if (task.type === 'reminder') {
    return buildNotificationEmailHtml({
      notificationType: 'Reminder',
      title: subject,
      summary: task.reminderText || task.instructions || 'A reminder is due now.',
      notificationMessage: task.reminderText || task.instructions || textContent,
      detailTitle: 'Reminder details',
      detailItems: [
        `Title: ${task.title}`,
        `Schedule: ${task.intervalPreset}`,
      ],
      metadata: [
        { label: 'automation status', value: 'Triggered' },
        { label: 'notification', value: 'Email' },
      ],
    })
  }

  if (task.type === 'ai_automation') {
    return buildNotificationEmailHtml({
      notificationType: run.status === 'error' ? 'Automation failed' : 'AI automation',
      title: subject,
      summary: run.changeVerdict?.summary || run.outputText || run.aiSummary || run.error || 'The automation finished.',
      notificationMessage: textContent,
      detailTitle: 'Automation details',
      detailItems: [
        `Mode: ${task.automationMode ?? 'prompt'}`,
        `Notify policy: ${task.notifyPolicy ?? 'every_run'}`,
        `Schedule: ${task.schedule?.kind ?? task.intervalPreset}`,
      ],
      metadata: [
        { label: 'automation status', value: run.status === 'changed' ? 'Changed' : run.status === 'error' ? 'Error' : 'Completed' },
        { label: 'notification', value: 'Email' },
      ],
    })
  }

  const changedUrls = getChangedUrls(run)
  return buildNotificationEmailHtml({
    notificationType: 'Lookout changed',
    title: subject,
    summary: run.aiSummary || run.diffSummary || 'A watched page changed.',
    notificationMessage: run.aiSummary || run.diffSummary || textContent,
    detailTitle: 'Changed URLs',
    detailItems: changedUrls.length > 0 ? changedUrls : ['A watched page changed.'],
    metadata: [
      { label: 'automation status', value: 'Changed' },
      { label: 'notification', value: 'Email' },
    ],
  })
}

export async function sendScheduledTaskEmail(
  task: ScheduledTaskDefinition,
  run: ScheduledTaskRun
): Promise<EmailNotificationResult & { skipped?: boolean }> {
  const settings = getEmailNotificationSettings()
  if (!settings.enabled) return { ok: true, skipped: true }

  if (task.type === 'web_lookout' && run.status !== 'changed') {
    return { ok: true, skipped: true }
  }
  if (task.type === 'ai_automation') {
    const destinations = task.outputDestinations ?? ['log']
    if (!destinations.includes('email')) return { ok: true, skipped: true }
    const notifyPolicy = task.notifyPolicy ?? 'every_run'
    if (notifyPolicy === 'error_only' && run.status !== 'error') return { ok: true, skipped: true }
    if (notifyPolicy === 'meaningful_change' && run.status !== 'changed') return { ok: true, skipped: true }
  }

  const subject =
    task.type === 'reminder'
      ? `Reminder: ${task.title}`
      : task.type === 'ai_automation'
        ? `AI automation: ${task.title}`
        : `Lookout changed: ${task.title}`
  const textContent =
    task.type === 'reminder'
      ? buildReminderBody(task)
      : task.type === 'ai_automation'
        ? buildAutomationBody(task, run)
        : buildLookoutBody(task, run)

  return sendBrevoEmail({
    ...settings,
    apiKey: await getSecureValueAsync('brevoApiKey'),
    subject,
    textContent,
    htmlContent: buildHtmlContent(task, run, subject, textContent),
  })
}
