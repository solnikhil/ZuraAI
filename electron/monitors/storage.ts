import { app } from 'electron'
import { randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { writeFileAtomic } from '../utils/atomicFile'
import { calculateNextRunAt, isMonitorIntervalPreset } from './schedule'
import { validateMonitorUrl } from './content'
import type {
  MonitorIntervalPreset,
  ScheduledAutomationApprovalMode,
  ScheduledAutomationBudgets,
  ScheduledAutomationContextSource,
  ScheduledAutomationMode,
  ScheduledAutomationNotifyPolicy,
  ScheduledAutomationOutputDestination,
  ScheduledAutomationSchedule,
  ScheduledTaskDefinition,
  ScheduledTaskIndex,
  ScheduledTaskInput,
  ScheduledTaskRun,
  ScheduledTaskSnapshot,
  ScheduledTaskUpdateInput,
} from './types'

const INDEX_VERSION = 1
const MAX_TASKS = 100
const MAX_URLS_PER_MONITOR = 10
const MAX_RUNS = 500
const MAX_NAME_LENGTH = 120
const MAX_INSTRUCTIONS_LENGTH = 2000
const MAX_PROMPT_LENGTH = 8000
const MAX_CONTEXT_SOURCES = 20
const MAX_ALLOWED_TOOLS = 40
const DEFAULT_INTERVAL_PRESET = '30m'
const DEFAULT_AUTOMATION_MODE: ScheduledAutomationMode = 'prompt'
const DEFAULT_APPROVAL_MODE: ScheduledAutomationApprovalMode = 'read_only'
const DEFAULT_NOTIFY_POLICY: ScheduledAutomationNotifyPolicy = 'every_run'
const DEFAULT_OUTPUT_DESTINATIONS: ScheduledAutomationOutputDestination[] = ['log']
let cachedIndex: ScheduledTaskIndex | null = null
let cacheTimestamp = 0
let pendingWrite: Promise<unknown> = Promise.resolve()
const CACHE_TTL_MS = 500

function getIndexPath(): string {
  return path.join(app.getPath('userData'), 'scheduled-tasks.json')
}

function getLegacyIndexPath(): string {
  return path.join(app.getPath('userData'), 'web-monitors.json')
}

function createEmptyIndex(): ScheduledTaskIndex {
  return { tasks: [], snapshots: [], runs: [], version: INDEX_VERSION }
}

function isScheduledTaskType(value: unknown): value is ScheduledTaskDefinition['type'] {
  return value === 'reminder' || value === 'web_lookout' || value === 'ai_automation'
}

function isAutomationMode(value: unknown): value is ScheduledAutomationMode {
  return value === 'prompt' || value === 'watch' || value === 'agent'
}

function isApprovalMode(value: unknown): value is ScheduledAutomationApprovalMode {
  return value === 'read_only' || value === 'ask_each_run' || value === 'trusted_repeat'
}

function isNotifyPolicy(value: unknown): value is ScheduledAutomationNotifyPolicy {
  return value === 'every_run' || value === 'meaningful_change' || value === 'error_only'
}

function isOutputDestination(value: unknown): value is ScheduledAutomationOutputDestination {
  return value === 'log' || value === 'notification' || value === 'email' || value === 'chat' || value === 'artifact'
}

function isContextSourceType(value: unknown): value is ScheduledAutomationContextSource['type'] {
  return (
    value === 'current_datetime' ||
    value === 'folder_memory' ||
    value === 'chat' ||
    value === 'url' ||
    value === 'file' ||
    value === 'mcp_resource'
  )
}

function isTimeOfDay(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

function minutesFromTimeOfDay(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function formatTimeOfDay(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

function getScheduleTimezone(schedule?: ScheduledAutomationSchedule): string | undefined {
  return schedule?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
}

function getZonedDateParts(timeZone: string, utcMs: number): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(utcMs))
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  }
}

function getTimeZoneOffsetMs(timeZone: string, utcMs: number): number {
  const parts = getZonedDateParts(timeZone, utcMs)
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return localAsUtc - utcMs
}

function zonedLocalTimeToUtcMs(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  timeOfDay: string
): number {
  const targetMinutes = minutesFromTimeOfDay(timeOfDay)
  const localAsUtc = Date.UTC(year, month - 1, day, Math.floor(targetMinutes / 60), targetMinutes % 60, 0, 0)
  let guess = localAsUtc
  for (let index = 0; index < 3; index += 1) {
    guess = localAsUtc - getTimeZoneOffsetMs(timeZone, guess)
  }
  return guess
}

function addDaysToYmd(year: number, month: number, day: number, offsetDays: number): {
  year: number
  month: number
  day: number
} {
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function weekdayForYmd(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function applyWorkHoursWindow(
  utcMs: number,
  schedule?: ScheduledAutomationSchedule
): number {
  if (!schedule?.workHours?.enabled) return utcMs
  const timeZone = getScheduleTimezone(schedule)
  if (!timeZone) return utcMs
  const start = minutesFromTimeOfDay(schedule.workHours.start)
  const end = minutesFromTimeOfDay(schedule.workHours.end)
  if (start >= end) return utcMs
  const parts = getZonedDateParts(timeZone, utcMs)
  const current = parts.hour * 60 + parts.minute
  if (current < start) {
    return zonedLocalTimeToUtcMs(timeZone, parts.year, parts.month, parts.day, formatTimeOfDay(start))
  }
  if (current > end) {
    const next = addDaysToYmd(parts.year, parts.month, parts.day, 1)
    return zonedLocalTimeToUtcMs(timeZone, next.year, next.month, next.day, formatTimeOfDay(start))
  }
  return utcMs
}

function getScheduledTimeOfDay(schedule: ScheduledAutomationSchedule): string {
  const requested = schedule.timeOfDay ?? '09:00'
  if (!schedule.workHours?.enabled) return requested
  const start = minutesFromTimeOfDay(schedule.workHours.start)
  const end = minutesFromTimeOfDay(schedule.workHours.end)
  if (start >= end) return requested
  const target = minutesFromTimeOfDay(requested)
  if (target < start || target > end) return formatTimeOfDay(start)
  return requested
}

function normalizeWeekdays(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined
  const days = Array.from(new Set(value.map((day) => Number(day))))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b)
  return days.length > 0 ? days : undefined
}

function normalizeSchedule(
  raw: unknown,
  fallbackInterval: MonitorIntervalPreset
): ScheduledAutomationSchedule | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const kind = record.kind
  if (kind !== 'interval' && kind !== 'daily' && kind !== 'weekly' && kind !== 'once') return undefined
  const schedule: ScheduledAutomationSchedule = { kind }
  if (isMonitorIntervalPreset(record.intervalPreset)) {
    schedule.intervalPreset = record.intervalPreset
  } else if (kind === 'interval') {
    schedule.intervalPreset = fallbackInterval
  }
  if (kind === 'daily' || kind === 'weekly') {
    if (record.timeOfDay !== undefined && !isTimeOfDay(record.timeOfDay)) return undefined
    if (isTimeOfDay(record.timeOfDay)) schedule.timeOfDay = record.timeOfDay
  }
  if (kind === 'weekly') schedule.weekdays = normalizeWeekdays(record.weekdays)
  if (typeof record.timezone === 'string' && record.timezone.trim()) {
    const timezone = record.timezone.trim().slice(0, 80)
    if (!isValidTimeZone(timezone)) return undefined
    schedule.timezone = timezone
  }
  if (record.workHours && typeof record.workHours === 'object' && !Array.isArray(record.workHours)) {
    const workHours = record.workHours as Record<string, unknown>
    if (isTimeOfDay(workHours.start) && isTimeOfDay(workHours.end)) {
      if (workHours.enabled === true && minutesFromTimeOfDay(workHours.start) >= minutesFromTimeOfDay(workHours.end)) {
        return undefined
      }
      schedule.workHours = {
        enabled: workHours.enabled === true,
        start: workHours.start,
        end: workHours.end,
      }
    }
  }
  return schedule
}

function calculateScheduledNextRunAt(
  fromMs: number,
  intervalPreset: MonitorIntervalPreset,
  schedule?: ScheduledAutomationSchedule,
  dueAt?: number
): number {
  if (typeof dueAt === 'number') return dueAt
  if (!schedule || schedule.kind === 'interval') {
    return applyWorkHoursWindow(
      calculateNextRunAt(fromMs, schedule?.intervalPreset ?? intervalPreset),
      schedule
    )
  }
  if (schedule.kind === 'once') return fromMs

  const timeZone = getScheduleTimezone(schedule)
  const zonedNow = timeZone ? getZonedDateParts(timeZone, fromMs) : null
  const baseDate = zonedNow
    ? { year: zonedNow.year, month: zonedNow.month, day: zonedNow.day }
    : (() => {
        const date = new Date(fromMs)
        return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
      })()
  const timeOfDay = getScheduledTimeOfDay(schedule)
  if (schedule.kind === 'daily') {
    for (let offset = 0; offset <= 2; offset += 1) {
      const local = addDaysToYmd(baseDate.year, baseDate.month, baseDate.day, offset)
      const candidate = timeZone
        ? zonedLocalTimeToUtcMs(timeZone, local.year, local.month, local.day, timeOfDay)
        : new Date(local.year, local.month - 1, local.day, Math.floor(minutesFromTimeOfDay(timeOfDay) / 60), minutesFromTimeOfDay(timeOfDay) % 60, 0, 0).getTime()
      if (candidate > fromMs) return applyWorkHoursWindow(candidate, schedule)
    }
    return applyWorkHoursWindow(calculateNextRunAt(fromMs, 'daily'), schedule)
  }

  const weekdays = schedule.weekdays && schedule.weekdays.length > 0
    ? schedule.weekdays
    : [timeZone && zonedNow ? weekdayForYmd(zonedNow.year, zonedNow.month, zonedNow.day) : new Date(fromMs).getDay()]
  for (let offset = 0; offset <= 14; offset += 1) {
    const local = addDaysToYmd(baseDate.year, baseDate.month, baseDate.day, offset)
    if (!weekdays.includes(weekdayForYmd(local.year, local.month, local.day))) continue
    const candidate = timeZone
      ? zonedLocalTimeToUtcMs(timeZone, local.year, local.month, local.day, timeOfDay)
      : new Date(local.year, local.month - 1, local.day, Math.floor(minutesFromTimeOfDay(timeOfDay) / 60), minutesFromTimeOfDay(timeOfDay) % 60, 0, 0).getTime()
    if (candidate > fromMs) return applyWorkHoursWindow(candidate, schedule)
  }
  return applyWorkHoursWindow(calculateNextRunAt(fromMs, 'weekly'), schedule)
}

function normalizeContextSources(raw: unknown): ScheduledAutomationContextSource[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw
    .slice(0, MAX_CONTEXT_SOURCES)
    .map((source): ScheduledAutomationContextSource | null => {
      if (!source || typeof source !== 'object' || Array.isArray(source)) return null
      const record = source as Record<string, unknown>
      if (!isContextSourceType(record.type)) return null
      return {
        type: record.type,
        ...(typeof record.id === 'string' && record.id.trim() ? { id: record.id.trim().slice(0, 200) } : {}),
        ...(typeof record.label === 'string' && record.label.trim() ? { label: record.label.trim().slice(0, 200) } : {}),
        ...(typeof record.value === 'string' && record.value.trim() ? { value: record.value.trim().slice(0, 2000) } : {}),
      }
    })
    .filter((source): source is ScheduledAutomationContextSource => Boolean(source))
}

function normalizeAllowedTools(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return Array.from(new Set(
    raw
      .filter((tool): tool is string => typeof tool === 'string' && /^[a-zA-Z0-9_.:-]+$/.test(tool.trim()))
      .map((tool) => tool.trim())
  )).slice(0, MAX_ALLOWED_TOOLS)
}

function normalizeOutputDestinations(raw: unknown): ScheduledAutomationOutputDestination[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const destinations = Array.from(new Set(raw.filter(isOutputDestination)))
  return destinations.length > 0 ? destinations : undefined
}

function normalizeBudgets(raw: unknown): ScheduledAutomationBudgets | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const budgets: ScheduledAutomationBudgets = {}
  const timeoutMs = Number(record.timeoutMs)
  if (Number.isFinite(timeoutMs)) budgets.timeoutMs = Math.min(15 * 60_000, Math.max(10_000, Math.round(timeoutMs)))
  const maxToolCalls = Number(record.maxToolCalls)
  if (Number.isFinite(maxToolCalls)) budgets.maxToolCalls = Math.min(50, Math.max(0, Math.round(maxToolCalls)))
  const maxWebSearches = Number(record.maxWebSearches)
  if (Number.isFinite(maxWebSearches)) budgets.maxWebSearches = Math.min(20, Math.max(0, Math.round(maxWebSearches)))
  const maxTokens = Number(record.maxTokens)
  if (Number.isFinite(maxTokens)) budgets.maxTokens = Math.min(16_000, Math.max(256, Math.round(maxTokens)))
  return Object.keys(budgets).length > 0 ? budgets : undefined
}

