import type {
  ScheduledAutomationMode,
  ScheduledAutomationNotifyPolicy,
  ScheduledAutomationSchedule,
  ScheduledTaskDefinition,
  ScheduledTaskIntervalPreset,
  ScheduledTaskRun,
  ScheduledTaskStatus,
  ScheduledTaskType,
} from '@/electron/types'

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export const INTERVAL_OPTIONS: Array<{ value: ScheduledTaskIntervalPreset; label: string }> = [
  { value: '1m', label: 'Every 1 minute' },
  { value: '30m', label: 'Every 30 minutes' },
  { value: '1h', label: 'Every hour' },
  { value: '6h', label: 'Every 6 hours' },
  { value: '12h', label: 'Every 12 hours' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
]

export type ScheduleKindOption = NonNullable<ScheduledAutomationSchedule['kind']>

export interface ScheduleFormState {
  type: ScheduledTaskType
  title: string
  enabled: boolean
  reminderText: string
  urlsText: string
  instructions: string
  prompt: string
  automationMode: ScheduledAutomationMode
  approvalMode: 'read_only' | 'ask_each_run' | 'trusted_repeat'
  notifyPolicy: ScheduledAutomationNotifyPolicy
  outputDestinations: Array<'log' | 'notification' | 'email' | 'chat' | 'artifact'>
  allowedToolsText: string
  scheduleKind: ScheduleKindOption
  intervalPreset: ScheduledTaskIntervalPreset
  timeOfDay: string
  weekdays: number[]
  dueLocal: string
}

export function emptyFormState(type: ScheduledTaskType = 'reminder'): ScheduleFormState {
  return {
    type,
    title: '',
    enabled: true,
    reminderText: '',
    urlsText: '',
    instructions: '',
    prompt: '',
    automationMode: 'prompt',
    approvalMode: 'read_only',
    notifyPolicy: 'every_run',
    outputDestinations: ['log'],
    allowedToolsText: '',
    scheduleKind: type === 'ai_automation' ? 'agent' : 'interval',
    intervalPreset: '30m',
    timeOfDay: '09:00',
    weekdays: [1, 2, 3, 4, 5],
    dueLocal: '',
  }
}

export function formStateFromTask(task: ScheduledTaskDefinition): ScheduleFormState {
  const schedule = task.schedule
  const dueLocal =
    schedule?.kind === 'once' && task.nextRunAt ? toDatetimeLocalValue(task.nextRunAt) : ''
  return {
    type: task.type,
    title: task.title,
    enabled: task.enabled,
    reminderText: task.reminderText || '',
    urlsText: task.urls.join('\n'),
    instructions: task.instructions || '',
    prompt: task.prompt || '',
    automationMode: task.automationMode ?? 'prompt',
    approvalMode: task.approvalMode ?? 'read_only',
    notifyPolicy: task.notifyPolicy ?? 'every_run',
    outputDestinations: task.outputDestinations?.length ? [...task.outputDestinations] : ['log'],
    allowedToolsText: (task.allowedTools || []).join(', '),
    scheduleKind: schedule?.kind ?? (task.type === 'ai_automation' ? 'agent' : 'interval'),
    intervalPreset: schedule?.intervalPreset ?? task.intervalPreset,
    timeOfDay: schedule?.timeOfDay ?? '09:00',
    weekdays: schedule?.weekdays?.length ? [...schedule.weekdays] : [1, 2, 3, 4, 5],
    dueLocal,
  }
}

export function toDatetimeLocalValue(ms: number): string {
  const date = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function parseDatetimeLocalValue(value: string): number | null {
  if (!value.trim()) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

export function formatIntervalPreset(value: ScheduledTaskIntervalPreset): string {
  switch (value) {
    case '1m':
      return '1 min'
    case '30m':
      return '30 min'
    case '1h':
      return '1 hour'
    case '6h':
      return '6 hours'
    case '12h':
      return '12 hours'
    case 'daily':
      return 'daily'
    case 'weekly':
      return 'weekly'
  }
}

export function formatWeekdays(days?: number[]): string {
  if (!days?.length) return 'selected days'
  return [...days]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABELS[day] ?? String(day))
    .join(', ')
}

export function formatSchedule(task: ScheduledTaskDefinition): string {
  const schedule = task.schedule
  if (schedule?.kind === 'agent') return 'Agent-chosen cadence'
  if (!schedule || schedule.kind === 'interval')
    return `Every ${formatIntervalPreset(schedule?.intervalPreset ?? task.intervalPreset)}`
  if (schedule.kind === 'once') return 'One time'
  if (schedule.kind === 'daily') return `Daily at ${schedule.timeOfDay ?? '09:00'}`
  return `Weekly ${formatWeekdays(schedule.weekdays)} at ${schedule.timeOfDay ?? '09:00'}`
}

export function taskTypeLabel(type: ScheduledTaskType): string {
  if (type === 'web_lookout') return 'Lookout'
  if (type === 'ai_automation') return 'Automation'
  return 'Reminder'
}

export function automationModeLabel(mode?: ScheduledAutomationMode): string {
  switch (mode) {
    case 'watch':
      return 'Watch for changes'
    case 'agent':
      return 'Agent with tools'
    case 'prompt':
    default:
      return 'Prompt only'
  }
}

export function notifyPolicyLabel(policy?: ScheduledAutomationNotifyPolicy): string {
  switch (policy) {
    case 'meaningful_change':
      return 'Notify only on change'
    case 'error_only':
      return 'Notify only on errors'
    case 'every_run':
    default:
      return 'Notify every run'
  }
}

export function approvalModeLabel(mode?: ScheduledTaskDefinition['approvalMode']): string {
  switch (mode) {
    case 'ask_each_run':
      return 'Ask each run'
    case 'trusted_repeat':
      return 'Trusted repeats'
    case 'read_only':
    default:
      return 'Read-only tools'
  }
}

export function outputDestinationsLabel(
  destinations?: ScheduledTaskDefinition['outputDestinations']
): string {
  if (!destinations?.length) return 'Log only'
  const labels: Record<string, string> = {
    log: 'Log',
    notification: 'Notification',
    email: 'Email',
    chat: 'Chat',
    artifact: 'Artifact',
  }
  return destinations.map((d) => labels[d] ?? d).join(', ')
}

export function formatDate(value?: number): string {
  if (!value) return 'Not run yet'
  return new Date(value).toLocaleString()
}

export function formatRelativeNextRun(value?: number, now = Date.now()): string {
  if (!value) return 'not scheduled'
  const deltaMs = value - now
  const absMs = Math.abs(deltaMs)
  const tense = deltaMs >= 0 ? 'in' : 'overdue'

  if (absMs < 60_000) {
    const seconds = Math.max(1, Math.round(absMs / 1000))
    return deltaMs >= 0 ? `${tense} ${seconds} sec` : `${seconds} sec overdue`
  }
  if (absMs < 60 * 60_000) {
    const minutes = Math.round(absMs / 60_000)
    return deltaMs >= 0 ? `${tense} ${minutes} min` : `${minutes} min overdue`
  }
  if (absMs < 24 * 60 * 60_000) {
    const hours = Math.round(absMs / (60 * 60_000))
    return deltaMs >= 0 ? `${tense} ${hours} hr` : `${hours} hr overdue`
  }
  const days = Math.round(absMs / (24 * 60 * 60_000))
  return deltaMs >= 0
    ? `${tense} ${days} day${days === 1 ? '' : 's'}`
    : `${days} day${days === 1 ? '' : 's'} overdue`
}

export function runStatusLabel(status: ScheduledTaskStatus, taskType: ScheduledTaskType): string {
  if (status === 'error') return 'Failed'
  if (taskType === 'web_lookout') {
    if (status === 'changed') return 'Changed'
    return 'No change'
  }
  if (taskType === 'ai_automation') {
    if (status === 'changed') return 'Updated'
    return 'Done'
  }
  // reminder
  if (status === 'changed') return 'Delivered'
  return 'Done'
}

export function summarizeLastRun(
  run: ScheduledTaskRun | undefined,
  taskType: ScheduledTaskType
): string | null {
  if (!run) return null
  const status = runStatusLabel(run.status, taskType)
  const body =
    run.aiSummary?.trim() ||
    run.changeVerdict?.summary?.trim() ||
    run.outputText?.trim() ||
    run.diffSummary?.trim() ||
    run.error?.trim() ||
    ''
  if (!body) return `Last: ${status}`
  const compact = body.replace(/\s+/g, ' ').slice(0, 120)
  return `Last: ${status} — ${compact}${body.length > 120 ? '…' : ''}`
}

export function buildSchedulePayload(form: ScheduleFormState): {
  schedule?: ScheduledAutomationSchedule
  intervalPreset: ScheduledTaskIntervalPreset
  dueAt?: number
} {
  const intervalPreset = form.intervalPreset
  if (form.scheduleKind === 'agent') {
    return {
      intervalPreset,
      schedule: { kind: 'agent', intervalPreset },
    }
  }
  if (form.scheduleKind === 'interval') {
    return {
      intervalPreset,
      schedule: { kind: 'interval', intervalPreset },
    }
  }
  if (form.scheduleKind === 'daily') {
    return {
      intervalPreset: 'daily',
      schedule: { kind: 'daily', timeOfDay: form.timeOfDay || '09:00' },
    }
  }
  if (form.scheduleKind === 'weekly') {
    return {
      intervalPreset: 'weekly',
      schedule: {
        kind: 'weekly',
        timeOfDay: form.timeOfDay || '09:00',
        weekdays: form.weekdays.length ? form.weekdays : [1],
      },
    }
  }
  // once
  const dueAt = parseDatetimeLocalValue(form.dueLocal) ?? Date.now() + 60_000
  return {
    intervalPreset,
    schedule: { kind: 'once' },
    dueAt,
  }
}

export function buildCreateInput(form: ScheduleFormState) {
  const { schedule, intervalPreset, dueAt } = buildSchedulePayload(form)
  const urls = form.urlsText
    .split(/[\n,]+/)
    .map((url) => url.trim())
    .filter(Boolean)
  const allowedTools = form.allowedToolsText
    .split(/[,\n]+/)
    .map((tool) => tool.trim())
    .filter(Boolean)

  return {
    type: form.type,
    title: form.title.trim(),
    enabled: form.enabled,
    instructions: form.instructions.trim(),
    intervalPreset,
    schedule,
    ...(dueAt !== undefined ? { dueAt } : {}),
    ...(form.type === 'reminder'
      ? { reminderText: form.reminderText.trim() || form.title.trim() }
      : {}),
    ...(form.type === 'web_lookout' ? { urls } : {}),
    ...(form.type === 'ai_automation'
      ? {
          prompt: form.prompt.trim(),
          automationMode: form.automationMode,
          approvalMode: form.approvalMode,
          notifyPolicy: form.notifyPolicy,
          outputDestinations: form.outputDestinations.length
            ? [...form.outputDestinations]
            : (['log'] as Array<'log' | 'notification' | 'email' | 'chat' | 'artifact'>),
          allowedTools,
        }
      : {}),
  }
}

export function buildUpdateInput(form: ScheduleFormState) {
  return buildCreateInput(form)
}

export function validateForm(form: ScheduleFormState): string | null {
  if (!form.title.trim()) return 'Title is required.'
  if (form.type === 'reminder' && !form.reminderText.trim() && !form.title.trim()) {
    return 'Reminder text is required.'
  }
  if (form.type === 'web_lookout') {
    const urls = form.urlsText
      .split(/[\n,]+/)
      .map((url) => url.trim())
      .filter(Boolean)
    if (urls.length === 0) return 'Add at least one URL to watch.'
  }
  if (form.type === 'ai_automation' && !form.prompt.trim()) {
    return 'Automation prompt is required.'
  }
  if (form.scheduleKind === 'once' && !parseDatetimeLocalValue(form.dueLocal)) {
    return 'Pick a date and time for a one-time schedule.'
  }
  if (
    (form.scheduleKind === 'daily' || form.scheduleKind === 'weekly') &&
    !/^\d{2}:\d{2}$/.test(form.timeOfDay)
  ) {
    return 'Time of day must be HH:mm.'
  }
  if (form.scheduleKind === 'weekly' && form.weekdays.length === 0) {
    return 'Pick at least one weekday.'
  }
  return null
}
