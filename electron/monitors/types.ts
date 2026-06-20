export type MonitorIntervalPreset = '1m' | '30m' | '1h' | '6h' | '12h' | 'daily' | 'weekly'

export type MonitorRunStatus = 'changed' | 'unchanged' | 'error'

export type MonitorUrlResultStatus = 'changed' | 'unchanged' | 'baseline' | 'error'

export type ScheduledTaskType = 'web_lookout' | 'reminder'

export type ScheduledTaskStatus = MonitorRunStatus

export type ScheduledTaskLogStatus = MonitorUrlResultStatus | 'completed'

export interface ScheduledTaskDefinition {
  id: string
  type: ScheduledTaskType
  title: string
  enabled: boolean
  urls: string[]
  reminderText?: string
  instructions: string
  intervalPreset: MonitorIntervalPreset
  createdAt: number
  updatedAt: number
  lastRunAt?: number
  nextRunAt: number
}

export interface ScheduledTaskSnapshot {
  taskId: string
  url: string
  contentHash: string
  normalizedTextExcerpt: string
  capturedAt: number
}

export interface ScheduledTaskLog {
  url: string
  status: ScheduledTaskLogStatus
  contentHash?: string
  previousHash?: string
  changedExcerpt?: string
  message?: string
  error?: string
}

export interface ScheduledTaskRun {
  id: string
  taskId: string
  startedAt: number
  finishedAt: number
  status: ScheduledTaskStatus
  logs: ScheduledTaskLog[]
  diffSummary?: string
  aiSummary?: string
  error?: string
}

export interface ScheduledTaskIndex {
  tasks: ScheduledTaskDefinition[]
  snapshots: ScheduledTaskSnapshot[]
  runs: ScheduledTaskRun[]
  version: number
}

export interface ScheduledTaskInput {
  type: ScheduledTaskType
  title: string
  enabled?: boolean
  urls?: string[]
  reminderText?: string
  instructions?: string
  intervalPreset?: MonitorIntervalPreset
  dueAt?: number
}

export type ScheduledTaskUpdateInput = Partial<ScheduledTaskInput>

export interface ScheduledTaskSummaryRequest {
  requestId: string
  taskId: string
  taskTitle: string
  instructions: string
  diffSummary: string
  changes: Array<{
    url: string
    excerpt: string
  }>
}

export interface ScheduledTaskSummaryResponse {
  requestId: string
  summary?: string
  error?: string
}

export type MonitorDefinition = ScheduledTaskDefinition
export type MonitorSnapshot = ScheduledTaskSnapshot
export type MonitorUrlResult = ScheduledTaskLog
export type MonitorRun = ScheduledTaskRun
export type MonitorIndex = ScheduledTaskIndex
export type MonitorInput = ScheduledTaskInput
export type MonitorUpdateInput = ScheduledTaskUpdateInput
export type MonitorSummaryRequest = ScheduledTaskSummaryRequest
export type MonitorSummaryResponse = ScheduledTaskSummaryResponse
