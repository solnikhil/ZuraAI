import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import type {
  ScheduledTaskDefinition,
  ScheduledTaskRun,
  ScheduledTaskStatus,
  ScheduledTaskType,
} from '@/electron/types'
import { useAppShell } from '@/contexts/AppShellContext'
import { useComposerDraft } from '@/contexts/ComposerDraftContext'
import { AlertCircle, Brain, Loader2, X } from '../icons'
import { Badge } from '../ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { motionSpring } from '@/lib/motion'
import { motion } from 'framer-motion'
import { Copy, MoreVertical, Pause, Pencil, Play, Trash2 } from 'lucide-react'
import './RemindersView.css'

type DrawerMode = 'logs' | 'details'
type TaskFilter = 'all' | 'reminder' | 'web_lookout' | 'ai_automation' | 'paused' | 'logs'

const AUTOMATION_TEMPLATES = [
  'Create an AI automation for a morning briefing every weekday at 8 AM.',
  'Create an AI automation that sweeps my inbox and calendar for follow-ups.',
  'Create a competitor monitor AI automation that only notifies me when something meaningful changes.',
  'Create a weekly project summary AI automation for a folder.',
  'Create a research tracker AI automation for a topic I choose.',
  'Create a local file digest AI automation.',
  'Create a price/deal watch AI automation.',
  'Create a learning quiz AI automation that runs every morning.',
  'Create an AI watch automation that only tells me if this changed.',
]

const STATUS_LABELS: Record<ScheduledTaskStatus, string> = {
  changed: 'Changed',
  unchanged: 'No change',
  error: 'Error',
}

function formatDate(value?: number): string {
  if (!value) return 'Not run yet'
  return new Date(value).toLocaleString()
}

function formatRelativeNextRun(value?: number): string {
  if (!value) return 'not scheduled'
  const deltaMs = value - Date.now()
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
  return deltaMs >= 0 ? `${tense} ${days} day${days === 1 ? '' : 's'}` : `${days} day${days === 1 ? '' : 's'} overdue`
}

