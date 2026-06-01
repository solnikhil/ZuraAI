import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Globe,
  Loader2,
  Monitor,
  MousePointer,
  RotateCcw,
  Shield,
  Wrench,
  XCircle,
} from 'lucide-react'

import type { AgentRun, AgentStep } from '@/chat/types'
import type { AgentDesktopState } from '@/electron/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import './AgentActivityTimeline.css'

export function AgentActivityTimeline({
  run,
  agentDesktopState: agentDesktopStateOverride,
}: {
  run: AgentRun
  /**
   * Optional Agent Desktop state override. When omitted, the component
   * subscribes to the live `window.agentDesktop` bridge (Req 11.4–11.9). The
   * override exists primarily so tests can drive each presence/unavailable
   * surface deterministically without the Electron bridge.
   */
  agentDesktopState?: AgentDesktopState | null
}) {
  const liveAgentDesktopState = useAgentDesktopState(agentDesktopStateOverride)
  const separateDesktopVisible = shouldShowSeparateDesktopCapability(
    run.capabilities.agentDesktop,
    liveAgentDesktopState
  )
  const visibleCapabilities = Object.entries(run.capabilities).filter(
    ([name]) => name !== 'agentDesktop' || separateDesktopVisible
  )

  return (
    <section className="agent-timeline" aria-label="Agent activity">
      <div className="agent-timeline-header">
        <div>
          <div className="agent-timeline-title">
            Agent Workspace
          </div>
          <div className="agent-timeline-subtitle">
            {run.status === 'running' ? 'Working through approved steps' : formatRunStatus(run.status)}
          </div>
        </div>
        <div className={cn('agent-run-status', `agent-run-status-${run.status}`)}>
          {formatRunStatus(run.status)}
        </div>
      </div>

      <div className="agent-capability-row">
        {visibleCapabilities.map(([name, state]) => (
          <span key={name} className={cn('agent-capability', `agent-capability-${state}`)}>
            {formatCapabilityName(name)}
          </span>
        ))}
      </div>

      {separateDesktopVisible && (
        <AgentDesktopPresencePanel
          state={liveAgentDesktopState}
          capability={run.capabilities.agentDesktop}
        />
      )}

      <div className="agent-step-list">
        {run.steps.map((step) => (
          <AgentTimelineStep key={step.id} step={step} />
        ))}
      </div>
    </section>
  )
}

/**
 * Subscribe to the live Agent Desktop state from the dedicated
 * `window.agentDesktop` bridge (Req 11.4–11.9).
 *
 * When `override` is provided (tests, or a parent that already holds the
 * state), it wins and no subscription is made. Otherwise the hook reads the
 * initial state via `getState()` and stays in sync through `onStateChange`.
 * Returns `null` when no bridge is available (non-Windows / non-Electron), in
 * which case the presence panel renders nothing.
 */
