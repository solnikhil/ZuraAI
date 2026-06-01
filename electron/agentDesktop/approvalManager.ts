/**
 * Agent Desktop approval coordinator.
 *
 * `AgentDesktopApprovalManager` follows the existing `BaseApprovalManager`
 * pattern used by Computer Use, MCP, and Code Execution (Req 5.8). Only
 * `approval-required` actions are routed through this manager; `auto-approve`
 * actions proceed without a prompt (Req 5.3). For `approval-required` actions
 * the manager records a pending request that the renderer resolves through the
 * narrow `agent-desktop:resolve-approval` IPC channel (Req 5.4, 5.8).
 *
 * The approval timeout is configurable from validated settings (default 60s,
 * clamped 5–600s per Req 5.6). A timeout is treated as a rejection by the base
 * class, which finishes the pending request with a `timed_out` outcome and
 * `approved: false`.
 */

import {
  BaseApprovalManager,
  type BaseApprovalDecision,
} from '../utils/baseApprovalManager'
import {
  DEFAULT_APPROVAL_TIMEOUT_MS,
  MIN_APPROVAL_TIMEOUT_MS,
  MAX_APPROVAL_TIMEOUT_MS,
} from './constants'

/**
 * A pending Agent Desktop action awaiting user approval. Mirrors
 * `PendingComputerAction`, with an explicit `classification` field that is
 * always `approval-required` because auto-approved actions never reach the
 * approval manager.
 */
export interface PendingAgentDesktopAction {
  id: string
  action: string
  args: Record<string, unknown>
  classification: 'approval-required'
  screenshot?: string
  requestedAt: number
  expiresAt: number
}

export interface AgentDesktopApprovalDecision extends BaseApprovalDecision {}

interface AgentDesktopApprovalOptions {
  action: string
  args: Record<string, unknown>
  screenshot?: string
}

/**
 * Clamp a configured timeout to the supported range, falling back to the
 * default when the input is missing or not a finite positive number. Settings
 * validation already enforces this range; clamping here keeps the manager
 * self-contained and defensive against callers that bypass validation.
 */
function clampApprovalTimeout(timeoutMs: number | undefined): number {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs)) {
    return DEFAULT_APPROVAL_TIMEOUT_MS
  }
  return Math.min(
    MAX_APPROVAL_TIMEOUT_MS,
    Math.max(MIN_APPROVAL_TIMEOUT_MS, Math.round(timeoutMs))
  )
}

export class AgentDesktopApprovalManager extends BaseApprovalManager<
  PendingAgentDesktopAction,
  AgentDesktopApprovalDecision,
  AgentDesktopApprovalOptions
> {
  constructor(options?: { defaultTimeoutMs?: number }) {
    super({ defaultTimeoutMs: clampApprovalTimeout(options?.defaultTimeoutMs) })
  }

  protected buildRequest(
    id: string,
    requestedAt: number,
    expiresAt: number,
    options: AgentDesktopApprovalOptions
  ): PendingAgentDesktopAction {
    return {
      id,
      action: options.action,
      args: options.args,
      classification: 'approval-required',
      screenshot: options.screenshot,
      requestedAt,
      expiresAt,
    }
  }
}
