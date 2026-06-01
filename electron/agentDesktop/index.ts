/**
 * Agent Desktop (Agent View) IPC registration + renderer broadcasts.
 *
 * This module is the narrow, allowlisted boundary between the untrusted
 * renderer and the trusted {@link AgentDesktopService}. It mirrors the existing
 * MCP (`electron/mcp/index.ts`), Code Execution
 * (`electron/tools/code-execution/index.ts`), and Computer Use
 * (`electron/tools/computer-use/index.ts`) precedents:
 *
 * - It resolves the process-wide service singleton via
 *   {@link getAgentDesktopService} so the IPC layer and the Computer Use gate
 *   (`electron/tools/index.ts`) share one instance — one VDA binding, one
 *   session, one shared action counter / abort state.
 * - It registers exactly the six allowlisted invoke channels the design's "IPC
 *   Surface (Security-Critical)" table defines, and broadcasts the three
 *   main→renderer channels.
 * - It treats the renderer as untrusted: every input is validated in main
 *   before it reaches the service (Req 12.3, 12.4). The service additionally
 *   validates `apply-settings` payloads internally (retain-on-failure, Req 10.7).
 * - It is gated Windows-only. The Windows-only registration is enforced by
 *   `electron/main.ts` (Task 17.3, `if (!IS_MACOS) registerAgentDesktopHandlers()`),
 *   and **as defense in depth** every handler additionally rejects on `darwin`
 *   without performing any desktop operation (Req 9.1, 9.4).
 *
 * ## Channels
 *
 * Invoke (renderer → main):
 * - `agent-desktop:get-state` — return the current {@link AgentDesktopState}.
 * - `agent-desktop:apply-settings` — mirror sanitized renderer preferences
 *   (Req 10.6). Returns the applied {@link AgentDesktopState}.
 * - `agent-desktop:take-over` — activate Take_Over (Req 3.3).
 * - `agent-desktop:end-take-over` — end Take_Over (Req 3.9).
 * - `agent-desktop:resolve-approval` — resolve a pending approval (Req 5.8).
 * - `agent-desktop:acknowledge-disclosure` — record the not-a-sandbox
 *   disclosure acknowledgement (Req 12.1, 12.2).
 *
 * Broadcast (main → renderer):
 * - `agent-desktop:state-changed` — {@link AgentDesktopState} on any
 *   lifecycle / presence / pending-approval change.
 * - `agent-desktop:pending-approval` — the pending approval list (mirrors
 *   `computer-use:pending-approval`).
 * - `agent-desktop:killed` — the kill-switch abort, so the Agent_Run timeline
 *   reflects the aborted session (Req 6.6).
 */

import { BrowserWindow, ipcMain } from 'electron'

import {
  getAgentDesktopService,
  resetAgentDesktopService,
  type AgentDesktopService,
  type AgentDesktopTimelineStep,
} from './service'
import type { PendingAgentDesktopAction } from './approvalManager'
import type { AgentDesktopState } from './types'

// ---------------------------------------------------------------------------
// Channel names (single source of truth for the preload allowlist, Task 17.2)
// ---------------------------------------------------------------------------

/** Invoke channel: return the current {@link AgentDesktopState}. */
export const AGENT_DESKTOP_GET_STATE_CHANNEL = 'agent-desktop:get-state'
/** Invoke channel: mirror sanitized renderer preferences into the service. */
export const AGENT_DESKTOP_APPLY_SETTINGS_CHANNEL = 'agent-desktop:apply-settings'
/** Invoke channel: activate Take_Over. */
export const AGENT_DESKTOP_TAKE_OVER_CHANNEL = 'agent-desktop:take-over'
/** Invoke channel: end Take_Over. */
export const AGENT_DESKTOP_END_TAKE_OVER_CHANNEL = 'agent-desktop:end-take-over'
/** Invoke channel: resolve a pending approval. */
export const AGENT_DESKTOP_RESOLVE_APPROVAL_CHANNEL = 'agent-desktop:resolve-approval'
/** Invoke channel: record the not-a-sandbox disclosure acknowledgement. */
export const AGENT_DESKTOP_ACKNOWLEDGE_DISCLOSURE_CHANNEL = 'agent-desktop:acknowledge-disclosure'

