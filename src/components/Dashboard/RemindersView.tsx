import { useCallback, useEffect, useMemo, useState } from 'react'

import type {
  ScheduledTaskDefinition,
  ScheduledTaskRun,
  ScheduledTaskStatus,
  ScheduledTaskType,
} from '@/electron/types'
import { useAppShell } from '@/contexts/AppShellContext'
import { useComposerDraft } from '@/contexts/ComposerDraftContext'
import { AlertCircle, Loader2, X } from '../icons'
import { Badge } from '../ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Pause, Pencil, Play, Trash2 } from 'lucide-react'
import './RemindersView.css'

type DrawerMode = 'logs' | 'details'

const STATUS_LABELS: Record<ScheduledTaskStatus, string> = {
  changed: 'Changed',
  unchanged: 'No change',
  error: 'Error',
}

function formatDate(value?: number): string {
  if (!value) return 'Not run yet'
  return new Date(value).toLocaleString()
}

function formatIntervalPreset(value: ScheduledTaskDefinition['intervalPreset']): string {
  switch (value) {
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

function taskTypeLabel(type: ScheduledTaskType): string {
  return type === 'web_lookout' ? 'Lookout' : 'Reminder'
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
    `Next run: ${formatDate(task.nextRunAt)}`,
    `URLs: ${urls}`,
    `Reminder text: ${reminderText}`,
    `Instructions: ${instructions}`,
    '',
    'Ask me what should change, then use scheduled_task_update when ready.',
  ].join('\n')
}

export default function RemindersView(): React.ReactElement {
  const [tasks, setTasks] = useState<ScheduledTaskDefinition[]>([])
  const [runs, setRuns] = useState<ScheduledTaskRun[]>([])
  const [drawer, setDrawer] = useState<{ taskId: string; mode: DrawerMode } | null>(null)
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

  const deleteTask = async (taskId: string) => {
    await window.scheduledTasks.delete(taskId)
    if (drawer?.taskId === taskId) setDrawer(null)
    await load()
  }

  const renderTaskRow = (task: ScheduledTaskDefinition) => {
    const latestRun = latestRunForTask(runs, task.id)

    return (
      <article key={task.id} className="reminders-view__row">
        <div className="reminders-view__row-main">
          <span
            className={`reminders-view__bullet ${task.enabled ? '' : 'reminders-view__bullet--paused'}`}
            aria-hidden="true"
            title={task.enabled ? 'Enabled' : 'Paused'}
          />
          <div className="reminders-view__row-content">
            <h4>{task.title}</h4>
            <div className="reminders-view__row-meta">
              <span>{formatDate(task.nextRunAt)}</span>
              <span className="reminders-view__meta-divider">-</span>
              <span>repeats {formatIntervalPreset(task.intervalPreset)}</span>
              <span className="reminders-view__meta-divider">-</span>
              <span>{latestRun ? STATUS_LABELS[latestRun.status] : 'Not run yet'}</span>
            </div>
          </div>
        </div>

        <div className="reminders-view__row-actions">
          <button
            type="button"
            className="reminders-view__logs-btn"
            onClick={() => setDrawer({ taskId: task.id, mode: 'logs' })}
          >
            Logs
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="reminders-view__menu-trigger"
                aria-label="More actions"
              >
                <MoreVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDrawer({ taskId: task.id, mode: 'details' })}>
                <Pencil size={14} />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void toggleEnabled(task)}>
                {task.enabled ? <Pause size={14} /> : <Play size={14} />}
                {task.enabled ? 'Pause' : 'Resume'}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => void deleteTask(task.id)}
              >
                <Trash2 size={14} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </article>
    )
  }

  const renderCombinedGroup = () => {
    const allTasks = [...reminders, ...lookouts]
    return (
      <section className="reminders-view__group" aria-labelledby="reminders-all">
        <div className="reminders-view__group-title">
          <h3 id="reminders-all">All Tasks</h3>
          <Badge variant="outline">{allTasks.length}</Badge>
        </div>
        <div className="reminders-view__rows">
          {allTasks.length === 0 ? (
            <div className="reminders-view__empty-row">No tasks yet. Ask the agent to schedule one.</div>
          ) : (
            allTasks.map(renderTaskRow)
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
              <p>Scheduled work, local logs, and AI-managed edits in one place.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="reminders-view__ask-agent"
              onClick={() => askAgent('Help me create a reminder or lookout.')}
            >
              Ask agent
            </Button>
          </header>
          <div className="reminders-view__divider" />

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
                <dl>
                  <div><dt>Type</dt><dd>{taskTypeLabel(drawerTask.type)}</dd></div>
                  <div><dt>Status</dt><dd>{drawerTask.enabled ? 'Enabled' : 'Paused'}</dd></div>
                  <div><dt>Repeats</dt><dd>{formatIntervalPreset(drawerTask.intervalPreset)}</dd></div>
                  <div><dt>Next run</dt><dd>{formatDate(drawerTask.nextRunAt)}</dd></div>
                  <div><dt>{drawerTask.type === 'web_lookout' ? 'URLs' : 'Reminder text'}</dt><dd>{drawerTask.type === 'web_lookout' ? drawerTask.urls.join(', ') || 'None' : drawerTask.reminderText || 'None'}</dd></div>
                  <div><dt>Instructions</dt><dd>{drawerTask.instructions || 'None'}</dd></div>
                </dl>
                <button
                  type="button"
                  className="reminders-view__agent-edit"
                  onClick={() => askAgent(buildEditPrompt(drawerTask))}
                >
                  Edit this with agent
                </button>
              </div>
            ) : (
              <div className="reminders-view__runs">
                {drawerRuns.length === 0 ? (
                  <div className="reminders-view__empty-row">No logs recorded yet.</div>
                ) : (
                  drawerRuns.map((run) => (
                    <article key={run.id} className="reminders-view__run">
                      <div className="reminders-view__run-top">
                        <Badge variant={run.status === 'error' ? 'destructive' : 'outline'}>{STATUS_LABELS[run.status]}</Badge>
                        <span>{formatDate(run.startedAt)}</span>
                      </div>
                      {run.aiSummary && <p className="reminders-view__summary">{run.aiSummary}</p>}
                      {!run.aiSummary && run.diffSummary && <p className="reminders-view__summary">{run.diffSummary}</p>}
                      {run.error && <p className="reminders-view__run-error">{run.error}</p>}
                      {run.logs.map((log, index) => (
                        <div key={`${run.id}-${index}`} className="reminders-view__log-row">
                          <strong>{log.status}</strong>
                          {log.url && <span>{log.url}</span>}
                          {log.message && <span>{log.message}</span>}
                          {log.changedExcerpt && <span>{log.changedExcerpt}</span>}
                        </div>
                      ))}
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
