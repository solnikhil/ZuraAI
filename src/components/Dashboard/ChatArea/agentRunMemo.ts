import type { AgentRun } from '@/chat/types'

type RevisionedAgentRun = AgentRun & { revision?: number }

/**
 * Prefer the run ledger's monotonic revision. The compact fallback keeps this
 * renderer correct for persisted runs created before revisions were added.
 */
export function getAgentRunMemoKey(run: AgentRun | undefined): string {
  if (!run) return 'none'

  const revision = (run as RevisionedAgentRun).revision
  const terminalKey = `${run.status}:${run.verification}:${run.completedAt ?? ''}`
  if (typeof revision === 'number') {
    return `${run.id}:${revision}:${terminalKey}`
  }

  const stepKey = run.steps
    .map(
      (step) =>
        `${step.id}:${step.status}:${step.approvalState ?? ''}:${step.startedAt ?? ''}:${step.completedAt ?? ''}`
    )
    .join('|')

  return `${run.id}:${terminalKey}:${stepKey}`
}
