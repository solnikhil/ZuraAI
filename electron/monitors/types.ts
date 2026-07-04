export type MonitorIntervalPreset = '1m' | '30m' | '1h' | '6h' | '12h' | 'daily' | 'weekly'

export type MonitorRunStatus = 'changed' | 'unchanged' | 'error'

export type MonitorUrlResultStatus = 'changed' | 'unchanged' | 'baseline' | 'error'

export type ScheduledTaskType = 'web_lookout' | 'reminder' | 'ai_automation'

export type ScheduledTaskStatus = MonitorRunStatus

export type ScheduledTaskLogStatus = MonitorUrlResultStatus | 'completed'

export type ScheduledAutomationMode = 'prompt' | 'watch' | 'agent'

export type ScheduledAutomationApprovalMode = 'read_only' | 'ask_each_run' | 'trusted_repeat'

export type ScheduledAutomationOutputDestination = 'log' | 'notification' | 'email' | 'chat' | 'artifact'

export type ScheduledAutomationNotifyPolicy = 'every_run' | 'meaningful_change' | 'error_only'

export interface ScheduledAutomationSchedule {
  kind: 'interval' | 'daily' | 'weekly' | 'once'
  intervalPreset?: MonitorIntervalPreset
  timeOfDay?: string
  weekdays?: number[]
  timezone?: string
  workHours?: {
    enabled: boolean
    start: string
    end: string
  }
}

export interface ScheduledAutomationContextSource {
  type: 'current_datetime' | 'folder_memory' | 'chat' | 'url' | 'file' | 'mcp_resource'
  id?: string
  label?: string
  value?: string
}

export interface ScheduledAutomationBudgets {
  timeoutMs?: number
  maxToolCalls?: number
  maxWebSearches?: number
  maxTokens?: number
}

export interface ScheduledTaskDefinition {
  id: string
  type: ScheduledTaskType
  title: string
  enabled: boolean
  urls: string[]
  reminderText?: string
  instructions: string
  intervalPreset: MonitorIntervalPreset
  schedule?: ScheduledAutomationSchedule
  prompt?: string
  automationMode?: ScheduledAutomationMode
  contextSources?: ScheduledAutomationContextSource[]
  allowedTools?: string[]
  approvalMode?: ScheduledAutomationApprovalMode
  outputDestinations?: ScheduledAutomationOutputDestination[]
  notifyPolicy?: ScheduledAutomationNotifyPolicy
  budgets?: ScheduledAutomationBudgets
  automationChatSessionId?: string
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
  promptSnapshot?: string
  resolvedContextSummary?: string
  model?: string
  provider?: string
  outputText?: string
  artifactIds?: string[]
  generatedFiles?: Array<{ id: string; name: string; type?: string }>
  toolCallSummaries?: Array<{ name: string; success: boolean; error?: string }>
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    cost?: number
  }
  changeVerdict?: {
    changed: boolean
    summary?: string
  }
  deliveryStatus?: Partial<Record<ScheduledAutomationOutputDestination, 'sent' | 'skipped' | 'error'>>
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
  schedule?: ScheduledAutomationSchedule
  prompt?: string
  automationMode?: ScheduledAutomationMode
  contextSources?: ScheduledAutomationContextSource[]
  allowedTools?: string[]
  approvalMode?: ScheduledAutomationApprovalMode
  outputDestinations?: ScheduledAutomationOutputDestination[]
  notifyPolicy?: ScheduledAutomationNotifyPolicy
  budgets?: ScheduledAutomationBudgets
  automationChatSessionId?: string
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

export interface ScheduledAutomationRunRequest {
  requestId: string
  taskId: string
  taskTitle: string
  prompt: string
  instructions: string
  automationMode: ScheduledAutomationMode
  contextSources: ScheduledAutomationContextSource[]
  allowedTools: string[]
  approvalMode: ScheduledAutomationApprovalMode
  outputDestinations: ScheduledAutomationOutputDestination[]
  notifyPolicy: ScheduledAutomationNotifyPolicy
  budgets: ScheduledAutomationBudgets
  previousOutput?: string
}

export interface ScheduledAutomationRunResponse {
  requestId: string
  outputText?: string
  resolvedContextSummary?: string
  model?: string
  provider?: string
  artifactIds?: string[]
  generatedFiles?: Array<{ id: string; name: string; type?: string }>
  toolCallSummaries?: Array<{ name: string; success: boolean; error?: string }>
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    cost?: number
  }
  changeVerdict?: {
    changed: boolean
    summary?: string
  }
  deliveryStatus?: Partial<Record<ScheduledAutomationOutputDestination, 'sent' | 'skipped' | 'error'>>
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
