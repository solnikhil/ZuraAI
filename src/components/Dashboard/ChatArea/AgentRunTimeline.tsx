import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  ChevronDown,
  CircleIcon,
  LoaderCircle,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react'
import type { AgentRun, AgentStep } from '@/chat/types'
import type { AgentRunRuntimeSnapshot } from '@/electron/types'
import { cn } from '@/lib/utils'

interface AgentRunTimelineProps {
  run: AgentRun
  isActive?: boolean
  onStop?: () => void
}

type AgentRunView = Omit<AgentRun, 'status'> & {
  status: string
  phase?: string
  verification?: string
  blocker?: string | { message?: string; reason?: string }
}

type PresentationTone = 'running' | 'success' | 'warning' | 'error' | 'neutral'

interface RunPresentation {
  label: string
  detail: string
  tone: PresentationTone
  verification: string
}

const ACTIVE_STEP_STATUSES = new Set(['pending', 'awaiting-approval', 'running'])

const TONE_CLASSES: Record<PresentationTone, string> = {
  running: 'text-[var(--theme-accent)] bg-[var(--theme-accent-muted)]',
  success: 'text-[var(--theme-success)] bg-[var(--theme-success-bg)]',
  warning: 'text-[var(--theme-warning)] bg-[var(--theme-warning-bg)]',
  error: 'text-[var(--theme-error)] bg-[var(--theme-error-bg)]',
  neutral: 'text-[var(--theme-text-secondary)] bg-[var(--theme-surface-hover)]',
}

function getLatestStep(run: AgentRun): AgentStep | undefined {
  return (
    [...run.steps].reverse().find((step) => ACTIVE_STEP_STATUSES.has(step.status)) ??
    run.steps.at(-1)
  )
}

function getLatestVerificationStep(run: Pick<AgentRun, 'steps'>): AgentStep | undefined {
  return [...run.steps].reverse().find((step) => step.kind === 'verify')
}

function getPresentation(run: AgentRunView): RunPresentation {
  const verificationStep = getLatestVerificationStep(run)
  const explicitVerification = run.verification?.toLowerCase()
  const status = run.status.toLowerCase()

  if (status === 'failed') {
    return {
      label: 'Failed',
      detail: 'The run stopped before completing the task.',
      tone: 'error',
      verification:
        explicitVerification === 'verified' ? 'Verified before failure' : 'Not verified',
    }
  }
  if (status === 'cancelled') {
    return {
      label: 'Cancelled',
      detail: 'Stopped by you.',
      tone: 'neutral',
      verification: 'Not completed',
    }
  }
  if (status === 'running' || status === 'awaiting_approval') {
    const awaitingApproval = run.steps.some(
      (step) => step.status === 'awaiting-approval' || step.approvalState === 'pending'
    )
    return {
      label: awaitingApproval ? 'Approval needed' : 'Running',
      detail: awaitingApproval ? 'Waiting for your decision.' : 'Working through the task.',
      tone: awaitingApproval ? 'warning' : 'running',
      verification:
        explicitVerification === 'verified'
          ? 'Checkpoint verified'
          : explicitVerification === 'pending' || verificationStep?.status === 'running'
            ? 'In progress'
            : 'Not reached',
    }
  }
  if (
    status === 'completed_verified' ||
    (status === 'completed' && explicitVerification === 'verified')
  ) {
    return {
      label: 'Verified',
      detail: 'Fresh evidence confirmed the result.',
      tone: 'success',
      verification: 'Verified',
    }
  }
  if (
    status === 'completed_unverified' ||
    explicitVerification === 'unverified' ||
    explicitVerification === 'contradicted' ||
    explicitVerification === 'inconclusive' ||
    verificationStep?.status === 'failed'
  ) {
    return {
      label: 'Unverified',
      detail: 'The run finished without proof of the requested result.',
      tone: 'warning',
      verification: 'Unverified',
    }
  }
  if (status === 'completed') {
    if (verificationStep?.status === 'completed') {
      return {
        label: 'Verified',
        detail: 'Fresh evidence confirmed the result.',
        tone: 'success',
        verification: 'Verified',
      }
    }
    return {
      label: 'Completed',
      detail: 'No verification checkpoint was required.',
      tone: 'success',
      verification: 'Not required',
    }
  }

  return {
    label: 'Running',
    detail: 'Working through the task.',
    tone: 'running',
    verification: 'Not reached',
  }
}

function getPhase(run: AgentRunView, currentStep: AgentStep | undefined): string {
  if (run.phase) return run.phase.replace(/_/g, ' ')
  if (!currentStep) return run.status === 'running' ? 'Preparing' : 'Report'
  if (currentStep.kind === 'plan') return 'Safety strategy'
  if (currentStep.kind === 'verify') return 'Verify'
  if (currentStep.kind === 'answer') return 'Report'
  return 'Act'
}

