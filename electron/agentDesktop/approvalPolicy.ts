/**
 * Agent Desktop (Agent View) approval policy — pure classification.
 *
 * Given an agent action and the configured allowlist policy, decide whether the
 * action may run automatically (`auto-approve`) or must prompt the user
 * (`approval-required`).
 *
 * This module is intentionally **pure**: no I/O, no shared state, no clocks.
 * It is fail-closed by construction — an action is `auto-approve` ONLY when the
 * policy explicitly classifies it as `auto-approve`. Everything else (unknown
 * actions, missing/malformed entries, or a missing policy map) is
 * `approval-required`.
 *
 * Note: the requirement that `close_app`, `launch_app`, and file deletion are
 * always `approval-required` (Req 5.5) is enforced upstream by normalization in
 * `settings.ts`, not here. This module only reads the policy it is given, while
 * still failing closed on anything that is not an explicit `auto-approve`.
 *
 * Req 5.1, 5.2, 5.5.
 */

import type { AgentActionType, ActionClassification } from './types'

/**
 * Allowlist-driven approval policy. Maps each agent action type to its
 * classification. An action is `auto-approve` only when it explicitly matches
 * an allowlist entry classified as `auto-approve`.
 */
export interface ApprovalPolicy {
  classifications: Record<AgentActionType, ActionClassification>
}

/**
 * Classify a single agent action against the configured approval policy.
 *
 * Returns `auto-approve` only when the policy explicitly classifies the action
 * as `auto-approve`; every other case (unmatched/unknown action, missing or
 * malformed policy) returns `approval-required`. Fail-closed by design
 * (Req 5.1, 5.2).
 *
 * @param action The agent action to classify.
 * @param policy The configured approval policy allowlist.
 */
export function classifyAction(
  action: AgentActionType,
  policy: ApprovalPolicy
): ActionClassification {
  // Fail closed if the policy or its classifications map is missing/malformed.
  if (!policy || typeof policy !== 'object') {
    return 'approval-required'
  }

  const classifications = policy.classifications
  if (!classifications || typeof classifications !== 'object') {
    return 'approval-required'
  }

  // Only an explicit `auto-approve` allowlist match downgrades to auto-approve.
  return classifications[action] === 'auto-approve' ? 'auto-approve' : 'approval-required'
}