function useAgentDesktopState(
  override?: AgentDesktopState | null
): AgentDesktopState | null {
  const [state, setState] = useState<AgentDesktopState | null>(override ?? null)

  useEffect(() => {
    // An explicit override is authoritative; do not subscribe to the bridge.
    if (override !== undefined) {
      setState(override)
      return
    }

    const bridge = typeof window !== 'undefined' ? window.agentDesktop : undefined
    if (!bridge?.onStateChange) {
      setState(null)
      return
    }

    let active = true

    if (bridge.getState) {
      void bridge
        .getState()
        .then((next) => {
          if (active) setState(next)
        })
        .catch(() => {
          // The bridge rejects on macOS (Req 9.4) and in non-Electron contexts;
          // leave the state null so the panel renders nothing.
        })
    }

    const unsubscribe = bridge.onStateChange((next) => {
      if (active) setState(next)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [override])

  return state
}

function shouldShowSeparateDesktopCapability(
  capability: AgentRun['capabilities']['agentDesktop'],
  state: AgentDesktopState | null
): boolean {
  if (state) return state.enabled
  return capability === 'active'
}

/**
 * Separate desktop presence surface rendered inside the timeline
 * (Req 11.4–11.9).
 *
 * Renders exactly one surface depending on the live state:
 * - Unavailable (VDA failure / macOS / disabled) → the unavailable notice in
 *   place of any control (Req 11.9).
 * - `background` → "staging work" status + an ENABLED Take_Over control, plus a
 *   "waiting for Take_Over" indicator while an input action is held (Req 11.4,
 *   11.5, 11.8).
 * - `take-over` → "actively driving" status + an ENABLED Return-to-User control
 *   (Req 11.6, 11.7).
 *
 * Renders nothing when there is no live state (no bridge) or when the
 * capability is `available` but no session is active yet — there is no presence
 * to surface in that case.
 */
function AgentDesktopPresencePanel({
  state,
  capability,
}: {
  state: AgentDesktopState | null
  capability: AgentRun['capabilities']['agentDesktop']
}) {
  const [busy, setBusy] = useState(false)

  const handleTakeOver = useCallback(async () => {
    const bridge = typeof window !== 'undefined' ? window.agentDesktop : undefined
    if (!bridge?.takeOver) return
    setBusy(true)
    try {
      await bridge.takeOver()
    } catch {
      // Failures are surfaced by the service via `state.lastError`; the live
      // state subscription reflects the unchanged presence.
    } finally {
      setBusy(false)
    }
  }, [])

  const handleReturn = useCallback(async () => {
    const bridge = typeof window !== 'undefined' ? window.agentDesktop : undefined
    if (!bridge?.endTakeOver) return
    setBusy(true)
    try {
      await bridge.endTakeOver()
    } catch {
      // See handleTakeOver: errors flow back through the state subscription.
    } finally {
      setBusy(false)
    }
  }, [])

  // No live state means no bridge (non-Windows / non-Electron) - render nothing.
  if (!state) return null

  // Separate desktop is one Computer Use mode. When it is off, this timeline
  // should not show its unavailable state during normal "this desktop" runs.
  if (!state.enabled) return null

  // Unavailable state in place of any separate-desktop control (Req 11.9). This
  // covers VDA binding failure and macOS, and any disabled/unsupported posture.
  const unavailable =
    capability === 'unavailable' ||
    state.capability === 'unavailable' ||
    !state.platformSupported ||
    state.vdaOutcome === 'unavailable'

  if (unavailable) {
    return (
      <div
        className="agent-desktop-presence agent-desktop-presence-unavailable"
        role="status"
      >
        <span className="agent-desktop-presence-icon">
          <AlertTriangle size={16} />
        </span>
        <div className="agent-desktop-presence-copy">
          <span className="agent-desktop-presence-title">Separate desktop unavailable</span>
          <span className="agent-desktop-presence-detail">
            {state.lastError
              ? state.lastError
              : !state.platformSupported
                ? 'Separate desktop control runs only on Windows.'
                : 'The Windows virtual-desktop integration (VirtualDesktopAccessor) is unavailable, so separate desktop controls are disabled.'}
          </span>
        </div>
      </div>
    )
  }

  // No active session yet → no presence to surface.
  if (!state.presence) return null

  if (state.presence === 'take-over') {
    return (
      <div
        className="agent-desktop-presence agent-desktop-presence-take-over"
        role="status"
      >
        <span className="agent-desktop-presence-icon">
          <MousePointer size={16} />
        </span>
        <div className="agent-desktop-presence-copy">
          <span className="agent-desktop-presence-title">
            Actively driving the separate desktop
          </span>
          <span className="agent-desktop-presence-detail">
            The agent is delivering input on the displayed separate desktop.
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="agent-desktop-presence-action"
          onClick={handleReturn}
          disabled={busy}
        >
          {busy ? <Loader2 size={14} className="agent-desktop-spin" /> : <RotateCcw size={14} />}
          Return to my desktop
        </Button>
      </div>
    )
  }

  // presence === 'background'
  // In background the Agent_Desktop is never the displayed Virtual_Desktop, so
  // any input action is held until the user takes over (Req 3.2, 3.6). Surface
  // the "waiting for Take_Over" indicator whenever input cannot currently be
  // delivered (Req 11.8).
  const waitingForTakeOver = !state.agentDesktopDisplayed
  return (
    <div
      className="agent-desktop-presence agent-desktop-presence-background"
      role="status"
    >
      <span className="agent-desktop-presence-icon">
        <Monitor size={16} />
      </span>
      <div className="agent-desktop-presence-copy">
        <span className="agent-desktop-presence-title">
          Staging work on the separate desktop
        </span>
        <span className="agent-desktop-presence-detail">
          The agent is preparing windows in the background. Take over to let it
          deliver input.
        </span>
        {waitingForTakeOver && (
          <span className="agent-desktop-waiting" role="status">
            <Clock size={13} />
            Waiting for Take Over to deliver input
          </span>
        )}
      </div>
      <Button
        type="button"
        size="sm"
        className="agent-desktop-presence-action"
        onClick={handleTakeOver}
        disabled={busy}
      >
        {busy ? <Loader2 size={14} className="agent-desktop-spin" /> : <Monitor size={14} />}
        Take over
      </Button>
    </div>
  )
}

function AgentTimelineStep({ step }: { step: AgentStep }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetails = Boolean(step.arguments) || Boolean(step.result)
  const screenshot = getScreenshot(step.result)

  return (
    <div className={cn('agent-step', `agent-step-${step.status}`)}>
      <button
        type="button"
        className="agent-step-main"
        onClick={() => hasDetails && setExpanded((value) => !value)}
        disabled={!hasDetails}
      >
        <span className="agent-step-icon">{getStepIcon(step)}</span>
        <span className="agent-step-copy">
          <span className="agent-step-title-row">
            <span className="agent-step-title">{step.title}</span>
            <span className={cn('agent-step-status', `agent-step-status-${step.status}`)}>
              {formatStepStatus(step.status)}
            </span>
          </span>
          <span className="agent-step-summary">{step.summary}</span>
        </span>
        <span className="agent-step-meta">
          {typeof step.durationMs === 'number' && <span>{formatDuration(step.durationMs)}</span>}
          {hasDetails && (expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />)}
        </span>
      </button>

      {expanded && hasDetails && (
        <div className="agent-step-details">
          {screenshot && (
            <img
              src={`data:image/png;base64,${screenshot}`}
              alt="Computer use result"
              className="agent-step-screenshot"
            />
          )}
          {step.arguments && (
            <DetailBlock title="Arguments" value={step.arguments} />
          )}
          {step.result !== undefined && (
            <DetailBlock title="Result" value={step.result} />
          )}
        </div>
      )}
    </div>
  )
}

function DetailBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="agent-detail-block">
      <div className="agent-detail-title">{title}</div>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </div>
  )
}

function getStepIcon(step: AgentStep) {
  if (step.status === 'awaiting-approval') return <Shield size={16} />
  if (step.status === 'failed') return <AlertCircle size={16} />
  if (step.status === 'rejected') return <XCircle size={16} />
  if (step.status === 'completed') return <CheckCircle2 size={16} />

  switch (step.kind) {
    case 'web':
      return <Globe size={16} />
    case 'code':
      return <Code2 size={16} />
    case 'computer':
      return <Monitor size={16} />
    case 'mcp':
      return <Wrench size={16} />
    default:
      return <Clock size={16} />
  }
}

function formatRunStatus(status: AgentRun['status']): string {
  switch (status) {
    case 'running':
      return 'Running'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
  }
}

/**
 * Human-friendly capability chip label.
 */
function formatCapabilityName(name: string): string {
  if (name === 'agentDesktop') return 'Separate Desktop'
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function formatStepStatus(status: AgentStep['status']): string {
  switch (status) {
    case 'awaiting-approval':
      return 'Needs approval'
    case 'running':
      return 'Running'
    case 'completed':
      return 'Done'
    case 'failed':
      return 'Failed'
    case 'rejected':
      return 'Rejected'
    default:
      return 'Pending'
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function getScreenshot(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null
  const data = 'data' in result ? (result as { data?: unknown }).data : result
  if (!data || typeof data !== 'object') return null
  const screenshot = (data as { screenshot?: unknown; image?: unknown }).screenshot ?? (data as { image?: unknown }).image
  return typeof screenshot === 'string' ? screenshot : null
}

export default AgentActivityTimeline
