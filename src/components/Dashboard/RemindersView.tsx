import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import type { ScheduledTaskDefinition, ScheduledTaskRun, ScheduledTaskType } from '@/electron/types'
import { useAppShell } from '@/contexts/AppShellContext'
import { useChatHistory } from '@/contexts/ChatHistoryContext'
import { useComposerDraft } from '@/contexts/ComposerDraftContext'
import { AlertCircle, Brain, Loader2, X } from '../icons'
import { Badge } from '../ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { motionSpring } from '@/lib/motion'
import { motion } from 'framer-motion'
import {
  Copy,
  ExternalLink,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  INTERVAL_OPTIONS,
  WEEKDAY_LABELS,
  approvalModeLabel,
  automationModeLabel,
  buildCreateInput,
  emptyFormState,
  formStateFromTask,
  formatDate,
  formatRelativeNextRun,
  formatSchedule,
  notifyPolicyLabel,
  outputDestinationsLabel,
  runStatusLabel,
  summarizeLastRun,
  taskTypeLabel,
  validateForm,
  type ScheduleFormState,
  type ScheduleKindOption,
} from './remindersViewModel'
import './RemindersView.css'

type DrawerMode = 'logs' | 'details' | 'create' | 'edit'
type TaskFilter = 'all' | 'reminder' | 'web_lookout' | 'ai_automation' | 'paused' | 'logs'

const OUTPUT_OPTIONS: Array<{
  id: ScheduleFormState['outputDestinations'][number]
  label: string
}> = [
  { id: 'log', label: 'Log' },
  { id: 'notification', label: 'Notification' },
  { id: 'email', label: 'Email' },
  { id: 'chat', label: 'Chat' },
  { id: 'artifact', label: 'Artifact' },
]

function latestRunForTask(runs: ScheduledTaskRun[], taskId: string): ScheduledTaskRun | undefined {
  return runs.find((run) => run.taskId === taskId)
}