function normalizeTask(input: unknown): ScheduledTaskDefinition | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<ScheduledTaskDefinition> & { name?: string; monitorId?: string }
  if (typeof raw.id !== 'string' || !raw.id) return null
  const type = isScheduledTaskType(raw.type) ? raw.type : raw.type === 'reminder' ? 'reminder' : 'web_lookout'
  const title = typeof raw.title === 'string' ? raw.title : raw.name
  if (typeof title !== 'string' || !title.trim()) return null
  if (type === 'web_lookout' && (!Array.isArray(raw.urls) || raw.urls.length === 0)) return null
  if (type === 'ai_automation' && typeof raw.prompt !== 'string') return null
  if (!isMonitorIntervalPreset(raw.intervalPreset)) return null
  if (typeof raw.createdAt !== 'number' || typeof raw.updatedAt !== 'number') return null
  const schedule = normalizeSchedule(raw.schedule, raw.intervalPreset)
  const budgets = normalizeBudgets(raw.budgets)
  return {
    id: raw.id,
    type,
    title: title.slice(0, MAX_NAME_LENGTH),
    enabled: raw.enabled !== false,
    urls: Array.isArray(raw.urls) ? raw.urls.filter((url): url is string => typeof url === 'string') : [],
    ...(typeof raw.reminderText === 'string' ? { reminderText: raw.reminderText.slice(0, MAX_INSTRUCTIONS_LENGTH) } : {}),
    instructions: typeof raw.instructions === 'string' ? raw.instructions.slice(0, MAX_INSTRUCTIONS_LENGTH) : '',
    intervalPreset: raw.intervalPreset,
    ...(schedule ? { schedule } : {}),
    ...(type === 'ai_automation'
      ? {
          prompt: (raw.prompt || '').slice(0, MAX_PROMPT_LENGTH),
          automationMode: isAutomationMode(raw.automationMode) ? raw.automationMode : DEFAULT_AUTOMATION_MODE,
          contextSources: normalizeContextSources(raw.contextSources) ?? [],
          allowedTools: normalizeAllowedTools(raw.allowedTools) ?? [],
          approvalMode: isApprovalMode(raw.approvalMode) ? raw.approvalMode : DEFAULT_APPROVAL_MODE,
          outputDestinations: normalizeOutputDestinations(raw.outputDestinations) ?? DEFAULT_OUTPUT_DESTINATIONS,
          notifyPolicy: isNotifyPolicy(raw.notifyPolicy) ? raw.notifyPolicy : DEFAULT_NOTIFY_POLICY,
          ...(budgets ? { budgets } : {}),
          ...(typeof raw.automationChatSessionId === 'string' && raw.automationChatSessionId.trim()
            ? { automationChatSessionId: raw.automationChatSessionId.trim().slice(0, 200) }
            : {}),
        }
      : {}),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    ...(typeof raw.lastRunAt === 'number' ? { lastRunAt: raw.lastRunAt } : {}),
    nextRunAt:
      typeof raw.nextRunAt === 'number'
        ? raw.nextRunAt
        : calculateScheduledNextRunAt(raw.updatedAt, raw.intervalPreset, schedule),
  }
}