function formatIntervalPreset(value: ScheduledTaskDefinition['intervalPreset']): string {
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

function latestRunForTask(runs: ScheduledTaskRun[], taskId: string): ScheduledTaskRun | undefined {
  return runs.find((run) => run.taskId === taskId)
}

function formatSchedule(task: ScheduledTaskDefinition): string {
  const schedule = task.schedule
  if (!schedule || schedule.kind === 'interval') return `Every ${formatIntervalPreset(schedule?.intervalPreset ?? task.intervalPreset)}`
  if (schedule.kind === 'once') return 'One time'
  if (schedule.kind === 'daily') return `Daily at ${schedule.timeOfDay ?? '09:00'}`
  const days = schedule.weekdays?.length ? schedule.weekdays.join(', ') : 'selected days'
  return `Weekly ${days} at ${schedule.timeOfDay ?? '09:00'}`
}

function taskTypeLabel(type: ScheduledTaskType): string {
  if (type === 'web_lookout') return 'Lookout'
  if (type === 'ai_automation') return 'AI Automation'
  return 'Reminder'
}

function buildEditPrompt(task: ScheduledTaskDefinition): string {
  const urls = task.urls.length > 0 ? task.urls.join(', ') : 'none'
  const reminderText = task.reminderText?.trim() || 'none'
  const instructions = task.instructions.trim() || 'none'

  return [
    'Help me edit this scheduled reminder/lookout.',
    '',
    `Task id: ${task.id}`,
    `Title: ${task.title}`,
    `Type: ${task.type}`,
    `Enabled: ${task.enabled ? 'yes' : 'no'}`,
    `Repeat preset: ${task.intervalPreset}`,
    task.schedule ? `Schedule: ${JSON.stringify(task.schedule)}` : '',
    `Next run: ${formatDate(task.nextRunAt)}`,
    `URLs: ${urls}`,
    `Reminder text: ${reminderText}`,
    task.prompt ? `Automation prompt: ${task.prompt}` : '',
    task.automationMode ? `Automation mode: ${task.automationMode}` : '',
    task.approvalMode ? `Approval mode: ${task.approvalMode}` : '',
    task.notifyPolicy ? `Notify policy: ${task.notifyPolicy}` : '',
    task.outputDestinations ? `Output destinations: ${task.outputDestinations.join(', ')}` : '',
    `Instructions: ${instructions}`,
    '',
    'Ask me what should change, then use scheduled_task_update when ready.',
  ].join('\n')
}

export default function RemindersView(): React.ReactElement {
  const [tasks, setTasks] = useState<ScheduledTaskDefinition[]>([])
  const [runs, setRuns] = useState<ScheduledTaskRun[]>([])
  const [drawer, setDrawer] = useState<{ taskId: string; mode: DrawerMode } | null>(null)
  const [activeFilter, setActiveFilter] = useState<TaskFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { setDashboardView } = useAppShell()
  const { setDraftText } = useComposerDraft()

  const load = useCallback(async () => {
    if (!window.scheduledTasks) {
      setError('Scheduled tasks are unavailable in this environment.')
      setLoading(false)
      return
    }

    try {
      const [nextTasks, nextRuns] = await Promise.all([
        window.scheduledTasks.list(),
        window.scheduledTasks.listRuns(),
      ])
      setTasks(nextTasks)
      setRuns(nextRuns)
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return window.scheduledTasks?.onChanged(() => {
      void load()
    })
  }, [load])

  const reminders = useMemo(() => tasks.filter((task) => task.type === 'reminder'), [tasks])
  const lookouts = useMemo(() => tasks.filter((task) => task.type === 'web_lookout'), [tasks])
  const automations = useMemo(() => tasks.filter((task) => task.type === 'ai_automation'), [tasks])
  const pausedTasks = useMemo(() => tasks.filter((task) => !task.enabled), [tasks])
  const tasksWithLogs = useMemo(
    () => tasks.filter((task) => runs.some((run) => run.taskId === task.id)),
    [tasks, runs]
  )
  const filteredTasks = useMemo(() => {
    switch (activeFilter) {
      case 'reminder':
        return reminders
      case 'web_lookout':
        return lookouts
      case 'ai_automation':
        return automations
      case 'paused':
        return pausedTasks
      case 'logs':
        return tasksWithLogs
      case 'all':
      default:
        return tasks
    }
  }, [activeFilter, automations, lookouts, pausedTasks, reminders, tasks, tasksWithLogs])
  const drawerTask = drawer ? tasks.find((task) => task.id === drawer.taskId) ?? null : null
  const drawerMode = drawer?.mode ?? 'logs'
  const drawerRuns = useMemo(
    () => (drawerTask ? runs.filter((run) => run.taskId === drawerTask.id) : []),
    [drawerTask, runs]
  )

  const askAgent = useCallback((message: string) => {
    setDraftText(message)
    setDashboardView('chat')
  }, [setDraftText, setDashboardView])

  const toggleEnabled = async (task: ScheduledTaskDefinition) => {
    await window.scheduledTasks.update(task.id, { enabled: !task.enabled })
    await load()
  }

  const runTaskNow = async (taskId: string) => {
    await window.scheduledTasks.runNow(taskId)
    await load()
  }

  const deleteTask = async (taskId: string) => {
    await window.scheduledTasks.delete(taskId)
    if (drawer?.taskId === taskId) setDrawer(null)
    await load()
  }

  const duplicateTask = async (task: ScheduledTaskDefinition) => {
    await window.scheduledTasks.create({
      type: task.type,
      title: `${task.title} copy`,
      enabled: false,
      urls: task.urls,
      reminderText: task.reminderText,
      instructions: task.instructions,
      intervalPreset: task.intervalPreset,
      schedule: task.schedule,
      prompt: task.prompt,
      automationMode: task.automationMode,
      contextSources: task.contextSources,
      allowedTools: task.allowedTools,
      approvalMode: task.approvalMode,
      outputDestinations: task.outputDestinations,
      notifyPolicy: task.notifyPolicy,
      budgets: task.budgets,
    })
    await load()
  }

  const renderDetailField = (label: string, value: ReactNode) => (
    <Field orientation="horizontal" className="reminders-view__detail-field">
      <FieldLabel className="reminders-view__detail-label">{label}</FieldLabel>
      <div className="reminders-view__detail-value">{value}</div>
    </Field>
  )

  const renderTaskRow = (task: ScheduledTaskDefinition, index: number) => {
    const rowTone = !task.enabled
      ? 'paused'
      : latestRunForTask(runs, task.id)?.status === 'error'
        ? 'error'
        : task.type === 'web_lookout'
          ? 'lookout'
          : 'active'

    return (
      <article key={task.id} className={`reminders-view__row reminders-view__row--${rowTone}`}>
        <span className="reminders-view__row-number" aria-hidden="true">
          {index + 1}
        </span>
        <div className="reminders-view__row-main">
          <div className="reminders-view__row-content">
            <h4>{task.title}</h4>
            <div className="reminders-view__badge-row">
              <Badge variant="outline" className="reminders-view__type-badge">
                {taskTypeLabel(task.type)}
              </Badge>
              <Badge
                variant="outline"
                className={`reminders-view__status-badge ${task.enabled ? 'reminders-view__status-badge--active' : 'reminders-view__status-badge--paused'}`}
              >
                {task.enabled ? 'Active' : 'Paused'}
              </Badge>
              <Badge variant="outline" className="reminders-view__type-badge">
                {formatSchedule(task)}
              </Badge>
              {task.type === 'ai_automation' && (
                <Badge variant="outline" className="reminders-view__type-badge">
                  {task.automationMode ?? 'prompt'}
                </Badge>
              )}
              <Badge variant="outline" className="reminders-view__date-badge">
                {formatRelativeNextRun(task.nextRunAt)}
              </Badge>
            </div>
          </div>
        </div>

        <div className="reminders-view__row-actions">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="reminders-view__logs-btn"
            onClick={() => setDrawer({ taskId: task.id, mode: 'logs' })}
          >
            Logs
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="reminders-view__menu-trigger"
                aria-label="More actions"
              >
                <MoreVertical size={18} strokeWidth={2.25} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="zura-menu-surface--compact w-[155px]">
              <DropdownMenuItem
                onSelect={() => void runTaskNow(task.id)}
                className="zura-menu-item--compact"
              >
                <Play className="h-3.5 w-3.5 text-[var(--theme-text-secondary)]" />
                Run now
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setDrawer({ taskId: task.id, mode: 'details' })}
                className="zura-menu-item--compact"
              >
                <Pencil className="h-3.5 w-3.5 text-[var(--theme-text-secondary)]" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void toggleEnabled(task)}
                className="zura-menu-item--compact"
              >
                {task.enabled ? (
                  <Pause className="h-3.5 w-3.5 text-[var(--theme-text-secondary)]" />
                ) : (
                  <Play className="h-3.5 w-3.5 text-[var(--theme-text-secondary)]" />
                )}
                {task.enabled ? 'Pause' : 'Resume'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void duplicateTask(task)}
                className="zura-menu-item--compact"
              >
                <Copy className="h-3.5 w-3.5 text-[var(--theme-text-secondary)]" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => void deleteTask(task.id)}
                className="zura-menu-item--compact"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </article>
    )
  }

  const renderCombinedGroup = () => {
    const filterLabels: Array<{ id: TaskFilter; label: string; count: number }> = [
      { id: 'all', label: 'All', count: tasks.length },
      { id: 'reminder', label: 'Reminders', count: reminders.length },
      { id: 'web_lookout', label: 'Lookouts', count: lookouts.length },
      { id: 'ai_automation', label: 'AI Automations', count: automations.length },
      { id: 'paused', label: 'Paused', count: pausedTasks.length },
      { id: 'logs', label: 'Logs', count: tasksWithLogs.length },
    ]

    return (
      <section className="reminders-view__group" aria-labelledby="reminders-all">
        <Tabs
          value={activeFilter}
          onValueChange={(value) => setActiveFilter(value as TaskFilter)}
          className="reminders-view__tabs"
        >
          <TabsList variant="line" className="reminders-view__tabs-list">
            {filterLabels.map((filter) => (
              <TabsTrigger
                key={filter.id}
                value={filter.id}
                className="reminders-view__tabs-trigger"
              >
                <span>{filter.label}</span>
                <span className="reminders-view__tabs-count">{filter.count}</span>
                {activeFilter === filter.id && (
                  <motion.div
                    layoutId="reminders-active-tab-indicator"
                    className="reminders-view__tabs-indicator"
                    initial={false}
                    transition={motionSpring.bouncy}
                  />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <h3 id="reminders-all" className="reminders-view__sr-heading">
          {filterLabels.find((filter) => filter.id === activeFilter)?.label ?? 'All'} tasks
        </h3>
        <div className="reminders-view__rows">
          {filteredTasks.length === 0 ? (
            <div className="reminders-view__empty-state">
              <strong>No matching tasks</strong>
              <span>Ask the agent to create a reminder, lookout, or AI automation.</span>
              <div className="reminders-view__prompt-chips">
                {[
                  'Remind me tomorrow at 9 AM',
                  'Watch a changelog every hour',
                  'Check this page daily',
                  'Run a daily AI briefing',
                ].map((prompt) => (
                  <button key={prompt} type="button" onClick={() => askAgent(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            filteredTasks.map((task, index) => renderTaskRow(task, index))
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="reminders-view" aria-labelledby="reminders-title">
      <div className={`reminders-view__stage ${drawerTask ? 'reminders-view__stage--drawer-open' : ''}`}>
        <main className="reminders-view__panel">
          <header className="reminders-view__panel-header">
            <div>
              <h2 id="reminders-title">Reminders & Lookouts</h2>
              <p>Scheduled work, monitored pages, AI automations, local logs, and agent-managed updates.</p>
            </div>
            <Button
              variant="default"
              size="sm"
              className="reminders-view__ask-agent"
              onClick={() => askAgent('Help me create a reminder, lookout, or AI automation.')}
            >
              <Brain size={15} data-icon="inline-start" />
              Ask agent
            </Button>
          </header>

          {error && <div className="reminders-view__error"><AlertCircle size={15} /> {error}</div>}

          {loading ? (
            <div className="reminders-view__loading">
              <Loader2 className="reminders-view__spin" size={18} /> Loading scheduled items
            </div>
          ) : (
            <div className="reminders-view__content">
              {renderCombinedGroup()}
            </div>
          )}
        </main>

        {drawerTask && (
          <div className="reminders-view__drawer-divider" aria-hidden="true" />
        )}

        {drawerTask && (
          <aside className="reminders-view__drawer" aria-label={`${drawerMode === 'logs' ? 'Logs' : 'Details'} for ${drawerTask.title}`}>
            <div className="reminders-view__drawer-header">
              <div>
                <span>{drawerMode === 'logs' ? 'Run history' : 'Task details'}</span>
                <h3>{drawerTask.title}</h3>
              </div>
              <button type="button" className="reminders-view__icon-button" onClick={() => setDrawer(null)} aria-label="Close drawer">
                <X size={15} />
              </button>
            </div>

            {drawerMode === 'details' ? (
              <div className="reminders-view__details">
                <FieldGroup className="reminders-view__detail-group">
                  {renderDetailField(
                    'Type',
                    <Badge variant="outline" className="reminders-view__type-badge">
                      {taskTypeLabel(drawerTask.type)}
                    </Badge>
                  )}
                  {renderDetailField(
                    'Status',
                    <Badge
                      variant="outline"
                      className={`reminders-view__status-badge ${drawerTask.enabled ? 'reminders-view__status-badge--active' : 'reminders-view__status-badge--paused'}`}
                    >
                      {drawerTask.enabled ? 'Enabled' : 'Paused'}
                    </Badge>
                  )}
                  {renderDetailField('Schedule', formatSchedule(drawerTask))}
                  {renderDetailField('Next run', formatDate(drawerTask.nextRunAt))}
                  {renderDetailField(
                    drawerTask.type === 'web_lookout'
                      ? 'URLs'
                      : drawerTask.type === 'ai_automation'
                        ? 'Prompt'
                        : 'Reminder text',
                    drawerTask.type === 'web_lookout'
                      ? drawerTask.urls.join(', ') || 'None'
                      : drawerTask.type === 'ai_automation'
                        ? drawerTask.prompt || 'None'
                        : drawerTask.reminderText || 'None'
                  )}
                  {drawerTask.type === 'ai_automation' && (
                    <>
                      {renderDetailField('Mode', drawerTask.automationMode || 'prompt')}
                      {renderDetailField('Approval', drawerTask.approvalMode || 'read_only')}
                      {renderDetailField('Notify', drawerTask.notifyPolicy || 'every_run')}
                      {renderDetailField('Outputs', drawerTask.outputDestinations?.join(', ') || 'log')}
                      {renderDetailField('Tools', drawerTask.allowedTools?.join(', ') || 'None')}
                    </>
                  )}
                  {renderDetailField('Instructions', drawerTask.instructions || 'None')}
                  {drawerTask.type === 'ai_automation' && renderDetailField(
                    'Templates',
                    <div className="reminders-view__prompt-chips">
                      {AUTOMATION_TEMPLATES.slice(0, 4).map((prompt) => (
                        <button key={prompt} type="button" onClick={() => askAgent(prompt)}>
                          {prompt.replace(/^Create an AI automation (?:that |for )?/, '')}
                        </button>
                      ))}
                    </div>
                  )}
                </FieldGroup>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="reminders-view__agent-edit"
                  onClick={() => askAgent(buildEditPrompt(drawerTask))}
                >
                  Edit this with agent
                </Button>
              </div>
            ) : (
              <div className="reminders-view__runs">
                {drawerRuns.length === 0 ? (
                  <div className="reminders-view__empty-row">No logs recorded yet.</div>
                ) : (
                  drawerRuns.map((run) => (
                    <article key={run.id} className="reminders-view__run">
                      <div className="reminders-view__run-marker" aria-hidden="true" />
                      <div className="reminders-view__run-body">
                        <div className="reminders-view__run-top">
                          <Badge
                            variant={run.status === 'error' ? 'destructive' : 'outline'}
                            className="reminders-view__run-status"
                          >
                            {STATUS_LABELS[run.status]}
                          </Badge>
                          <time dateTime={new Date(run.startedAt).toISOString()}>{formatDate(run.startedAt)}</time>
                        </div>
                        {run.aiSummary && <p className="reminders-view__summary">{run.aiSummary}</p>}
                        {!run.aiSummary && run.diffSummary && <p className="reminders-view__summary">{run.diffSummary}</p>}
                        {!run.aiSummary && !run.diffSummary && run.outputText && <p className="reminders-view__summary">{run.outputText}</p>}
                        {run.changeVerdict?.summary && <p className="reminders-view__summary">{run.changeVerdict.summary}</p>}
                        {run.model && <p className="reminders-view__summary">Model: {run.model}</p>}
                        {run.error && <p className="reminders-view__run-error">{run.error}</p>}
                        {run.logs.length > 0 && (
                          <div className="reminders-view__log-list">
                            {run.logs.map((log, index) => (
                              <div key={`${run.id}-${index}`} className="reminders-view__log-row">
                                <strong>{log.status}</strong>
                                {log.url && <span>{log.url}</span>}
                                {log.message && <span>{log.message}</span>}
                                {log.changedExcerpt && <span>{log.changedExcerpt}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </section>
  )
}