export default function RemindersView(): React.ReactElement {
  const [tasks, setTasks] = useState<ScheduledTaskDefinition[]>([])
  const [runs, setRuns] = useState<ScheduledTaskRun[]>([])
  const [drawer, setDrawer] = useState<{
    mode: DrawerMode
    taskId?: string
  } | null>(null)
  const [form, setForm] = useState<ScheduleFormState>(() => emptyFormState('reminder'))
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ScheduledTaskDefinition | null>(null)
  const [activeFilter, setActiveFilter] = useState<TaskFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const { setDashboardView } = useAppShell()
  const { setDraftText } = useComposerDraft()
  const { switchSession, sessions } = useChatHistory()

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

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

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

  const drawerTask =
    drawer?.taskId != null ? (tasks.find((task) => task.id === drawer.taskId) ?? null) : null
  const drawerMode = drawer?.mode ?? null
  const drawerRuns = useMemo(
    () => (drawerTask ? runs.filter((run) => run.taskId === drawerTask.id) : []),
    [drawerTask, runs]
  )
  const formOpen = drawerMode === 'create' || drawerMode === 'edit'

  const askAgent = useCallback(
    (message: string) => {
      setDraftText(message)
      setDashboardView('chat')
    },
    [setDraftText, setDashboardView]
  )

  const openCreate = (type: ScheduledTaskType = 'reminder') => {
    setForm(emptyFormState(type))
    setFormError(null)
    setDrawer({ mode: 'create' })
  }

  const openEdit = (task: ScheduledTaskDefinition) => {
    setForm(formStateFromTask(task))
    setFormError(null)
    setDrawer({ mode: 'edit', taskId: task.id })
  }

  const openDetails = (task: ScheduledTaskDefinition) => {
    setDrawer({ mode: 'details', taskId: task.id })
  }

  const openLogs = (task: ScheduledTaskDefinition) => {
    setDrawer({ mode: 'logs', taskId: task.id })
  }

  const patchForm = <K extends keyof ScheduleFormState>(key: K, value: ScheduleFormState[K]) => {
    setForm((prev) => {
      if (key === 'type') {
        const nextType = value as ScheduledTaskType
        return {
          ...prev,
          type: nextType,
          scheduleKind:
            nextType === 'ai_automation' && prev.scheduleKind === 'interval'
              ? 'agent'
              : nextType !== 'ai_automation' && prev.scheduleKind === 'agent'
                ? 'interval'
                : prev.scheduleKind,
        }
      }
      return { ...prev, [key]: value }
    })
    setFormError(null)
  }

  const saveForm = async () => {
    const validationError = validateForm(form)
    if (validationError) {
      setFormError(validationError)
      return
    }
    if (!window.scheduledTasks) return
    setSaving(true)
    setFormError(null)
    try {
      const payload = buildCreateInput(form)
      if (drawerMode === 'edit' && drawer?.taskId) {
        await window.scheduledTasks.update(drawer.taskId, payload)
      } else {
        await window.scheduledTasks.create(payload)
      }
      setDrawer(null)
      await load()
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (task: ScheduledTaskDefinition) => {
    await window.scheduledTasks.update(task.id, { enabled: !task.enabled })
    await load()
  }

  const runTaskNow = async (taskId: string) => {
    await window.scheduledTasks.runNow(taskId)
    await load()
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await window.scheduledTasks.delete(deleteTarget.id)
    if (drawer?.taskId === deleteTarget.id) setDrawer(null)
    setDeleteTarget(null)
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

  const openAutomationChat = (sessionId: string) => {
    const exists = sessions.some((session) => session.id === sessionId)
    if (!exists) {
      setError('That automation chat is no longer available in history.')
      return
    }
    switchSession(sessionId)
    setDashboardView('chat')
  }

  const renderDetailField = (label: string, value: ReactNode) => (
    <Field orientation="horizontal" className="reminders-view__detail-field">
      <FieldLabel className="reminders-view__detail-label">{label}</FieldLabel>
      <div className="reminders-view__detail-value">{value}</div>
    </Field>
  )

  const renderTaskRow = (task: ScheduledTaskDefinition, index: number) => {
    const lastRun = latestRunForTask(runs, task.id)
    const lastSummary = summarizeLastRun(lastRun, task.type)
    const rowTone = !task.enabled
      ? 'paused'
      : lastRun?.status === 'error'
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
                  {automationModeLabel(task.automationMode)}
                </Badge>
              )}
              <Badge variant="outline" className="reminders-view__date-badge">
                Next {formatRelativeNextRun(task.nextRunAt, nowTick)}
              </Badge>
            </div>
            {lastSummary && <p className="reminders-view__last-result">{lastSummary}</p>}
          </div>
        </div>

        <div className="reminders-view__row-actions">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="reminders-view__logs-btn"
            onClick={() => openLogs(task)}
          >
            History
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
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              className="zura-menu-surface--compact w-[170px]"
            >
              <DropdownMenuItem
                onSelect={() => void runTaskNow(task.id)}
                className="zura-menu-item--compact"
              >
                <Play className="h-3.5 w-3.5 text-[var(--theme-text-secondary)]" />
                Run now
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openEdit(task)} className="zura-menu-item--compact">
                <Pencil className="h-3.5 w-3.5 text-[var(--theme-text-secondary)]" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => openDetails(task)}
                className="zura-menu-item--compact"
              >
                View details
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
                onSelect={() => setDeleteTarget(task)}
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

  const renderForm = () => (
    <div className="reminders-view__form">
      <FieldGroup className="reminders-view__form-group">
        <Field className="reminders-view__form-field">
          <FieldLabel>Type</FieldLabel>
          <Select
            value={form.type}
            onValueChange={(value) => patchForm('type', value as ScheduledTaskType)}
            disabled={drawerMode === 'edit'}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="reminder">Reminder</SelectItem>
              <SelectItem value="web_lookout">Lookout (watch URLs)</SelectItem>
              <SelectItem value="ai_automation">AI automation</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field className="reminders-view__form-field">
          <FieldLabel>Title</FieldLabel>
          <Input
            value={form.title}
            onChange={(event) => patchForm('title', event.target.value)}
            placeholder="Short name"
          />
        </Field>

        {form.type === 'reminder' && (
          <Field className="reminders-view__form-field">
            <FieldLabel>Reminder text</FieldLabel>
            <Textarea
              value={form.reminderText}
              onChange={(event) => patchForm('reminderText', event.target.value)}
              placeholder="What should I remind you about?"
              rows={3}
            />
          </Field>
        )}

        {form.type === 'web_lookout' && (
          <Field className="reminders-view__form-field">
            <FieldLabel>URLs to watch</FieldLabel>
            <Textarea
              value={form.urlsText}
              onChange={(event) => patchForm('urlsText', event.target.value)}
              placeholder="One URL per line"
              rows={3}
            />
          </Field>
        )}

        {form.type === 'ai_automation' && (
          <>
            <Field className="reminders-view__form-field">
              <FieldLabel>Prompt</FieldLabel>
              <Textarea
                value={form.prompt}
                onChange={(event) => patchForm('prompt', event.target.value)}
                placeholder="What should the automation do each run?"
                rows={4}
              />
            </Field>
            <Field className="reminders-view__form-field">
              <FieldLabel>Mode</FieldLabel>
              <Select
                value={form.automationMode}
                onValueChange={(value) =>
                  patchForm('automationMode', value as ScheduleFormState['automationMode'])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prompt">Prompt only</SelectItem>
                  <SelectItem value="watch">Watch for changes</SelectItem>
                  <SelectItem value="agent">Agent with tools</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field className="reminders-view__form-field">
              <FieldLabel>Notifications</FieldLabel>
              <Select
                value={form.notifyPolicy}
                onValueChange={(value) =>
                  patchForm('notifyPolicy', value as ScheduleFormState['notifyPolicy'])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="every_run">Notify every run</SelectItem>
                  <SelectItem value="meaningful_change">Notify only on change</SelectItem>
                  <SelectItem value="error_only">Notify only on errors</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field className="reminders-view__form-field">
              <FieldLabel>Outputs</FieldLabel>
              <div className="reminders-view__checkbox-row">
                {OUTPUT_OPTIONS.map((option) => {
                  const checked = form.outputDestinations.includes(option.id)
                  return (
                    <label key={option.id} className="reminders-view__checkbox">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? form.outputDestinations.filter((item) => item !== option.id)
                            : [...form.outputDestinations, option.id]
                          patchForm(
                            'outputDestinations',
                            next.length > 0 ? next : (['log'] as ScheduleFormState['outputDestinations'])
                          )
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  )
                })}
              </div>
            </Field>
            {form.automationMode === 'agent' && (
              <>
                <Field className="reminders-view__form-field">
                  <FieldLabel>Approval</FieldLabel>
                  <Select
                    value={form.approvalMode}
                    onValueChange={(value) =>
                      patchForm('approvalMode', value as ScheduleFormState['approvalMode'])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read_only">Read-only tools</SelectItem>
                      <SelectItem value="ask_each_run">Ask each run</SelectItem>
                      <SelectItem value="trusted_repeat">Trusted repeats</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="reminders-view__form-field">
                  <FieldLabel>Allowed tools</FieldLabel>
                  <Input
                    value={form.allowedToolsText}
                    onChange={(event) => patchForm('allowedToolsText', event.target.value)}
                    placeholder="Comma-separated tool names"
                  />
                </Field>
              </>
            )}
          </>
        )}

        <Field className="reminders-view__form-field">
          <FieldLabel>Instructions</FieldLabel>
          <Textarea
            value={form.instructions}
            onChange={(event) => patchForm('instructions', event.target.value)}
            placeholder="Optional guidance (what matters, what to ignore)"
            rows={2}
          />
        </Field>

        <Field className="reminders-view__form-field">
          <FieldLabel>Schedule</FieldLabel>
          <Select
            value={form.scheduleKind}
            onValueChange={(value) => patchForm('scheduleKind', value as ScheduleKindOption)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {form.type === 'ai_automation' && (
                <SelectItem value="agent">Agent-chosen cadence</SelectItem>
              )}
              <SelectItem value="interval">Fixed interval</SelectItem>
              <SelectItem value="daily">Daily at a time</SelectItem>
              <SelectItem value="weekly">Weekly on days</SelectItem>
              <SelectItem value="once">One time</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {(form.scheduleKind === 'interval' || form.scheduleKind === 'agent') && (
          <Field className="reminders-view__form-field">
            <FieldLabel>
              {form.scheduleKind === 'agent' ? 'Fallback interval' : 'Repeat every'}
            </FieldLabel>
            <Select
              value={form.intervalPreset}
              onValueChange={(value) =>
                patchForm('intervalPreset', value as ScheduleFormState['intervalPreset'])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.scheduleKind === 'agent' && (
              <p className="reminders-view__field-hint">
                Used only if the automation forgets to pick a next run time.
              </p>
            )}
          </Field>
        )}

        {(form.scheduleKind === 'daily' || form.scheduleKind === 'weekly') && (
          <Field className="reminders-view__form-field">
            <FieldLabel>Time of day</FieldLabel>
            <Input
              type="time"
              value={form.timeOfDay}
              onChange={(event) => patchForm('timeOfDay', event.target.value)}
            />
          </Field>
        )}

        {form.scheduleKind === 'weekly' && (
          <Field className="reminders-view__form-field">
            <FieldLabel>Weekdays</FieldLabel>
            <div className="reminders-view__checkbox-row">
              {WEEKDAY_LABELS.map((label, day) => {
                const checked = form.weekdays.includes(day)
                return (
                  <label key={label} className="reminders-view__checkbox">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? form.weekdays.filter((item) => item !== day)
                          : [...form.weekdays, day].sort((a, b) => a - b)
                        patchForm('weekdays', next)
                      }}
                    />
                    <span>{label}</span>
                  </label>
                )
              })}
            </div>
          </Field>
        )}

        {form.scheduleKind === 'once' && (
          <Field className="reminders-view__form-field">
            <FieldLabel>Run at</FieldLabel>
            <Input
              type="datetime-local"
              value={form.dueLocal}
              onChange={(event) => patchForm('dueLocal', event.target.value)}
            />
          </Field>
        )}

        <label className="reminders-view__checkbox reminders-view__checkbox--block">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => patchForm('enabled', event.target.checked)}
          />
          <span>Enabled (runs while ZuraAI is open)</span>
        </label>
      </FieldGroup>

      {formError && (
        <div className="reminders-view__error">
          <AlertCircle size={15} /> {formError}
        </div>
      )}

      <div className="reminders-view__form-actions">
        <Button type="button" variant="ghost" size="sm" onClick={() => setDrawer(null)}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={saving} onClick={() => void saveForm()}>
          {saving ? 'Saving…' : drawerMode === 'edit' ? 'Save changes' : 'Create schedule'}
        </Button>
      </div>
    </div>
  )

  const renderCombinedGroup = () => {
    const filterLabels: Array<{ id: TaskFilter; label: string; count: number }> = [
      { id: 'all', label: 'All', count: tasks.length },
      { id: 'reminder', label: 'Reminders', count: reminders.length },
      { id: 'web_lookout', label: 'Lookouts', count: lookouts.length },
      { id: 'ai_automation', label: 'Automations', count: automations.length },
      { id: 'paused', label: 'Paused', count: pausedTasks.length },
      { id: 'logs', label: 'With history', count: tasksWithLogs.length },
    ]

    return (
      <section className="reminders-view__group" aria-labelledby="schedules-all">
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
        <h3 id="schedules-all" className="reminders-view__sr-heading">
          {filterLabels.find((filter) => filter.id === activeFilter)?.label ?? 'All'} schedules
        </h3>
        <div className="reminders-view__rows">
          {filteredTasks.length === 0 ? (
            <div className="reminders-view__empty-state">
              <strong>No schedules yet</strong>
              <span>
                Create a reminder, lookout, or AI automation here — or ask the agent to set one up.
              </span>
              <div className="reminders-view__prompt-chips">
                <button type="button" onClick={() => openCreate('reminder')}>
                  New reminder
                </button>
                <button type="button" onClick={() => openCreate('web_lookout')}>
                  New lookout
                </button>
                <button type="button" onClick={() => openCreate('ai_automation')}>
                  New automation
                </button>
                <button
                  type="button"
                  onClick={() => askAgent('Remind me tomorrow at 9 AM')}
                >
                  Ask agent
                </button>
              </div>
            </div>
          ) : (
            filteredTasks.map((task, index) => renderTaskRow(task, index))
          )}
        </div>
      </section>
    )
  }

  const drawerTitle =
    drawerMode === 'create'
      ? 'New schedule'
      : drawerMode === 'edit'
        ? `Edit ${drawerTask?.title || 'schedule'}`
        : drawerMode === 'details'
          ? drawerTask?.title || 'Details'
          : drawerTask?.title || 'History'

  const drawerSubtitle =
    drawerMode === 'create'
      ? 'Create schedule'
      : drawerMode === 'edit'
        ? 'Edit schedule'
        : drawerMode === 'details'
          ? 'Task details'
          : 'Run history'

  return (
    <section className="reminders-view" aria-labelledby="schedules-title">
      <div
        className={`reminders-view__stage ${drawer ? 'reminders-view__stage--drawer-open' : ''}`}
      >
        <main className="reminders-view__panel">
          <header className="reminders-view__panel-header">
            <div>
              <h2 id="schedules-title">Schedules</h2>
              <p>Reminders, page lookouts, and AI automations — managed here or via the agent.</p>
            </div>
            <div className="reminders-view__header-actions">
              <Button
                variant="ghost"
                size="sm"
                className="reminders-view__ask-agent"
                onClick={() =>
                  askAgent('Help me create a reminder, lookout, or AI automation.')
                }
              >
                <Brain size={15} data-icon="inline-start" />
                Ask agent
              </Button>
              <Button
                variant="default"
                size="sm"
                className="reminders-view__new-btn"
                onClick={() => openCreate('reminder')}
              >
                <Plus size={15} data-icon="inline-start" />
                New
              </Button>
            </div>
          </header>

          <div className="reminders-view__banner" role="note">
            Schedules only run while ZuraAI is open. Closing the app pauses future runs until you
            launch it again.
          </div>

          {error && (
            <div className="reminders-view__error">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {loading ? (
            <div className="reminders-view__loading">
              <Loader2 className="reminders-view__spin" size={18} /> Loading schedules
            </div>
          ) : (
            <div className="reminders-view__content">{renderCombinedGroup()}</div>
          )}
        </main>

        {drawer && <div className="reminders-view__drawer-divider" aria-hidden="true" />}

        {drawer && (
          <aside
            className="reminders-view__drawer"
            aria-label={`${drawerSubtitle} for ${drawerTitle}`}
          >
            <div className="reminders-view__drawer-header">
              <div>
                <span>{drawerSubtitle}</span>
                <h3>{drawerTitle}</h3>
              </div>
              <button
                type="button"
                className="reminders-view__icon-button"
                onClick={() => setDrawer(null)}
                aria-label="Close drawer"
              >
                <X size={15} />
              </button>
            </div>

            {formOpen ? (
              renderForm()
            ) : drawerMode === 'details' && drawerTask ? (
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
                      {drawerTask.enabled ? 'Active' : 'Paused'}
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
                      {renderDetailField('Mode', automationModeLabel(drawerTask.automationMode))}
                      {renderDetailField(
                        'Approval',
                        approvalModeLabel(drawerTask.approvalMode)
                      )}
                      {renderDetailField('Notify', notifyPolicyLabel(drawerTask.notifyPolicy))}
                      {renderDetailField(
                        'Outputs',
                        outputDestinationsLabel(drawerTask.outputDestinations)
                      )}
                      {renderDetailField(
                        'Tools',
                        drawerTask.allowedTools?.join(', ') || 'None'
                      )}
                    </>
                  )}
                  {renderDetailField('Instructions', drawerTask.instructions || 'None')}
                </FieldGroup>
                <div className="reminders-view__form-actions">
                  <Button type="button" size="sm" onClick={() => openEdit(drawerTask)}>
                    <Pencil size={14} data-icon="inline-start" />
                    Edit
                  </Button>
                </div>
              </div>
            ) : drawerTask ? (
              <div className="reminders-view__runs">
                {drawerRuns.length === 0 ? (
                  <div className="reminders-view__empty-row">No runs recorded yet.</div>
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
                            {runStatusLabel(run.status, drawerTask.type)}
                          </Badge>
                          <time dateTime={new Date(run.startedAt).toISOString()}>
                            {formatDate(run.startedAt)}
                          </time>
                        </div>
                        {run.aiSummary && (
                          <p className="reminders-view__summary">{run.aiSummary}</p>
                        )}
                        {!run.aiSummary && run.diffSummary && (
                          <p className="reminders-view__summary">{run.diffSummary}</p>
                        )}
                        {!run.aiSummary && !run.diffSummary && run.outputText && (
                          <p className="reminders-view__summary">{run.outputText}</p>
                        )}
                        {run.changeVerdict?.summary && (
                          <p className="reminders-view__summary">{run.changeVerdict.summary}</p>
                        )}
                        {run.model && (
                          <p className="reminders-view__summary">Model: {run.model}</p>
                        )}
                        {run.error && <p className="reminders-view__run-error">{run.error}</p>}
                        {run.automationChatSessionId && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="reminders-view__open-chat"
                            onClick={() => openAutomationChat(run.automationChatSessionId!)}
                          >
                            <ExternalLink size={14} data-icon="inline-start" />
                            Open run chat
                          </Button>
                        )}
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
            ) : (
              <div className="reminders-view__empty-row">This schedule is no longer available.</div>
            )}
          </aside>
        )}
      </div>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="theme-overlay-title">Delete schedule?</AlertDialogTitle>
            <AlertDialogDescription className="theme-overlay-description">
              {deleteTarget
                ? `“${deleteTarget.title}” will be permanently removed, including its run history. This cannot be undone.`
                : 'This schedule will be permanently removed.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                void confirmDelete()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