function normalizeSnapshot(input: unknown): ScheduledTaskSnapshot | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<ScheduledTaskSnapshot> & { monitorId?: string }
  const taskId = raw.taskId ?? raw.monitorId
  if (typeof taskId !== 'string' || typeof raw.url !== 'string') return null
  if (typeof raw.contentHash !== 'string' || typeof raw.normalizedTextExcerpt !== 'string') return null
  if (typeof raw.capturedAt !== 'number') return null
  return {
    taskId,
    url: raw.url,
    contentHash: raw.contentHash,
    normalizedTextExcerpt: raw.normalizedTextExcerpt,
    capturedAt: raw.capturedAt,
  }
}

function normalizeRun(input: unknown): ScheduledTaskRun | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<ScheduledTaskRun> & { monitorId?: string; urlResults?: ScheduledTaskRun['logs'] }
  const taskId = raw.taskId ?? raw.monitorId
  if (typeof raw.id !== 'string' || typeof taskId !== 'string') return null
  if (typeof raw.startedAt !== 'number' || typeof raw.finishedAt !== 'number') return null
  if (raw.status !== 'changed' && raw.status !== 'unchanged' && raw.status !== 'error') return null
  return {
    id: raw.id,
    taskId,
    startedAt: raw.startedAt,
    finishedAt: raw.finishedAt,
    status: raw.status,
    logs: Array.isArray(raw.logs) ? raw.logs : Array.isArray(raw.urlResults) ? raw.urlResults : [],
    ...(typeof raw.diffSummary === 'string' ? { diffSummary: raw.diffSummary } : {}),
    ...(typeof raw.aiSummary === 'string' ? { aiSummary: raw.aiSummary } : {}),
    ...(typeof raw.promptSnapshot === 'string' ? { promptSnapshot: raw.promptSnapshot.slice(0, MAX_PROMPT_LENGTH) } : {}),
    ...(typeof raw.resolvedContextSummary === 'string' ? { resolvedContextSummary: raw.resolvedContextSummary.slice(0, 4000) } : {}),
    ...(typeof raw.model === 'string' ? { model: raw.model.slice(0, 200) } : {}),
    ...(typeof raw.provider === 'string' ? { provider: raw.provider.slice(0, 80) } : {}),
    ...(typeof raw.outputText === 'string' ? { outputText: raw.outputText.slice(0, 12000) } : {}),
    ...(Array.isArray(raw.artifactIds)
      ? { artifactIds: raw.artifactIds.filter((id): id is string => typeof id === 'string').slice(0, 20) }
      : {}),
    ...(Array.isArray(raw.generatedFiles) ? { generatedFiles: raw.generatedFiles.slice(0, 20) as ScheduledTaskRun['generatedFiles'] } : {}),
    ...(Array.isArray(raw.toolCallSummaries) ? { toolCallSummaries: raw.toolCallSummaries.slice(0, 100) as ScheduledTaskRun['toolCallSummaries'] } : {}),
    ...(raw.usage && typeof raw.usage === 'object' ? { usage: raw.usage as ScheduledTaskRun['usage'] } : {}),
    ...(raw.changeVerdict && typeof raw.changeVerdict === 'object' ? { changeVerdict: raw.changeVerdict as ScheduledTaskRun['changeVerdict'] } : {}),
    ...(raw.deliveryStatus && typeof raw.deliveryStatus === 'object' ? { deliveryStatus: raw.deliveryStatus as ScheduledTaskRun['deliveryStatus'] } : {}),
    ...(typeof raw.error === 'string' ? { error: raw.error } : {}),
  }
}