/** Broadcast channel: {@link AgentDesktopState} on any state change. */
export const AGENT_DESKTOP_STATE_CHANGED_CHANNEL = 'agent-desktop:state-changed'
/** Broadcast channel: the pending approval list. */
export const AGENT_DESKTOP_PENDING_APPROVAL_CHANNEL = 'agent-desktop:pending-approval'
/** Broadcast channel: the kill-switch abort. */
export const AGENT_DESKTOP_KILLED_CHANNEL = 'agent-desktop:killed'

/** Every invoke channel this module registers. Used by `unregister`. */
const INVOKE_CHANNELS = [
  AGENT_DESKTOP_GET_STATE_CHANNEL,
  AGENT_DESKTOP_APPLY_SETTINGS_CHANNEL,
  AGENT_DESKTOP_TAKE_OVER_CHANNEL,
  AGENT_DESKTOP_END_TAKE_OVER_CHANNEL,
  AGENT_DESKTOP_RESOLVE_APPROVAL_CHANNEL,
  AGENT_DESKTOP_ACKNOWLEDGE_DISCLOSURE_CHANNEL,
] as const

/**
 * Payload broadcast on `agent-desktop:killed` (Req 6.6). Identifies the aborted
 * Agent_Run plus the current state so the renderer timeline can reflect the
 * aborted session immediately.
 */
export interface AgentDesktopKilledPayload {
  /** The Agent_Run that was aborted by the kill switch. */
  agentRunId: string
  /** Human-readable abort reason. */
  reason: string
  /** When the abort occurred (epoch ms). */
  occurredAt: number
  /** The service state captured at abort time. */
  state: AgentDesktopState
}

/** Windows-only gate: macOS is the only non-Windows target the app supports. */
const IS_MACOS = process.platform === 'darwin'

// ---------------------------------------------------------------------------
// Subscription bookkeeping
// ---------------------------------------------------------------------------

let unsubscribeStateBroadcast: (() => void) | null = null
let unsubscribeTimelineBroadcast: (() => void) | null = null
let unsubscribeApprovalBroadcast: (() => void) | null = null
/**
 * The approval manager the broadcast is currently subscribed to.
 * {@link AgentDesktopService.applySettings} may reconstruct the approval manager
 * when the approval timeout changes (only while no session / no pending approval
 * is in flight), so the subscription is reconciled onto the current manager on
 * every state change to keep `pending-approval` broadcasts flowing.
 */
let subscribedApprovalManager: ReturnType<AgentDesktopService['getApprovalManager']> | null = null

/**
 * Memoized initialization promise. Both {@link registerAgentDesktopHandlers}'
 * callers (the main wiring in Task 17.3) and the IPC handlers route through
 * {@link initializeAgentDesktopService}, so the VDA binding is loaded exactly
 * once regardless of call order. Reset on dispose so a fresh service can be
 * initialized after teardown.
 */
let initPromise: Promise<AgentDesktopState> | null = null

/**
 * Initialize the shared Agent Desktop service exactly once (loads + probes the
 * VDA binding, Req 8.1). Idempotent: repeated calls return the same in-flight or
 * settled promise. The main wiring (Task 17.3) awaits this during
 * `app.whenReady()`; the IPC handlers also route through it so the first
 * renderer call cannot observe an uninitialized service.
 *
 * On macOS this still resolves — the service reports `platformSupported: false`
 * and `vdaOutcome: 'unavailable'` without touching any native binding — but in
 * practice handlers are never registered on macOS (Req 9.1).
 */
