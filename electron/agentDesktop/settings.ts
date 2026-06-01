/**
 * Agent Desktop (Agent View) settings validation/normalization.
 *
 * Agent Desktop preferences live in the existing sanitized renderer settings
 * blob (`zura-settings` in renderer localStorage) under `settings.agentDesktop`
 * — no new file, no secure storage (Req 10.1). This module mirrors the
 * defensive pattern used by `normalizeSkillsSettings` / overlay normalization:
 * invalid or unreadable input falls back to the safe disabled default and never
 * provisions an Agent_Desktop (Req 10.8).
 */

import type { AgentActionType, ActionClassification } from './types'
import {
  DEFAULT_APPROVAL_TIMEOUT_MS,
  MIN_APPROVAL_TIMEOUT_MS,
  MAX_APPROVAL_TIMEOUT_MS,
} from './constants'

/**
 * Persisted Agent Desktop preferences (sanitized; non-secret).
 */
export interface AgentDesktopSettings {
  /** Skill toggle gating availability. Default: false (Req 10.2, 10.3). */
  enabled: boolean
  /** True only after the user acknowledges the not-a-sandbox disclosure (Req 12.2). */
  disclosureAcknowledged: boolean
  /**
   * `persist` keeps the Agent_Desktop between sessions; `ephemeral` removes it
   * when the last Agent_Window closes (Req 10.4).
   */
  persistence: 'persist' | 'ephemeral'
  /** Per-action approval classification (Req 10.5). */
  approvalPolicy: Record<AgentActionType, ActionClassification>
  /** Approval timeout in ms, clamped [5000, 600000], default 60000 (Req 5.6). */
  approvalTimeoutMs: number
}

/**
 * The complete Computer Use action surface Agent Desktop reuses. Used to build
 * a fully-populated, well-formed approval policy regardless of stored shape.
 */
const ALL_AGENT_ACTION_TYPES: readonly AgentActionType[] = [
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
 * by stored settings (Req 5.5: file deletion, closing applications, and
 * launching new applications). File deletion is not a distinct action type in
 * the Computer Use surface; it is gated through the `close_app` / `launch_app`
 * dangerous-action handling, so the forced set is `launch_app` + `close_app`.
 */
const FORCED_APPROVAL_ACTIONS: readonly AgentActionType[] = ['launch_app', 'close_app']

/**
 * Default per-action approval classifications: read-only/inspection actions are
 * `auto-approve`; everything that mutates UI/system state is `approval-required`.
 */
const DEFAULT_APPROVAL_POLICY: Record<AgentActionType, ActionClassification> = {
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

/**
 * Safe default Agent Desktop settings: disabled, disclosure not acknowledged,
 * ephemeral, default approval timeout, and the default approval policy.
 *
 * Treat this as immutable; `normalizeAgentDesktopSettings` always returns a
 * fresh object so callers can never mutate the shared default.
 */
export const defaultAgentDesktopSettings: AgentDesktopSettings = {
  enabled: false,
  disclosureAcknowledged: false,
  persistence: 'ephemeral',
  approvalPolicy: { ...DEFAULT_APPROVAL_POLICY },
  approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isActionClassification(value: unknown): value is ActionClassification {
  return value === 'auto-approve' || value === 'approval-required'
}

/**
 * Build a fresh copy of the safe disabled default. Used both as the top-level
 * fallback and as the per-field baseline during normalization.
 */
function createDefaultSettings(): AgentDesktopSettings {
  return {
    enabled: false,
    disclosureAcknowledged: false,
    persistence: 'ephemeral',
    approvalPolicy: { ...DEFAULT_APPROVAL_POLICY },
    approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
  }
}

/**
 * Clamp the approval timeout into [MIN_APPROVAL_TIMEOUT_MS, MAX_APPROVAL_TIMEOUT_MS],
 * defaulting to DEFAULT_APPROVAL_TIMEOUT_MS when absent or invalid (Req 5.6).
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
 * Build a fully-populated, well-formed approval policy from stored input.
 * Every action type is present; invalid/missing entries fall back to the
 * default classification. `launch_app` and `close_app` are always forced to
 * `approval-required` regardless of the stored value (Req 5.5).
 */
function normalizeApprovalPolicy(raw: unknown): Record<AgentActionType, ActionClassification> {
  const rawRecord = isRecord(raw) ? raw : undefined
  const policy = {} as Record<AgentActionType, ActionClassification>

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
      return createDefaultSettings()
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
    return createDefaultSettings()
  }
}