function getApprovalLabel(run: AgentRun): string {
  const approvalStep = [...run.steps]
    .reverse()
    .find((step) => step.approvalState && step.approvalState !== 'not-required')

  switch (approvalStep?.approvalState) {
    case 'pending':
      return 'Waiting for approval'
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    case 'timed_out':
      return 'Timed out'
    case 'cancelled':
      return 'Cancelled'
    case 'unavailable':
      return 'Approval unavailable'
    case 'error':
      return 'Approval failed'
    default:
      return 'No approval pending'
  }
}

function getBlocker(run: AgentRunView, presentation: RunPresentation): string | undefined {
  if (typeof run.blocker === 'string') return run.blocker
  if (run.blocker?.message) return run.blocker.message
  if (run.blocker?.reason) return run.blocker.reason

  const rejectedStep = [...run.steps].reverse().find((step) => step.status === 'rejected')
  if (rejectedStep) return `Approval was not granted for ${rejectedStep.title}.`
  const failedStep = [...run.steps].reverse().find((step) => step.status === 'failed')
  if (failedStep) return `${failedStep.title} did not complete successfully.`
  if (presentation.label === 'Unverified') return 'The requested outcome could not be verified.'
  if (presentation.label === 'Failed')
    return 'The run ended before the requested outcome was reached.'
  return undefined
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`
}

function StatusIcon({ tone }: { tone: PresentationTone }) {
  if (tone === 'success') return <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
  if (tone === 'error') return <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
  if (tone === 'warning') return <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
  if (tone === 'neutral') return <X className="h-3.5 w-3.5" aria-hidden="true" />
  return <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
}

function StepStatusIcon({ step }: { step: AgentStep }) {
  if (step.status === 'completed') {
    return <Check className="h-3.5 w-3.5 text-[var(--theme-success)]" aria-hidden="true" />
  }
  if (step.status === 'failed' || step.status === 'rejected') {
    return <X className="h-3.5 w-3.5 text-[var(--theme-error)]" aria-hidden="true" />
  }
  if (step.status === 'running' || step.status === 'awaiting-approval') {
    return (
      <LoaderCircle
        className="h-3.5 w-3.5 animate-spin text-[var(--theme-accent)]"
        aria-hidden="true"
      />
    )
  }
  return <CircleIcon className="h-3.5 w-3.5 text-[var(--theme-text-muted)]" aria-hidden="true" />
}

export function AgentRunTimeline({ run, isActive = false, onStop }: AgentRunTimelineProps) {
  const view = run as AgentRunView
  const isRunning = view.status === 'running' || view.status === 'awaiting_approval'
  const [expanded, setExpanded] = useState(isRunning)
  const [now, setNow] = useState(() => Date.now())
  const [runtime, setRuntime] = useState<AgentRunRuntimeSnapshot | null>(null)
  const previousStatusRef = useRef(view.status)

  useEffect(() => {
    if (!isRunning) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isRunning])

  useEffect(() => {
    if (!isActive || !isRunning || !window.agentRun) return
    let mounted = true
    let latestRequest = 0

    const refreshRuntime = async () => {
      const requestVersion = ++latestRequest
      try {
        const snapshot = await window.agentRun?.getRuntime(run.id)
        if (mounted && requestVersion === latestRequest) setRuntime(snapshot ?? null)
      } catch {
        // Runtime budgets supplement the renderer ledger; terminal failures surface there.
      }
    }

    void refreshRuntime()
    const timer = window.setInterval(() => void refreshRuntime(), 2000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [isActive, isRunning, run.id])

  useEffect(() => {
    if (previousStatusRef.current !== view.status && !isRunning) setExpanded(false)
    previousStatusRef.current = view.status
  }, [isRunning, view.status])

  const currentStep = useMemo(() => getLatestStep(run), [run])
  const presentation = useMemo(() => getPresentation(view), [view])
  const phase = getPhase(view, currentStep)
  const blocker = getBlocker(view, presentation)
  const duration = formatDuration((run.completedAt ?? now) - run.startedAt)
  const supportsEmergencyStop = run.capabilities.computer !== 'unavailable'
  const canStop = isActive && isRunning && Boolean(onStop)

  return (
    <section
      className="mb-3 overflow-hidden rounded-[10px] border border-[var(--theme-border-subtle)] bg-[color-mix(in_srgb,var(--theme-surface)_76%,transparent)]"
      aria-label="Agent run timeline"
      data-agent-run-status={presentation.label.toLowerCase().replace(/\s+/g, '-')}
    >
      <div className="flex min-w-0 items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus)]"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span
            className={cn(
              'inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-semibold uppercase tracking-[0.05em]',
              TONE_CLASSES[presentation.tone]
            )}
            aria-live="polite"
            aria-atomic="true"
          >
            <StatusIcon tone={presentation.tone} />
            {presentation.label}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-[var(--theme-text-primary)]">
              {phase}
              {currentStep ? ` - ${currentStep.title}` : ''}
            </span>
            <span className="block truncate text-[10px] text-[var(--theme-text-muted)]">
              {presentation.detail}
            </span>
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-[var(--theme-text-muted)]">
            {duration}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-[var(--theme-text-muted)] transition-transform duration-150',
              expanded && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </button>

        {canStop ? (
          <button
            type="button"
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-[var(--theme-error-bg)] px-2 text-[11px] font-medium text-[var(--theme-error)] transition-colors hover:bg-[color-mix(in_srgb,var(--theme-error-bg)_72%,var(--theme-error))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus)]"
            onClick={onStop}
            aria-label="Stop agent run"
          >
            <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
            Stop
          </button>
        ) : null}
      </div>

      {isRunning && canStop ? (
        <div className="flex items-center gap-1.5 border-t border-[var(--theme-border-subtle)] px-2.5 py-1.5 text-[10px] text-[var(--theme-text-muted)]">
          <span>Stop is always available here.</span>
          {supportsEmergencyStop ? (
            <span>
              Press{' '}
              <kbd className="rounded bg-[var(--theme-surface-hover)] px-1 font-inherit">Esc</kbd>
              {' twice quickly for desktop emergency stop.'}
            </span>
          ) : null}
        </div>
      ) : null}

      {expanded ? (
        <div className="border-t border-[var(--theme-border-subtle)] px-2.5 py-2.5">
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
            <dt className="text-[var(--theme-text-muted)]">Current action</dt>
            <dd className="truncate text-[var(--theme-text-secondary)]">
              {currentStep?.summary || 'Preparing the next step'}
            </dd>
            <dt className="text-[var(--theme-text-muted)]">Approval</dt>
            <dd className="text-[var(--theme-text-secondary)]">{getApprovalLabel(run)}</dd>
            <dt className="text-[var(--theme-text-muted)]">Verification</dt>
            <dd className="text-[var(--theme-text-secondary)]">{presentation.verification}</dd>
            {runtime ? (
              <>
                <dt className="text-[var(--theme-text-muted)]">Tool budget</dt>
                <dd className="text-[var(--theme-text-secondary)]">
                  {Math.max(0, runtime.limits.maxToolCalls - runtime.toolCalls)} of{' '}
                  {runtime.limits.maxToolCalls} remaining
                  {runtime.activeToolCalls > 0 ? ` - ${runtime.activeToolCalls} active` : ''}
                </dd>
                <dt className="text-[var(--theme-text-muted)]">Mutation budget</dt>
                <dd className="text-[var(--theme-text-secondary)]">
                  {Math.max(0, runtime.limits.maxMutations - runtime.mutations)} of{' '}
                  {runtime.limits.maxMutations} remaining
                </dd>
                <dt className="text-[var(--theme-text-muted)]">Time budget</dt>
                <dd className="text-[var(--theme-text-secondary)]">
                  {formatDuration(
                    Math.max(0, runtime.limits.maxDurationMs - (now - runtime.startedAt))
                  )}{' '}
                  remaining
                </dd>
              </>
            ) : (
              <>
                <dt className="text-[var(--theme-text-muted)]">Budgets</dt>
                <dd className="text-[var(--theme-text-secondary)]">
                  Desktop-enforced limits appear when tool work starts
                </dd>
              </>
            )}
            {blocker ? (
              <>
                <dt className="text-[var(--theme-error)]">Blocker</dt>
                <dd className="text-[var(--theme-text-primary)]">{blocker}</dd>
              </>
            ) : null}
          </dl>

          {run.steps.length > 0 ? (
            <ol className="mt-2 max-h-48 space-y-0.5 overflow-y-auto border-t border-[var(--theme-border-subtle)] pt-2">
              {run.steps.map((step) => (
                <li key={step.id} className="flex min-w-0 items-start gap-2 py-1">
                  <span className="mt-0.5 shrink-0">
                    <StepStatusIcon step={step} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-medium text-[var(--theme-text-primary)]">
                      {step.title}
                    </span>
                    <span className="block truncate text-[10px] text-[var(--theme-text-muted)]">
                      {step.summary}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export default AgentRunTimeline