function normalizeIndex(data: unknown): ScheduledTaskIndex {
  if (!data || typeof data !== 'object') return createEmptyIndex()
  const raw = data as Partial<ScheduledTaskIndex> & { monitors?: unknown[] }
  const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : Array.isArray(raw.monitors) ? raw.monitors : []
  return {
    tasks: rawTasks.map(normalizeTask).filter((item): item is ScheduledTaskDefinition => Boolean(item)),
    snapshots: Array.isArray(raw.snapshots)
      ? raw.snapshots.map(normalizeSnapshot).filter((item): item is ScheduledTaskSnapshot => Boolean(item))
      : [],
    runs: Array.isArray(raw.runs)
      ? raw.runs.map(normalizeRun).filter((item): item is ScheduledTaskRun => Boolean(item)).slice(0, MAX_RUNS)
      : [],
    version: INDEX_VERSION,
  }
}

async function readIndex(): Promise<ScheduledTaskIndex> {
  if (cachedIndex && Date.now() - cacheTimestamp < CACHE_TTL_MS) return cachedIndex
  try {
    if (fsSync.existsSync(getIndexPath())) {
      const parsed = normalizeIndex(JSON.parse(await fs.readFile(getIndexPath(), 'utf-8')))
      cachedIndex = parsed
      cacheTimestamp = Date.now()
      return parsed
    }
    if (fsSync.existsSync(getLegacyIndexPath())) {
      const parsed = normalizeIndex(JSON.parse(await fs.readFile(getLegacyIndexPath(), 'utf-8')))
      cachedIndex = parsed
      cacheTimestamp = Date.now()
      await persistIndex(parsed)
      return parsed
    }
  } catch (error) {
    console.error('Failed to read scheduled tasks:', error)
  }
  const empty = createEmptyIndex()
  cachedIndex = empty
  cacheTimestamp = Date.now()
  return empty
}

