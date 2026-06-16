import { app } from 'electron'
import { randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { writeFileAtomic } from '../utils/atomicFile'
import { calculateNextRunAt, isMonitorIntervalPreset } from './schedule'
import { validateMonitorUrl } from './content'
import type {
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

function normalizeTask(input: unknown): ScheduledTaskDefinition | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<ScheduledTaskDefinition> & { name?: string; monitorId?: string }
  if (typeof raw.id !== 'string' || !raw.id) return null
  const type = raw.type === 'reminder' ? 'reminder' : 'web_lookout'
  const title = typeof raw.title === 'string' ? raw.title : raw.name
  if (typeof title !== 'string' || !title.trim()) return null
  if (type === 'web_lookout' && (!Array.isArray(raw.urls) || raw.urls.length === 0)) return null
  if (!isMonitorIntervalPreset(raw.intervalPreset)) return null
  if (typeof raw.createdAt !== 'number' || typeof raw.updatedAt !== 'number') return null
  return {
    id: raw.id,
    type,
    title: title.slice(0, MAX_NAME_LENGTH),
    enabled: raw.enabled !== false,
    urls: Array.isArray(raw.urls) ? raw.urls.filter((url): url is string => typeof url === 'string') : [],
    ...(typeof raw.reminderText === 'string' ? { reminderText: raw.reminderText.slice(0, MAX_INSTRUCTIONS_LENGTH) } : {}),
    instructions: typeof raw.instructions === 'string' ? raw.instructions.slice(0, MAX_INSTRUCTIONS_LENGTH) : '',
    intervalPreset: raw.intervalPreset,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    ...(typeof raw.lastRunAt === 'number' ? { lastRunAt: raw.lastRunAt } : {}),
    nextRunAt:
      typeof raw.nextRunAt === 'number'
        ? raw.nextRunAt
        : calculateNextRunAt(raw.updatedAt, raw.intervalPreset),
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
    if (record.type !== 'web_lookout' && record.type !== 'reminder') throw new Error('Invalid scheduled task type')
    input.type = record.type
  }
  const taskType = input.type ?? (record.type === 'reminder' ? 'reminder' : 'web_lookout')
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
  if (!partial || record.intervalPreset !== undefined) {
    if (!isMonitorIntervalPreset(record.intervalPreset)) throw new Error('Invalid monitor interval')
    input.intervalPreset = record.intervalPreset
  }
  if (record.dueAt !== undefined) {
    const dueAt = typeof record.dueAt === 'number' ? record.dueAt : Date.parse(String(record.dueAt))
    if (!Number.isFinite(dueAt) || dueAt < Date.now() - 60_000) throw new Error('Invalid scheduled task due time')
    input.dueAt = dueAt
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
    const task: ScheduledTaskDefinition = {
      id: randomUUID(),
      type: input.type,
      title: input.title,
      enabled: input.enabled !== false,
      urls: input.urls ?? [],
      ...(input.reminderText ? { reminderText: input.reminderText } : {}),
      instructions: input.instructions || '',
      intervalPreset: input.intervalPreset,
      createdAt: now,
      updatedAt: now,
      nextRunAt: input.dueAt ?? calculateNextRunAt(now, input.intervalPreset),
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
    const nextRunAt = dueAt ?? (patch.intervalPreset ? calculateNextRunAt(now, intervalPreset) : existing.nextRunAt)
    const task: ScheduledTaskDefinition = {
      ...existing,
      ...definitionPatch,
      intervalPreset,
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
              lastRunAt: run.finishedAt,
              nextRunAt: calculateNextRunAt(run.finishedAt, item.intervalPreset),
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
}
