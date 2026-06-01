/**
 * Renderer-side Agent Desktop (Agent View) settings default + normalization.
 *
 * Agent Desktop preferences live in the existing sanitized renderer settings
 * blob (`zura-settings` in localStorage) under `settings.agentDesktop` — no new
 * file, no secure storage (Req 10.1). This module mirrors the trusted
 * main-process normalization in `electron/agentDesktop/settings.ts` so the
 * renderer presents a complete, well-formed policy and the service falls back to
 * the same safe disabled default on invalid/unreadable input (Req 10.8).
 *
 * It follows the existing skills-normalization precedent
 * (`normalizeSkillsSettings`): pure, defensive, and never throwing.
 */

import type {
  AgentActionType,
  AgentActionClassification,
  AgentDesktopSettings,
} from '../electron/types'

/** Default approval timeout (ms). Mirrors main `DEFAULT_APPROVAL_TIMEOUT_MS`. Req 5.6. */
export const DEFAULT_APPROVAL_TIMEOUT_MS = 60_000
/** Minimum configurable approval timeout (clamp lower bound). Req 5.6. */
export const MIN_APPROVAL_TIMEOUT_MS = 5_000
/** Maximum configurable approval timeout (clamp upper bound). Req 5.6. */
export const MAX_APPROVAL_TIMEOUT_MS = 600_000

/**
 * The complete Computer Use action surface Agent Desktop reuses. Used to build
 * a fully-populated, well-formed approval policy regardless of stored shape and
 * to drive the per-action policy editor in the settings UI. Req 4.1, 10.5.
 */
export const ALL_AGENT_ACTION_TYPES: readonly AgentActionType[] = [
  'screenshot',
  'click',
  'type',
  'key',
  'scroll',
  'cursor_position',
  'list_windows',
  'launch_app',
  'close_app',
  'find_app',
]

/**
 * Action types that are always `approval-required` and can never be downgraded
 * by stored settings or the editor (Req 5.5: closing/launching applications and
 * file deletion). The Computer Use surface has no distinct file-deletion action,
 * so the forced set is `launch_app` + `close_app`; normalization enforces this.
 */
export const FORCED_APPROVAL_ACTIONS: readonly AgentActionType[] = ['launch_app', 'close_app']

/**
 * Default per-action approval classifications: read-only/inspection actions are
 * `auto-approve`; everything that mutates UI/system state is `approval-required`.
 */
const DEFAULT_APPROVAL_POLICY: Record<AgentActionType, AgentActionClassification> = {
  screenshot: 'auto-approve',
  list_windows: 'auto-approve',
  find_app: 'auto-approve',
  cursor_position: 'auto-approve',
  click: 'approval-required',
  type: 'approval-required',
  key: 'approval-required',
  scroll: 'approval-required',
  launch_app: 'approval-required',
  close_app: 'approval-required',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isActionClassification(value: unknown): value is AgentActionClassification {
  return value === 'auto-approve' || value === 'approval-required'
}

/**
 * Build a fresh copy of the safe disabled default. Returned fresh on every call
 * so callers can never mutate a shared default object.
 */
export function createDefaultAgentDesktopSettings(): AgentDesktopSettings {
  return {
    enabled: false,
    disclosureAcknowledged: false,
    persistence: 'ephemeral',
    approvalPolicy: { ...DEFAULT_APPROVAL_POLICY },
    approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
  }
}

/**
 * Safe default Agent Desktop settings: disabled, disclosure not acknowledged,
 * ephemeral, default approval timeout, and the default approval policy.
 */
export const defaultAgentDesktopSettings: AgentDesktopSettings = createDefaultAgentDesktopSettings()

/**
 * Clamp the approval timeout into [MIN, MAX], defaulting to DEFAULT when absent
 * or invalid (Req 5.6).
 */
function normalizeApprovalTimeoutMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return DEFAULT_APPROVAL_TIMEOUT_MS
  }
  if (raw < MIN_APPROVAL_TIMEOUT_MS) return MIN_APPROVAL_TIMEOUT_MS
  if (raw > MAX_APPROVAL_TIMEOUT_MS) return MAX_APPROVAL_TIMEOUT_MS
  return raw
}

/**
 * Build a fully-populated, well-formed approval policy from stored input. Every
 * action type is present; invalid/missing entries fall back to the default
 * classification. `launch_app` and `close_app` are always forced to
 * `approval-required` regardless of the stored value (Req 5.5).
 */
function normalizeApprovalPolicy(raw: unknown): Record<AgentActionType, AgentActionClassification> {
  const rawRecord = isRecord(raw) ? raw : undefined
  const policy = {} as Record<AgentActionType, AgentActionClassification>

  for (const action of ALL_AGENT_ACTION_TYPES) {
    const stored = rawRecord?.[action]
    policy[action] = isActionClassification(stored) ? stored : DEFAULT_APPROVAL_POLICY[action]
  }

  for (const action of FORCED_APPROVAL_ACTIONS) {
    policy[action] = 'approval-required'
  }

  return policy
}

/**
 * Validate and normalize persisted Agent Desktop preferences into a complete,
 * well-formed `AgentDesktopSettings`.
 *
 * - Invalid/unreadable input falls back to the safe disabled default (Req 10.8).
 * - `approvalTimeoutMs` is clamped to [5000, 600000], default 60000 (Req 5.6).
 * - `launch_app` / `close_app` are forced to `approval-required` (Req 5.5).
 * - `persistence` is constrained to `persist` | `ephemeral`, default `ephemeral` (Req 10.4).
 * - Never throws; any unexpected failure yields the safe disabled default.
 */
export function normalizeAgentDesktopSettings(raw: unknown): AgentDesktopSettings {
  try {
    if (!isRecord(raw)) {
      return createDefaultAgentDesktopSettings()
    }

    return {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : false,
      disclosureAcknowledged:
        typeof raw.disclosureAcknowledged === 'boolean' ? raw.disclosureAcknowledged : false,
      persistence: raw.persistence === 'persist' ? 'persist' : 'ephemeral',
      approvalPolicy: normalizeApprovalPolicy(raw.approvalPolicy),
      approvalTimeoutMs: normalizeApprovalTimeoutMs(raw.approvalTimeoutMs),
    }
  } catch {
    return createDefaultAgentDesktopSettings()
  }
}