async function persistIndex(index: ScheduledTaskIndex): Promise<ScheduledTaskIndex> {
  const normalized: ScheduledTaskIndex = {
    tasks: index.tasks,
    snapshots: index.snapshots,
    runs: [...index.runs].sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_RUNS),
    version: INDEX_VERSION,
  }
  await writeFileAtomic(getIndexPath(), JSON.stringify(normalized, null, 2))
  cachedIndex = normalized
  cacheTimestamp = Date.now()
  return normalized
}

async function withWriteLock<T>(operation: (index: ScheduledTaskIndex) => Promise<T> | T): Promise<T> {
  const run = async () => {
    cachedIndex = null
    cacheTimestamp = 0
    return operation(await readIndex())
  }
  const next = pendingWrite.then(run, run)
  pendingWrite = next.then(
    () => undefined,
    () => undefined
  )
  return next
}

export function sanitizeScheduledTaskInput(raw: unknown, partial = false): ScheduledTaskInput | ScheduledTaskUpdateInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid monitor payload')
  }
  const record = raw as Record<string, unknown>
  const input: ScheduledTaskUpdateInput = {}
  if (!partial || record.type !== undefined) {
    if (!isScheduledTaskType(record.type)) throw new Error('Invalid scheduled task type')
    input.type = record.type
  }
  const taskType = input.type ?? (isScheduledTaskType(record.type) ? record.type : record.type === 'reminder' ? 'reminder' : 'web_lookout')
  if (!partial || record.title !== undefined || record.name !== undefined) {
    const rawTitle = record.title ?? record.name
    if (typeof rawTitle !== 'string' || !rawTitle.trim()) throw new Error('Scheduled task title is required')
    input.title = rawTitle.trim().slice(0, MAX_NAME_LENGTH)
  }
  if (taskType === 'web_lookout' && (!partial || record.urls !== undefined)) {
    if (!Array.isArray(record.urls) || record.urls.length === 0) throw new Error('At least one URL is required for a lookout')
    if (record.urls.length > MAX_URLS_PER_MONITOR) throw new Error(`A monitor can watch at most ${MAX_URLS_PER_MONITOR} URLs`)
    input.urls = Array.from(new Set(record.urls.map(validateMonitorUrl)))
  } else if (record.urls !== undefined) {
    if (!Array.isArray(record.urls)) throw new Error('Scheduled task URLs must be an array')
    input.urls = Array.from(new Set(record.urls.map(validateMonitorUrl)))
  }
  if (taskType === 'reminder' && (!partial || record.reminderText !== undefined)) {
    if (typeof record.reminderText !== 'string' || !record.reminderText.trim()) throw new Error('Reminder text is required')
    input.reminderText = record.reminderText.trim().slice(0, MAX_INSTRUCTIONS_LENGTH)
  }
  if (taskType === 'ai_automation' && (!partial || record.prompt !== undefined)) {
    if (typeof record.prompt !== 'string' || !record.prompt.trim()) throw new Error('Automation prompt is required')
    input.prompt = record.prompt.trim().slice(0, MAX_PROMPT_LENGTH)
  }
  if (record.enabled !== undefined) {
    input.enabled = record.enabled === true
  } else if (!partial) {
    input.enabled = true
  }
  if (record.instructions !== undefined) {
    if (typeof record.instructions !== 'string') throw new Error('Monitor instructions must be a string')
    input.instructions = record.instructions.trim().slice(0, MAX_INSTRUCTIONS_LENGTH)
  } else if (!partial) {
    input.instructions = ''
  }
  if (record.intervalPreset !== undefined) {
    if (!isMonitorIntervalPreset(record.intervalPreset)) throw new Error('Invalid monitor interval')
    input.intervalPreset = record.intervalPreset
  } else if (!partial) {
    input.intervalPreset = DEFAULT_INTERVAL_PRESET
  }
  const effectiveInterval = input.intervalPreset ?? DEFAULT_INTERVAL_PRESET
  if (record.schedule !== undefined) {
    const schedule = normalizeSchedule(record.schedule, effectiveInterval)
    if (!schedule) throw new Error('Invalid automation schedule')
    input.schedule = schedule
  } else if (!partial && taskType === 'ai_automation') {
    input.schedule = { kind: 'interval', intervalPreset: effectiveInterval }
  }
  if (record.automationMode !== undefined) {
    if (!isAutomationMode(record.automationMode)) throw new Error('Invalid automation mode')
    input.automationMode = record.automationMode
  } else if (!partial && taskType === 'ai_automation') {
    input.automationMode = DEFAULT_AUTOMATION_MODE
  }
  if (record.contextSources !== undefined) {
    input.contextSources = normalizeContextSources(record.contextSources) ?? []
  } else if (!partial && taskType === 'ai_automation') {
    input.contextSources = [{ type: 'current_datetime' }]
  }
  if (record.allowedTools !== undefined) {
    input.allowedTools = normalizeAllowedTools(record.allowedTools) ?? []
  } else if (!partial && taskType === 'ai_automation') {
    input.allowedTools = []
  }
  if (record.approvalMode !== undefined) {
    if (!isApprovalMode(record.approvalMode)) throw new Error('Invalid automation approval mode')
    input.approvalMode = record.approvalMode
  } else if (!partial && taskType === 'ai_automation') {
    input.approvalMode = DEFAULT_APPROVAL_MODE
  }
  if (record.outputDestinations !== undefined) {
    input.outputDestinations = normalizeOutputDestinations(record.outputDestinations) ?? DEFAULT_OUTPUT_DESTINATIONS
  } else if (!partial && taskType === 'ai_automation') {
    input.outputDestinations = DEFAULT_OUTPUT_DESTINATIONS
  }
  if (record.notifyPolicy !== undefined) {
    if (!isNotifyPolicy(record.notifyPolicy)) throw new Error('Invalid automation notify policy')
    input.notifyPolicy = record.notifyPolicy
  } else if (!partial && taskType === 'ai_automation') {
    input.notifyPolicy = DEFAULT_NOTIFY_POLICY
  }
  if (record.budgets !== undefined) input.budgets = normalizeBudgets(record.budgets) ?? {}
  if (record.automationChatSessionId !== undefined) {
    if (typeof record.automationChatSessionId !== 'string') throw new Error('Automation chat session id must be a string')
    input.automationChatSessionId = record.automationChatSessionId.trim().slice(0, 200)
  }
  if (record.dueAt !== undefined) {
    const rawDueAt = typeof record.dueAt === 'number' ? record.dueAt : Date.parse(String(record.dueAt))
    const dueAt = typeof record.dueAt === 'number' && rawDueAt < 10_000_000_000 ? rawDueAt * 1000 : rawDueAt
    if (!Number.isFinite(dueAt) || dueAt < Date.now() - 60_000) throw new Error('Invalid scheduled task due time')
    input.dueAt = dueAt
    if (taskType === 'ai_automation' && record.schedule === undefined) {
      input.schedule = { kind: 'once' }
    }
  }
  if (taskType === 'ai_automation' && input.schedule?.kind === 'once' && input.dueAt === undefined && !partial) {
    throw new Error('One-off automations require a due time')
  }
  return input
}

