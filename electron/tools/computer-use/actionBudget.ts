import { MAX_ACTIONS_PER_SESSION } from './constants'

/**
 * Per-session Computer Use action budget.
 *
 * Budgets are keyed by the caller's session key (`<senderWebContentsId>:<runId>`).
 * A single process-wide counter meant that once `MAX_ACTIONS_PER_SESSION`
 * actions had accumulated across unrelated runs, every subsequent Computer Use
 * run failed until an emergency abort or an app restart.
 */
const actionCounts = new Map<string, number>()

/**
 * Starts a session's budget at zero the first time that session is seen.
 *
 * Deliberately does not reset an existing budget: taking another screenshot
 * part-way through a run must not hand the model a fresh allowance.
 */
export function initializeActionBudget(sessionKey: string): void {
  if (!actionCounts.has(sessionKey)) {
    actionCounts.set(sessionKey, 0)
  }
}

/**
 * Charges one action to `sessionKey`.
 *
 * @returns an error message when the session is over budget, otherwise `null`.
 */
export function consumeActionBudget(sessionKey: string): string | null {
  const next = (actionCounts.get(sessionKey) ?? 0) + 1
  actionCounts.set(sessionKey, next)
  if (next > MAX_ACTIONS_PER_SESSION) {
    return `Action limit reached (${MAX_ACTIONS_PER_SESSION}) for this run. Start a new task.`
  }
  return null
}

/** Terminal cleanup for one session's budget. */
export function releaseActionBudget(sessionKey: string): void {
  actionCounts.delete(sessionKey)
}

/** Terminal cleanup for every session (emergency abort, handler teardown). */
export function releaseAllActionBudgets(): void {
  actionCounts.clear()
}

/** Actions already charged to a session. Exposed for diagnostics and tests. */
export function getActionBudgetUsage(sessionKey: string): number {
  return actionCounts.get(sessionKey) ?? 0
}
