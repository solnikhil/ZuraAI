import type { AgentApprovalOverlayOutcome } from '@/electron/types'
import { trackAnalytics } from '@/analytics/track'

export type AgentRunOutcome = 'completed' | 'failed' | 'cancelled'
export type AgentVerificationTelemetryOutcome =
  | 'not_required'
  | 'verified'
  | 'unverified'
  | 'inconclusive'
  | 'contradicted'
export type AgentRunStopReason =
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'budget_exhausted'
  | 'renderer_destroyed'
  | 'shutdown'
  | 'verification_failed'
  | 'user_stop'
export type AgentBudgetReason = 'tool_calls' | 'mutations' | 'elapsed_time' | 'computer_use' | 'mcp'

export interface AgentRunTelemetrySession {
  finish: (input: {
    outcome: AgentRunOutcome
    verificationOutcome: AgentVerificationTelemetryOutcome
    stopReason: AgentRunStopReason
    budgetReason?: AgentBudgetReason
    finishedAt?: number
  }) => boolean
}

function duration(value: number): number {
  return Math.min(
    7 * 24 * 60 * 60 * 1000,
    Math.max(0, Math.round(Number.isFinite(value) ? value : 0))
  )
}

export function trackAgentRunStarted(): void {
  trackAnalytics('agent_run_started')
}

/** Creates a content-free, once-only telemetry lifecycle for one Agent run. */
export function startAgentRunTelemetry(startedAt = Date.now()): AgentRunTelemetrySession {
  let finished = false
  trackAgentRunStarted()
  return {
    finish: (input) => {
      if (finished) return false
      finished = true
      trackAgentRunFinished({
        outcome: input.outcome,
        verificationOutcome: input.verificationOutcome,
        durationMs: (input.finishedAt ?? Date.now()) - startedAt,
        stopReason: input.stopReason,
        budgetReason: input.budgetReason,
      })
      return true
    },
  }
}

export function trackAgentRunFinished(input: {
  outcome: AgentRunOutcome
  verificationOutcome: AgentVerificationTelemetryOutcome
  durationMs: number
  stopReason: AgentRunStopReason
  budgetReason?: AgentBudgetReason
}): void {
  trackAnalytics('agent_run_finished', {
    runOutcome: input.outcome,
    verificationOutcome: input.verificationOutcome,
    durationMs: duration(input.durationMs),
    stopReason: input.stopReason,
    ...(input.budgetReason ? { budgetReason: input.budgetReason } : {}),
  })
}

export function trackAgentApprovalResolved(input: {
  outcome: AgentApprovalOverlayOutcome
  source: 'manual' | 'trusted' | 'autonomous' | 'fallback'
  durationMs: number
}): void {
  trackAnalytics('agent_approval_resolved', {
    approvalOutcome: input.outcome,
    approvalSource: input.source,
    durationMs: duration(input.durationMs),
  })
}

export function trackAgentVerificationResolved(input: {
  outcome: AgentVerificationTelemetryOutcome
  recoveryUsed: boolean
  durationMs: number
}): void {
  trackAnalytics('agent_verification_resolved', {
    verificationOutcome: input.outcome,
    recoveryUsed: input.recoveryUsed,
    durationMs: duration(input.durationMs),
  })
}