export const sanitizeMonitorInput = sanitizeScheduledTaskInput

export async function listScheduledTasks(): Promise<ScheduledTaskDefinition[]> {
  return (await readIndex()).tasks
}

export const listMonitors = listScheduledTasks

export async function listRuns(taskId?: string): Promise<ScheduledTaskRun[]> {
  const runs = (await readIndex()).runs
  return taskId ? runs.filter((run) => run.taskId === taskId) : runs
}

export async function getRun(runId: string): Promise<ScheduledTaskRun | null> {
  return (await readIndex()).runs.find((run) => run.id === runId) ?? null
}

export async function getScheduledTask(id: string): Promise<ScheduledTaskDefinition | null> {
  return (await readIndex()).tasks.find((task) => task.id === id) ?? null
}

export const getMonitor = getScheduledTask

export async function createScheduledTask(input: ScheduledTaskInput): Promise<ScheduledTaskDefinition> {
  return withWriteLock(async (index) => {
    if (index.tasks.length >= MAX_TASKS) throw new Error(`At most ${MAX_TASKS} scheduled tasks are supported`)
    const now = Date.now()
    const intervalPreset = input.intervalPreset ?? DEFAULT_INTERVAL_PRESET
    const schedule = input.schedule ?? (
      input.type === 'ai_automation'
        ? input.dueAt
          ? { kind: 'once' as const }
          : { kind: 'interval' as const, intervalPreset }
        : undefined
    )
    const task: ScheduledTaskDefinition = {
      id: randomUUID(),
      type: input.type,
      title: input.title,
      enabled: input.enabled !== false,
      urls: input.urls ?? [],
      ...(input.reminderText ? { reminderText: input.reminderText } : {}),
      instructions: input.instructions || '',
      intervalPreset,
      ...(schedule ? { schedule } : {}),
      ...(input.type === 'ai_automation'
        ? {
            prompt: input.prompt || '',
            automationMode: input.automationMode ?? DEFAULT_AUTOMATION_MODE,
            contextSources: input.contextSources ?? [{ type: 'current_datetime' }],
            allowedTools: input.allowedTools ?? [],
            approvalMode: input.approvalMode ?? DEFAULT_APPROVAL_MODE,
            outputDestinations: input.outputDestinations ?? DEFAULT_OUTPUT_DESTINATIONS,
            notifyPolicy: input.notifyPolicy ?? DEFAULT_NOTIFY_POLICY,
            ...(input.budgets ? { budgets: input.budgets } : {}),
            ...(input.automationChatSessionId ? { automationChatSessionId: input.automationChatSessionId } : {}),
          }
        : {}),
      createdAt: now,
      updatedAt: now,
      nextRunAt: calculateScheduledNextRunAt(now, intervalPreset, schedule, input.dueAt),
    }
    await persistIndex({ ...index, tasks: [task, ...index.tasks] })
    return task
  })
}