export function initializeAgentDesktopService(): Promise<AgentDesktopState> {
  if (!initPromise) {
    initPromise = getAgentDesktopService().initialize()
  }
  return initPromise
}

// ---------------------------------------------------------------------------
// Broadcast helpers (main → all renderer windows)
// ---------------------------------------------------------------------------

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

function broadcastState(state: AgentDesktopState): void {
  broadcast(AGENT_DESKTOP_STATE_CHANGED_CHANNEL, state)
}

function broadcastPendingApprovals(pending: PendingAgentDesktopAction[]): void {
  broadcast(AGENT_DESKTOP_PENDING_APPROVAL_CHANNEL, pending)
}

function broadcastKilled(payload: AgentDesktopKilledPayload): void {
  broadcast(AGENT_DESKTOP_KILLED_CHANNEL, payload)
}

/**
 * Ensure the `pending-approval` broadcast is subscribed to the service's
 * *current* approval manager. {@link AgentDesktopService.applySettings} may swap
 * the manager when the configured approval timeout changes, so the subscription
 * is reconciled here (called on initial registration and on every state change).
 */
function ensureApprovalSubscription(service: AgentDesktopService): void {
  const current = service.getApprovalManager()
  if (subscribedApprovalManager === current) {
    return
  }
  unsubscribeApprovalBroadcast?.()
  subscribedApprovalManager = current
  unsubscribeApprovalBroadcast = current.onPendingChange((pending) => {
    broadcastPendingApprovals(pending)
  })
}

// ---------------------------------------------------------------------------
// Input validation (renderer is untrusted — Req 12.3, 12.4)
// ---------------------------------------------------------------------------

/**
 * Reject any Agent Desktop IPC call on macOS without performing a desktop
 * operation (Req 9.1, 9.4). Defense in depth: handlers are not even registered
 * on macOS (`electron/main.ts`), but every handler still fails closed here.
 */
function assertNotMacOS(): void {
  if (IS_MACOS) {
    throw new Error('Agent Desktop is unavailable on macOS.')
  }
}

/** Validate an approval request id mirrored from the untrusted renderer. */
function assertApprovalRequestId(requestId: unknown): string {
  if (typeof requestId !== 'string' || !requestId.trim()) {
    throw new Error('Invalid Agent Desktop approval request id')
  }
  return requestId.trim()
}

// ---------------------------------------------------------------------------
// Registration / teardown
// ---------------------------------------------------------------------------

/**
 * Register the Agent Desktop IPC handlers and renderer broadcasts.
 *
 * Idempotent: calls {@link unregisterAgentDesktopHandlers} first so a double
 * registration cannot leak duplicate `ipcMain.handle` registrations or
 * subscriptions. Kicks off (memoized) initialization so the VDA binding is
 * loaded and the first `state-changed` broadcast reflects the real availability.
 *
 * This function is invoked Windows-only by `electron/main.ts`
 * (`if (!IS_MACOS) registerAgentDesktopHandlers()`); the per-handler macOS
 * rejection below is defense in depth.
 */
