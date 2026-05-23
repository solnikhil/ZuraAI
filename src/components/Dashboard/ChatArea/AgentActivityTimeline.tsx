import { useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Globe,
  Monitor,
  Shield,
  Wrench,
  XCircle,
} from 'lucide-react'

import type { AgentRun, AgentStep } from '@/chat/types'
import { cn } from '@/lib/utils'

import './AgentActivityTimeline.css'

export function AgentActivityTimeline({ run }: { run: AgentRun }) {
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
        {Object.entries(run.capabilities).map(([name, state]) => (
          <span key={name} className={cn('agent-capability', `agent-capability-${state}`)}>
            {name}
          </span>
        ))}
      </div>

      <div className="agent-step-list">
        {run.steps.map((step) => (
          <AgentTimelineStep key={step.id} step={step} />
        ))}
      </div>
    </section>
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