export const createMonitor = createScheduledTask

export async function updateScheduledTask(id: string, patch: ScheduledTaskUpdateInput): Promise<ScheduledTaskDefinition | null> {
  return withWriteLock(async (index) => {
    const existing = index.tasks.find((task) => task.id === id)
    if (!existing) return null
    const now = Date.now()
    const { dueAt, ...definitionPatch } = patch
    const intervalPreset = patch.intervalPreset ?? existing.intervalPreset
    const schedule = patch.dueAt !== undefined && existing.type === 'ai_automation'
      ? { kind: 'once' as const }
      : patch.schedule ?? existing.schedule
    const nextRunAt = dueAt ?? (patch.intervalPreset || patch.schedule ? calculateScheduledNextRunAt(now, intervalPreset, schedule) : existing.nextRunAt)
    const task: ScheduledTaskDefinition = {
      ...existing,
      ...definitionPatch,
      intervalPreset,
      ...(schedule ? { schedule } : {}),
      updatedAt: now,
      nextRunAt,
    }
    await persistIndex({
      ...index,
      tasks: index.tasks.map((item) => (item.id === id ? task : item)),
    })
    return task
  })
}

export const updateMonitor = updateScheduledTask

export async function deleteScheduledTask(id: string): Promise<boolean> {
  return withWriteLock(async (index) => {
    const existed = index.tasks.some((task) => task.id === id)
    if (!existed) return false
    await persistIndex({
      tasks: index.tasks.filter((task) => task.id !== id),
      snapshots: index.snapshots.filter((snapshot) => snapshot.taskId !== id),
      runs: index.runs.filter((run) => run.taskId !== id),
      version: INDEX_VERSION,
    })
    return true
  })
}