export function registerAgentDesktopHandlers(): void {
  unregisterAgentDesktopHandlers()

  const service = getAgentDesktopService()

  // Broadcast state on any lifecycle / presence / pending-approval change, and
  // reconcile the approval subscription in case apply-settings swapped the
  // manager.
  unsubscribeStateBroadcast = service.onStateChange((state) => {
    broadcastState(state)
    ensureApprovalSubscription(service)
  })

  // Broadcast the kill-switch abort (Req 6.6) when the service emits the
  // `kill-switch-abort` timeline step.
  unsubscribeTimelineBroadcast = service.onTimelineStep((step: AgentDesktopTimelineStep) => {
    if (step.kind === 'kill-switch-abort') {
      broadcastKilled({
        agentRunId: step.agentRunId,
        reason: step.reason ?? 'The agent run was aborted by the kill switch.',
        occurredAt: step.occurredAt,
        state: service.getState(),
      })
    }
  })

  // Subscribe to the current approval manager for the pending-approval broadcast.
  ensureApprovalSubscription(service)

  // `agent-desktop:get-state` — return the current state. Ensures the service is
  // initialized (memoized) so the first renderer read sees real availability.
  ipcMain.handle(AGENT_DESKTOP_GET_STATE_CHANNEL, async () => {
    assertNotMacOS()
    await initializeAgentDesktopService()
    return service.getState()
  })

  // `agent-desktop:apply-settings` — mirror sanitized renderer preferences
  // (Req 10.6). The payload is untrusted; the service validates/normalizes it
  // internally and retains the last good settings on an unusable payload
  // (Req 10.7, 12.3). Returns the applied state.
  ipcMain.handle(AGENT_DESKTOP_APPLY_SETTINGS_CHANNEL, async (_event, settings: unknown) => {
    assertNotMacOS()
    await initializeAgentDesktopService()
    return service.applySettings(settings)
  })

  // `agent-desktop:take-over` — activate Take_Over (Req 3.3).
  ipcMain.handle(AGENT_DESKTOP_TAKE_OVER_CHANNEL, async () => {
    assertNotMacOS()
    await initializeAgentDesktopService()
    return service.activateTakeOver()
  })

  // `agent-desktop:end-take-over` — end Take_Over (Req 3.9).
  ipcMain.handle(AGENT_DESKTOP_END_TAKE_OVER_CHANNEL, async () => {
    assertNotMacOS()
    await initializeAgentDesktopService()
    return service.endTakeOver()
  })

  // `agent-desktop:resolve-approval` — resolve a pending approval (Req 5.8).
  // Validate the request id and coerce `approved` to a strict boolean so a
  // truthy-but-not-true renderer value can never approve an action.
  ipcMain.handle(
    AGENT_DESKTOP_RESOLVE_APPROVAL_CHANNEL,
    (_event, requestId: unknown, approved: unknown) => {
      assertNotMacOS()
      const normalizedRequestId = assertApprovalRequestId(requestId)
      return service.getApprovalManager().resolveApproval(normalizedRequestId, approved === true)
    }
  )

  // `agent-desktop:acknowledge-disclosure` — record the not-a-sandbox
  // disclosure acknowledgement that gates enabling the skill (Req 12.1, 12.2).
  // Returns the resulting state so the renderer can reflect the acknowledgement.
  ipcMain.handle(AGENT_DESKTOP_ACKNOWLEDGE_DISCLOSURE_CHANNEL, () => {
    assertNotMacOS()
    service.acknowledgeDisclosure()
    return service.getState()
  })
}

/**
 * Remove every Agent Desktop IPC handler and unsubscribe all broadcasts.
 * Idempotent and safe to call when nothing is registered.
 */
export function unregisterAgentDesktopHandlers(): void {
  unsubscribeStateBroadcast?.()
  unsubscribeStateBroadcast = null
  unsubscribeTimelineBroadcast?.()
  unsubscribeTimelineBroadcast = null
  unsubscribeApprovalBroadcast?.()
  unsubscribeApprovalBroadcast = null
  subscribedApprovalManager = null

  for (const channel of INVOKE_CHANNELS) {
    ipcMain.removeHandler(channel)
  }
}

/**
 * Full teardown for app quit. Unregisters the IPC handlers / broadcasts and
 * disposes the shared service singleton, which releases the VDA binding
 * (Req 1.7), cancels pending approvals, and clears held input. Resets the
 * memoized init promise so a subsequent registration can re-initialize a fresh
 * service.
 *
 * Returning the displayed Virtual_Desktop to the recorded User_Desktop on quit
 * (Req 1.10) is owned by the main `will-quit` wiring (Task 17.3), not this
 * function.
 */
export function disposeAgentDesktopService(): void {
  unregisterAgentDesktopHandlers()
  resetAgentDesktopService()
  initPromise = null
}