export const deleteMonitor = deleteScheduledTask

export async function saveScheduledTaskRun(
  task: ScheduledTaskDefinition,
  run: ScheduledTaskRun,
  snapshots: ScheduledTaskSnapshot[]
): Promise<void> {
  await withWriteLock(async (index) => {
    const snapshotKeys = new Set(snapshots.map((snapshot) => `${snapshot.taskId}:${snapshot.url}`))
    const nextSnapshots = [
      ...snapshots,
      ...index.snapshots.filter((snapshot) => !snapshotKeys.has(`${snapshot.taskId}:${snapshot.url}`)),
    ]
    await persistIndex({
      tasks: index.tasks.map((item) =>
        item.id === task.id
          ? {
              ...item,
              enabled: item.schedule?.kind === 'once' ? false : item.enabled,
              lastRunAt: run.finishedAt,
              nextRunAt: calculateScheduledNextRunAt(run.finishedAt, item.intervalPreset, item.schedule),
            }
          : item
      ),
      snapshots: nextSnapshots,
      runs: [run, ...index.runs],
      version: INDEX_VERSION,
    })
  })
}

export const saveMonitorRun = saveScheduledTaskRun

export async function getSnapshotsForTask(taskId: string): Promise<ScheduledTaskSnapshot[]> {
  return (await readIndex()).snapshots.filter((snapshot) => snapshot.taskId === taskId)
}

export const getSnapshotsForMonitor = getSnapshotsForTask

export const __test__ = {
  normalizeIndex,
  createEmptyIndex,
  getIndexPath,
  calculateScheduledNextRunAt,
}
