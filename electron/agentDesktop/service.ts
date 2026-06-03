/**
 * Agent Desktop (Agent View) service — core state + capability scaffolding.
 *
 * `AgentDesktopService` is the main-process orchestration entry point for the
 * Windows-only Agent Desktop feature. It owns the authoritative
 * {@link AgentDesktopState}, the VDA binding lifecycle, the capability resolver,
 * and the state-change broadcast plumbing that the IPC layer
 * (`electron/agentDesktop/index.ts`) and the Computer Use gate
 * (`electron/tools/index.ts`) build on.
 *
 * ## Scope of this module
 * Implemented here:
 * - {@link AgentDesktopService.initialize} — load + probe the VDA binding and
 *   record the load outcome / availability (Req 8.1, 8.4).
 * - {@link AgentDesktopService.getState} — snapshot the full state (Req 8.5).
 * - {@link AgentDesktopService.dispose} — release the VDA binding and clear
 *   listeners (Req 1.7).
 * - {@link AgentDesktopService.onStateChange} — subscribe to state changes.
 * - {@link AgentDesktopService.startSession} / {@link AgentDesktopService.completeSession}
 *   — provisioning + teardown lifecycle (Req 1.1–1.6, 1.8–1.10, 3.1, 3.9).
 * - the internal state shape, the capability resolver, and the notify/broadcast
 *   mechanism.
 *
 * Implemented by Task 13 (Computer Use action gate + kill switch):
 * - {@link AgentDesktopService.gateComputerAction} — the single gate enforcing
 *   availability, shared action cap + abort/kill state, capture redirect,
 *   presence + held-input, targeting, and the approval policy, with full
 *   timeline recording (Req 3.6–3.8, 4.5, 4.7, 5.7, 6.4, 6.7–6.9, 8.5, 8.6,
 *   10.9, 10.10, 12.1, 12.2, 12.6).
 * - {@link AgentDesktopService.abortForKillSwitch} / {@link AgentDesktopService.registerEscape}
 *   — double-Escape kill switch that aborts the run, stops dispatch, returns to
 *   the recorded User_Desktop, and cancels pending approvals (Req 6.1–6.6).
 *
 * Implemented by Task 14 (settings mirroring + disclosure acknowledgement):
 * - {@link AgentDesktopService.applySettings} — validate/normalize mirrored
 *   renderer preferences; retain the last-applied settings + surface an error on
 *   an unusable payload; gate enabling on disclosure acknowledgement (Req 10.6,
 *   10.7, 12.1, 12.2, 12.3).
 * - {@link AgentDesktopService.acknowledgeDisclosure} — record the not-a-sandbox
 *   disclosure acknowledgement that unlocks enabling the skill (Req 12.1, 12.2,
 *   12.3).
 *
 * Implemented by Task 12 (window placement + presence transitions):
 * - {@link AgentDesktopService.notifyWindowOpened} — stage/relocate Agent_Windows
 *   onto the recorded Agent_Desktop, excluding ZuraAI-owned windows, emitting
 *   identifying timeline steps (Req 2.1, 2.2, 2.5, 2.6, 11.2, 11.3).
 * - {@link AgentDesktopService.activateTakeOver} / {@link AgentDesktopService.endTakeOver}
 *   — display-switch-gated presence transitions (Req 3.3, 3.4, 3.9).
 *
 * ## Graceful degradation (Req 8.4, 8.5)
 * When the VDA binding is unavailable — because the platform is not supported,
 * the DLL/FFI failed to load, or the skill is disabled — only the Agent Desktop
 * capability is disabled. `initialize()` never throws: a failed VDA load is
 * surfaced into {@link AgentDesktopState.lastError} (sourced from the binding's
 * user-visible load error, which names VirtualDesktopAccessor) while every other
 * application capability keeps working untouched.
 */

import { createVdaBinding, VdaError, type VdaBinding } from './vdaBinding'
import {
  defaultAgentDesktopSettings,
  normalizeAgentDesktopSettings,
  type AgentDesktopSettings,
} from './settings'
import {
  DISPLAY_SWITCH_TIMEOUT_MS,
  KILL_SWITCH_WINDOW_MS,
  MAX_ACTIONS_PER_SESSION,
  MAX_PLACEMENT_ATTEMPTS,
  PROVISION_TIMEOUT_MS,
  VDA_LOAD_TIMEOUT_MS,
  WINDOW_PLACEMENT_TIMEOUT_MS,
} from './constants'
import { classifyAction } from './approvalPolicy'
import { isInputAction, permitsAction } from './presence'
import {
  canTargetWindow,
  type TargetingContext,
  type TargetingRejectionReason,
} from './targeting'
import { HeldInputQueue, type HeldInputItem } from './heldInputQueue'
import {
  AgentDesktopApprovalManager,
  type AgentDesktopApprovalDecision,
} from './approvalManager'
import type {
  AgentActionType,
  AgentDesktopCapabilityState,
  AgentDesktopSession,
  AgentDesktopState,
  AgentWindowRecord,
  PresenceMode,
  VdaLoadOutcome,
} from './types'

/**
 * A {@link VdaBinding} that also exposes a user-visible load-error string. The
 * concrete `KoffiVdaBinding` implements `getLoadError()`, but it is not part of
 * the minimal `VdaBinding` contract, so it is read defensively via this shape.
 */
interface VdaBindingWithLoadError extends VdaBinding {
  getLoadError(): string | null
}

/**
 * Read the binding's user-visible load error if it exposes one. Returns `null`
 * when the binding does not implement `getLoadError` or the call fails.
 */
function readBindingLoadError(binding: VdaBinding): string | null {
  const maybe = binding as Partial<VdaBindingWithLoadError>
  if (typeof maybe.getLoadError !== 'function') {
    return null
  }
  try {
    return maybe.getLoadError() ?? null
  } catch {
    return null
  }
}

/** A state-change listener. Receives a fresh, immutable state snapshot. */
export type AgentDesktopStateListener = (state: AgentDesktopState) => void

/** Unsubscribe handle returned by {@link AgentDesktopService.onStateChange}. */
export type Unsubscribe = () => void

/**
 * Result of {@link AgentDesktopService.startSession}.
 *
 * A discriminated union so callers can branch on `provisioned` without
 * inspecting the state:
 * - `{ provisioned: true; state }` — an Agent_Desktop was reused or created and
 *   a session is now active (`capability === 'active'`, `presence === 'background'`).
 * - `{ provisioned: false; error; state }` — provisioning was skipped or aborted
 *   (skill disabled, capability unavailable, or create/ensure failed/timed out).
 *   The User_Desktop stays active and `error` is mirrored into
 *   {@link AgentDesktopState.lastError} (Req 1.8, 8.6, 10.10).
 */
export type SessionStartResult =
  | { provisioned: true; state: AgentDesktopState }
  | { provisioned: false; error: string; state: AgentDesktopState }

/**
 * Result of {@link AgentDesktopService.ensureReadyForTool}.
 *
 * This is the preflight the `computer_*` tool route calls before asking
 * {@link gateComputerAction} for an action decision:
 * - `{ ready: true; state }` — an Agent_Desktop session is active and its
 *   recorded desktop index still resolves.
 * - `{ ready: false; error; state }` — Agent Desktop is disabled/unavailable,
 *   disclosure is missing, or provisioning/verification failed. The caller must
 *   return the error without falling back to the User_Desktop.
 */
export type ToolReadinessResult =
  | { ready: true; state: AgentDesktopState }
  | { ready: false; error: string; state: AgentDesktopState }

/**
 * Outcome of the ephemeral teardown decision performed by
 * {@link AgentDesktopService.completeSession}.
 *
 * - `removed` — the Zura-created Agent_Desktop was empty of non-agent windows
 *   and was removed (Req 1.5).
 * - `retained-non-agent` — the Agent_Desktop contained windows ZuraAI did not
 *   place, so it was kept and a notice surfaced (Req 1.6).
 * - `retained-persist` — persistence is `persist`, so the desktop is kept.
 * - `retained-reused` — the desktop was reused (not created by Zura), so it is
 *   never torn down.
 * - `none` — nothing to tear down (no session, or capture failed defensively).
 */
export type TeardownOutcome =
  | 'removed'
  | 'retained-non-agent'
  | 'retained-persist'
  | 'retained-reused'
  | 'none'

/**
 * Kind of an {@link AgentDesktopTimelineStep}. Mirrors the subset of
 * `AgentStep` semantics (`src/chat/types.ts`) that the main-process service
 * emits for window placement and presence transitions. The renderer's
 * `AgentRun` timeline maps these onto `AgentStep` (`kind: 'computer'`) using the
 * `title`/`summary`/`status` convention documented in the design (Req 11.2/11.3).
 *
 * - `stage-window` — an Agent_Window was moved onto the Agent_Desktop for the
 *   first time (title `Stage window`, `status: 'completed'`). Req 11.2.
 * - `relocate-window` — an Agent_Window that drifted onto another desktop was
 *   relocated back onto the Agent_Desktop (title `Relocate window`,
 *   `status: 'completed'`). Req 11.3.
 * - `placement-failure` — placement failed after {@link MAX_PLACEMENT_ATTEMPTS}
 *   attempts (title `Place window`, `status: 'failed'`). Req 2.5.
 */
export type AgentDesktopTimelineStepKind =
  | 'stage-window'
  | 'relocate-window'
  | 'placement-failure'
  // Gate steps (Task 13). Each gated Computer Use action emits exactly one of
  // these so the renderer's AgentRun timeline records the action's request +
  // decision (Req 4.5, Property 16). The execution *result* of an allowed
  // action is recorded by the caller (Task 16.1) onto the same logical step.
  /** A gated action passed every gate and may be dispatched (Req 4.5). */
  | 'action-allowed'
  /**
   * A gated action was rejected by a gate (availability, out-of-surface, abort,
   * action cap, targeting, or a non-approved outcome) and is NOT dispatched
   * (Req 4.7, 5.7, 6.4, 6.8, 7.2, 8.5, 12.6).
   */
  | 'action-rejected'
  /** An input action was held because the Agent_Desktop is not displayed (Req 3.6). */
  | 'action-held'
  /** A held input action aged out without delivery and was discarded (Req 3.8). */
  | 'held-expired'
  /** The double-Escape kill switch aborted the run (Req 6.2, 6.6). */
  | 'kill-switch-abort'

/**
 * Status of an {@link AgentDesktopTimelineStep}. A superset of the renderer's
 * placement statuses, extended with the decision statuses the Computer Use gate
 * emits (Task 13).
 *
 * - `completed` — a placement / allowed-action step succeeded.
 * - `failed` — a placement step failed after the attempt threshold (Req 2.5).
 * - `rejected` — a gated action was rejected by a gate (Req 4.7, 5.7, 6.8, 7.2).
 * - `held` — an input action was held for later delivery (Req 3.6).
 * - `expired` — a held input action aged out and was discarded (Req 3.8).
 * - `aborted` — the run was aborted by the kill switch (Req 6.2).
 */
export type AgentDesktopTimelineStepStatus =
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'held'
  | 'expired'
  | 'aborted'

/**
 * A structured timeline step emitted by the service for the IPC/renderer layer
 * to forward into the per-message `AgentRun` timeline.
 *
 * The service is main-process and does not own the renderer's `AgentRun`, so
 * "record a timeline step" here means *emit* a structured event that the IPC
 * layer (Task 17) forwards to the renderer, which maps it onto an `AgentStep`.
 *
 * Window-placement steps (`stage-window` / `relocate-window` / `placement-failure`)
 * identify the affected Agent_Window (by `hwnd`, plus best-effort `windowTitle`)
 * and the time it occurred (`occurredAt`), satisfying Req 11.2/11.3.
 *
 * Gate steps (`action-*`, `held-expired`, `kill-switch-abort`) identify the
 * gated Computer Use `action`, the decision `outcome`, and an optional
 * human-readable `reason`, satisfying Req 4.5 (full timeline recording). `hwnd`
 * is present only when the step concerns a specific window (e.g. a targeting
 * violation or a window-targeted input action).
 */
export interface AgentDesktopTimelineStep {
  /** Which placement / gate event occurred. */
  kind: AgentDesktopTimelineStepKind
  /** Human-readable title, aligned with the design's `AgentStep` titles. */
  title: string
  /** The Agent_Run this step belongs to. */
  agentRunId: string
  /** Native window handle of the affected window, when the step concerns one. Req 11.2/11.3. */
  hwnd?: number
  /** Best-effort window title at the time of the step, if known. */
  windowTitle?: string
  /** The gated Computer Use action this step concerns (gate steps only). Req 4.5. */
  action?: AgentActionType
  /** Decision outcome for gate steps. Req 4.5, 5.7, 6.8. */
  outcome?: GateRejectionOutcome | 'allowed'
  /** Human-readable reason / detail for rejections and holds. */
  reason?: string
  /** Outcome status. */
  status: AgentDesktopTimelineStepStatus
  /** When the step occurred (epoch ms). Req 11.2/11.3. */
  occurredAt: number
}

/** A timeline-step listener. Receives each emitted {@link AgentDesktopTimelineStep}. */
export type AgentDesktopTimelineStepListener = (step: AgentDesktopTimelineStep) => void

/**
 * A held-input release listener. Receives a still-live held input action when
 * Take_Over displays the Agent_Desktop and the queue is drained in FIFO order
 * (Req 3.7). The caller (Task 16.1) delivers each released action subject to the
 * approval policy. The service itself performs no OS input delivery; it only
 * surfaces what should now be delivered.
 */
export type AgentDesktopHeldInputListener = (item: HeldInputItem) => void

/**
 * Result of a presence transition ({@link AgentDesktopService.activateTakeOver}
 * / {@link AgentDesktopService.endTakeOver}).
 *
 * A discriminated union so callers branch on `ok` without inspecting the state:
 * - `{ ok: true; state }` — the transition succeeded and `state` reflects the
 *   new presence / displayed desktop.
 * - `{ ok: false; error; state }` — the transition failed (no session, display
 *   switch failed/timed out); presence is unchanged from `background`, no input
 *   is delivered, and `error` is mirrored into {@link AgentDesktopState.lastError}
 *   (Req 3.4).
 */
export type PresenceResult =
  | { ok: true; state: AgentDesktopState }
  | { ok: false; error: string; state: AgentDesktopState }

/**
 * The outcome label recorded for a rejected gated action. Mirrors the design's
 * `{ allow: false; reason; outcome }` contract and the renderer timeline
 * vocabulary. The caller never drives the OS for any of these outcomes
 * (Req 4.7, 8.6) and never falls back to the User_Desktop.
 *
 * - `rejected` — availability / disabled-skill / out-of-surface / targeting /
 *   approval-policy rejection (Req 5.7, 7.2, 8.5, 10.9, 12.1, 12.2, 12.6).
 * - `aborted` — the session was aborted by the kill switch; no further action
 *   dispatches (Req 6.4).
 * - `held` — an input action was held because the Agent_Desktop is not the
 *   displayed Virtual_Desktop; it is parked, not delivered (Req 3.6).
 * - `limit-reached` — the per-session action cap was reached (Req 6.8, 6.9).
 */
export type GateRejectionOutcome = 'rejected' | 'aborted' | 'held' | 'limit-reached'

/**
 * Input to {@link AgentDesktopService.gateComputerAction}. The Computer Use tool
 * path (Task 16.1) resolves the action name, raw args, and — for
 * window-targeted actions — the target window handle plus its confirmed
 * residence before calling the gate.
 */
export interface GateInput {
  /**
   * The requested Computer Use action name. Validated against the Computer Use
   * action surface (Req 12.6): any name outside it is rejected without an
   * explicit allowlist entry.
   */
  action: string
  /** Raw action arguments, forwarded to the held-input queue / approval prompt. */
  args: Record<string, unknown>
  /**
   * Native handle of the window the action targets, when applicable (input and
   * `close_app` actions). Omitted for capture / query / launch actions.
   */
  targetHwnd?: number
  /**
   * The caller-resolved residence confirmation for `targetHwnd`:
   * - `true` — positively confirmed on the Agent_Desktop (Req 7.1).
   * - `false` — positively confirmed on the User_Desktop (Req 7.2).
   * - `undefined` — residence could NOT be positively confirmed; the gate fails
   *   closed and rejects (Req 7.7).
   */
  onAgentDesktop?: boolean
}

/**
 * Decision returned by {@link AgentDesktopService.gateComputerAction}.
 *
 * - `{ allow: true; autoApprove; desktopOverride? }` — every gate passed. The
 *   caller delegates to the existing Computer Use executor, passing
 *   `autoApprove` so an `approval-required` action prompts and an `auto-approve`
 *   action proceeds (Req 5.3, 5.4). `desktopOverride` is the Agent_Desktop index
 *   a capture action must capture even when it is not the displayed
 *   Virtual_Desktop (Req 4.2).
 * - `{ allow: false; reason; outcome }` — a gate rejected the action. The caller
 *   returns the rejection WITHOUT touching the OS and never falls back to the
 *   User_Desktop (Req 4.7, 8.6).
 */
export type GateDecision =
  | { allow: true; autoApprove: boolean; desktopOverride?: number }
  | { allow: false; reason: string; outcome: GateRejectionOutcome }

/**
 * Construction options. All fields are optional and exist primarily for
 * dependency injection in tests.
 */
export interface AgentDesktopServiceOptions {
  /**
   * The VDA binding to use. Injectable so unit tests can supply a mock binding
   * without a real DLL / `koffi`. Defaults to {@link createVdaBinding}.
   */
  binding?: VdaBinding
  /**
   * Initial (already-normalized) Agent Desktop settings. Defaults to a fresh
   * copy of {@link defaultAgentDesktopSettings} (safe disabled default).
   */
  settings?: AgentDesktopSettings
  /**
   * Whether the host platform supports Agent Desktop (Windows-only). Defaults
   * to `process.platform !== 'darwin'` (expressed as not-macOS per the design).
   * Overridable for deterministic platform-gating tests (Req 9).
   */
  platformSupported?: boolean
  /**
   * Native window handles owned by ZuraAI (main window, overlay, prompt popup,
   * etc.) that must NEVER be relocated onto the Agent_Desktop (Req 2.6). The
   * service does not yet hold these handles, so this is a seam: the main wiring
   * (Task 17) supplies them at construction and/or updates them at runtime via
   * {@link AgentDesktopService.setZuraOwnedHandles}. Defaults to an empty set.
   */
  zuraOwnedHandles?: Iterable<number>
  /**
   * The approval coordinator used by the Computer Use gate for
   * `approval-required` actions (Req 5.3, 5.4, 5.8). Injectable so tests can
   * supply a controllable manager. Defaults to a fresh
   * {@link AgentDesktopApprovalManager} configured with the settings'
   * `approvalTimeoutMs` (Req 5.6).
   */
  approvalManager?: AgentDesktopApprovalManager
  /**
   * Injectable monotonic clock (epoch ms) for the kill-switch double-Escape
   * detector and the held-input queue. Defaults to {@link Date.now}. Overridable
   * for deterministic timing tests (Property 23, 14).
   */
  now?: () => number
}

/**
 * Main-process Agent Desktop orchestrator (state + capability scaffolding).
 *
 * Holds the authoritative runtime state and notifies registered listeners
 * whenever that state changes. OS-driving behavior (provisioning, placement,
 * presence transitions, the action gate) is layered on in later tasks.
 */
export class AgentDesktopService {
  private readonly binding: VdaBinding
  private readonly platformSupported: boolean
  private readonly listeners = new Set<AgentDesktopStateListener>()

  /** Timeline-step subscribers. The IPC layer (Task 17) forwards to the renderer. */
  private readonly timelineListeners = new Set<AgentDesktopTimelineStepListener>()

  /**
   * Held-input release subscribers. Notified in FIFO order when Take_Over
   * displays the Agent_Desktop and the held queue is drained (Req 3.7). The
   * caller delivers each released action subject to the approval policy.
   */
  private readonly heldInputListeners = new Set<AgentDesktopHeldInputListener>()

  /**
   * Native window handles ZuraAI owns and must never relocate onto the
   * Agent_Desktop (Req 2.6). Seam populated at construction / via
   * {@link AgentDesktopService.setZuraOwnedHandles}. Defaults to empty.
   */
  private zuraOwnedHandles: Set<number>

  /** Current (normalized) settings. Mutated by `applySettings` in a later task. */
  private settings: AgentDesktopSettings

  /** VDA load outcome; starts `unavailable` until {@link initialize} runs. */
  private vdaOutcome: VdaLoadOutcome = 'unavailable'

  /** Active provisioned session, or `null` when no agent task is running. */
  private session: AgentDesktopSession | null = null

  /**
   * Index of the most recently provisioned Agent_Desktop, retained across
   * sessions so the next {@link startSession} can reuse it when it still
   * resolves to an existing Virtual_Desktop (Req 1.1). Cleared when an ephemeral
   * teardown removes the desktop. The recorded index doubles as the stable
   * identifier: because the current {@link VdaBinding} is index-based, the
   * service stores the index as the session's `agentDesktopId` and resolves it
   * via {@link VdaBinding.desktopExists} on the next provisioning call.
   */
  private lastAgentDesktopIndex: number | null = null

  /** Whether the Agent_Desktop is the currently displayed Virtual_Desktop. */
  private agentDesktopDisplayed = false

  /** Shared Computer Use session action counter (Req 6.7). */
  private actionCount = 0

  /**
   * Whether the active session has been aborted by the kill switch (Req 6.4).
   * Mirrors the Computer Use service's `aborted` flag — a single shared
   * abort/kill state, not a parallel one. Once `true`, every further gated
   * action is rejected with outcome `aborted` until the next {@link startSession}
   * resets it.
   */
  private aborted = false

  /** Number of currently pending approvals. */
  private pendingApprovalCount = 0

  /**
   * The approval coordinator for `approval-required` gated actions (Req 5.3,
   * 5.4, 5.8). Auto-approved actions never reach it. Constructed from the
   * settings' `approvalTimeoutMs` (Req 5.6) unless injected.
   *
   * Not `readonly`: {@link applySettings} may reconstruct it with a new default
   * timeout when `approvalTimeoutMs` changes and the service is not mid-session
   * (no active session, no pending approvals), so future approval prompts honor
   * the updated timeout (Req 5.6, 10.6).
   */
  private approvalManager: AgentDesktopApprovalManager

  /**
   * Queue holding input actions that arrive while the Agent_Desktop is not the
   * displayed Virtual_Desktop (Req 3.6). Drained in FIFO order when Take_Over
   * displays the Agent_Desktop (Req 3.7); aged-out items are discarded with an
   * expiry timeline step (Req 3.8). Created fresh per session.
   */
  private heldInputQueue: HeldInputQueue

  /** Injectable monotonic clock for the kill-switch detector + held queue. */
  private readonly now: () => number

  /**
   * Timestamp (epoch ms) of the most recent Escape press considered the first
   * of a potential double-Escape, or `0` when no sequence is in progress. Used
   * by {@link registerEscape} to detect a double-Escape within
   * {@link KILL_SWITCH_WINDOW_MS} (Req 6.1, 6.3).
   */
  private lastEscapeAt = 0

  /** Last surfaced user-visible error, or `null`. */
  private lastError: string | null = null

  /**
   * Whether staging of new Agent_Windows has been stopped for the active
   * session. Set by {@link completeSession} (Req 1.4); the window-placement gate
   * (Task 12) checks this before staging/relocating a new Agent_Window. Reset on
   * each {@link startSession}.
   */
  private stagingStopped = false

  /** Whether {@link dispose} has been called. */
  private disposed = false

  constructor(options: AgentDesktopServiceOptions = {}) {
    this.binding = options.binding ?? createVdaBinding()
    this.platformSupported = options.platformSupported ?? process.platform !== 'darwin'
    // Clone the provided settings (or the shared default) so the service never
    // mutates a caller-owned or shared object.
    this.settings = cloneSettings(options.settings ?? defaultAgentDesktopSettings)
    this.zuraOwnedHandles = new Set(options.zuraOwnedHandles ?? [])
    this.now = options.now ?? Date.now
    this.approvalManager =
      options.approvalManager ??
      new AgentDesktopApprovalManager({ defaultTimeoutMs: this.settings.approvalTimeoutMs })
    this.heldInputQueue = new HeldInputQueue({ now: this.now })
  }

  /**
   * Load + probe the VDA binding and record the resulting availability, then
   * return the current state (Req 8.1, 8.4).
   *
   * Never throws. On an unsupported platform the VDA binding is not loaded and
   * the outcome stays `unavailable`. On a failed load the outcome is
   * `unavailable` and {@link AgentDesktopState.lastError} carries the binding's
   * user-visible message (which names VirtualDesktopAccessor). Only the Agent
   * Desktop capability is affected; all other capabilities keep working.
   */
  async initialize(): Promise<AgentDesktopState> {
    if (this.disposed) {
      return this.getState()
    }

    if (!this.platformSupported) {
      // Windows-only: do not touch the native binding on unsupported platforms.
      this.vdaOutcome = 'unavailable'
      this.lastError = null
      this.notifyStateChange()
      return this.getState()
    }

    try {
      const outcome = await this.binding.load(VDA_LOAD_TIMEOUT_MS)
      this.vdaOutcome = outcome
      this.lastError =
        outcome === 'unavailable'
          ? readBindingLoadError(this.binding) ??
            'The VirtualDesktopAccessor virtual-desktop integration is unavailable.'
          : null
    } catch (error) {
      // `load()` is contracted not to throw, but stay defensive: a thrown error
      // must still degrade gracefully rather than crash the app (Req 8.4).
      this.vdaOutcome = 'unavailable'
      this.lastError =
        readBindingLoadError(this.binding) ??
        (error instanceof Error
          ? `The VirtualDesktopAccessor virtual-desktop integration could not be loaded (${error.message}).`
          : 'The VirtualDesktopAccessor virtual-desktop integration could not be loaded.')
    }

    this.notifyStateChange()
    return this.getState()
  }

  /**
   * Apply mirrored renderer Agent Desktop preferences and return the resulting
   * state (Req 10.6, 10.7, 12.1, 12.2, 12.3).
   *
   * `input` is **untrusted** — it is mirrored from the renderer through the
   * narrow `agent-desktop:apply-settings` IPC channel — so it is treated as an
   * arbitrary value and never trusted to be well-formed.
   *
   * **Retain-on-failure (Req 10.7).** `normalizeAgentDesktopSettings` never
   * throws and always returns a valid object (falling back to the safe disabled
   * default for garbage), so a normalization failure cannot be observed directly.
   * "Failure to apply" is therefore defined as a payload that is not a usable
   * settings record — `null`, `undefined`, or any non-plain-object. In that case
   * the last successfully applied settings are **retained** (`this.settings` is
   * left untouched), an error is surfaced in {@link AgentDesktopState.lastError},
   * and the unchanged state is returned. A usable record is normalized and
   * applied, replacing `this.settings` with the normalized clone and clearing
   * `lastError`.
   *
   * **Disclosure gating (Req 12.1, 12.2).** Enabling the skill requires the
   * not-a-sandbox disclosure acknowledgement. Acknowledgement is **sticky**: once
   * the service has recorded `disclosureAcknowledged: true`, a later mirrored
   * payload that omits or unsets it does not revoke it. The applied settings are
   * allowed to be `enabled: true` only when the disclosure is acknowledged
   * (either by the incoming payload or by the already-recorded service state); if
   * neither acknowledges it, `enabled` is forced to `false` — the skill can never
   * be enabled without acknowledgement.
   *
   * **Approval timeout (Req 5.6, 10.6).** When the normalized
   * `approvalTimeoutMs` changes and the service is not mid-session (no active
   * session and no pending approvals), the approval manager is reconstructed so
   * subsequently created approval prompts honor the new timeout. While a session
   * or pending approval is in flight, the change is recorded into `this.settings`
   * and takes effect on the next reconstruction (e.g. the next `startSession`),
   * so an in-flight approval is never disrupted.
   *
   * Always notifies state-change subscribers and never throws.
   */
  applySettings(input: unknown): AgentDesktopState {
    if (this.disposed) {
      return this.getState()
    }

    // Retain-on-failure (Req 10.7): an unusable payload (null / undefined /
    // non-plain-object) must not overwrite the last successfully applied
    // settings with the disabled default. Keep `this.settings` intact and
    // surface an error instead.
    if (!isPlainObject(input)) {
      this.lastError =
        'Agent Desktop preferences could not be applied; keeping the previous settings.'
      this.notifyStateChange()
      return this.getState()
    }

    // Usable record: validate + normalize into a complete, well-formed shape.
    const normalized = normalizeAgentDesktopSettings(input)

    // Disclosure gating (Req 12.1, 12.2). Acknowledgement is sticky: a prior
    // acknowledgement is preserved even if the mirrored payload omits/unsets it.
    const disclosureAcknowledged =
      this.settings.disclosureAcknowledged || normalized.disclosureAcknowledged

    // Enabling requires acknowledgement: force `enabled: false` when the
    // disclosure has not been acknowledged in either the incoming payload or the
    // recorded service state.
    const enabled = normalized.enabled && disclosureAcknowledged

    const applied: AgentDesktopSettings = {
      ...normalized,
      enabled,
      disclosureAcknowledged,
    }

    // Reconstruct the approval manager so a changed timeout governs FUTURE
    // approval prompts (Req 5.6). Only when not mid-session — an active session
    // or pending approval must not have its in-flight coordinator swapped out.
    const timeoutChanged = applied.approvalTimeoutMs !== this.settings.approvalTimeoutMs
    const midSession = this.session !== null || this.pendingApprovalCount > 0

    this.settings = cloneSettings(applied)
    this.lastError = null

    if (timeoutChanged && !midSession) {
      this.approvalManager.dispose()
      this.approvalManager = new AgentDesktopApprovalManager({
        defaultTimeoutMs: this.settings.approvalTimeoutMs,
      })
      this.pendingApprovalCount = 0
    }

    this.notifyStateChange()
    return this.getState()
  }

  /**
   * Record that the user acknowledged the not-a-sandbox disclosure (Req 12.1,
   * 12.2, 12.3).
   *
   * Sets `disclosureAcknowledged: true`, which is the precondition that gates
   * enabling the skill in {@link applySettings}. It does **not** by itself enable
   * the skill — it only unlocks the ability to enable it; a subsequent
   * `applySettings` with `enabled: true` is what actually turns the skill on.
   * Notifies state-change subscribers. Idempotent and never throws.
   */
  acknowledgeDisclosure(): void {
    if (this.disposed) {
      return
    }
    if (this.settings.disclosureAcknowledged) {
      // Already acknowledged: nothing to change, no spurious broadcast.
      return
    }
    this.settings = { ...this.settings, disclosureAcknowledged: true }
    this.notifyStateChange()
  }

  /**
   *
   * Behavior:
   * - **Defensive gating (never throws, never provisions on failure):** returns
   *   a `{ provisioned: false }` result with an error in
   *   {@link AgentDesktopState.lastError} when the platform is unsupported, the
   *   VDA binding is unavailable, or the skill is disabled (Req 8.5, 8.6, 10.10).
   *   The User_Desktop stays active in every not-provisioned path.
   * - **Record the User_Desktop first (Req 1.3):** the currently displayed
   *   desktop index is read *before* any create/switch so the user can be
   *   returned to it later (Req 1.10, 3.9, 6.5).
   * - **Reuse-or-create (Req 1.1):** if a previously provisioned Agent_Desktop
   *   index still resolves to an existing Virtual_Desktop it is reused
   *   (`createdByZura = false`); otherwise a new Virtual_Desktop is created
   *   (`createdByZura = true`).
   * - **2s bound (Req 1.8):** if ensuring the desktop throws or does not complete
   *   within {@link PROVISION_TIMEOUT_MS}, provisioning is aborted, the
   *   User_Desktop stays active (no switch is performed here — staging happens in
   *   `background`), and a clear error is surfaced.
   *
   * On success the session is stored with `presence: 'background'` (Req 3.1),
   * staging is re-enabled, the capability becomes `active`, and a state change is
   * broadcast.
   *
   * > **Identity vs index.** The design prefers a GUID-style id resolved to the
   * > current index per call. The current {@link VdaBinding} is index-based, so
   * > the service records the resolved index as both `agentDesktopIndex` and the
   * > stable `agentDesktopId` (stringified) and resolves it via `desktopExists`
   * > on the next provisioning call. When the binding later exposes GUIDs this is
   * > the single place that changes.
   */
  async startSession(agentRunId: string): Promise<SessionStartResult> {
    if (this.disposed) {
      return this.failedStart('Agent Desktop has been shut down.')
    }

    // Defensive gating: never provision when unsupported/unavailable/disabled.
    if (!this.platformSupported) {
      return this.failedStart('Agent Desktop is unavailable on this platform.')
    }
    if (this.vdaOutcome === 'unavailable' || !this.binding.isAvailable()) {
      return this.failedStart(
        this.lastError ??
          'The VirtualDesktopAccessor virtual-desktop integration is unavailable.'
      )
    }
    if (!this.settings.enabled) {
      return this.failedStart('The Agent Desktop skill is disabled.')
    }

    // Record the User_Desktop BEFORE any create/switch so we can return to it
    // later (Req 1.3, 1.10, 3.9, 6.5).
    let userDesktopIndex: number
    try {
      userDesktopIndex = this.binding.getCurrentDesktopIndex()
    } catch (error) {
      return this.failedStart(this.describeVdaFailure(error, 'read the current desktop'))
    }

    // Reuse-or-create within the provisioning time bound (Req 1.1, 1.8).
    let provisioning: { index: number; createdByZura: boolean }
    try {
      provisioning = await withProvisionTimeout(
        () => this.ensureAgentDesktop(),
        PROVISION_TIMEOUT_MS
      )
    } catch (error) {
      // Abort: keep the User_Desktop active (no switch performed) and surface a
      // clear, integration-naming error (Req 1.8).
      return this.failedStart(this.describeVdaFailure(error, 'provision the Agent Desktop'))
    }

    const { index: agentDesktopIndex, createdByZura } = provisioning

    // Store the session in background presence (Req 3.1). Staging is allowed.
    this.session = {
      agentRunId,
      agentDesktopId: String(agentDesktopIndex),
      agentDesktopIndex,
      userDesktopId: String(userDesktopIndex),
      createdByZura,
      presence: 'background',
      windows: new Map(),
      startedAt: Date.now(),
    }
    this.lastAgentDesktopIndex = agentDesktopIndex
    this.stagingStopped = false
    this.lastError = null

    // Reset the shared action cap + abort/kill state and per-session input
    // holding for the new session (Req 6.4, 6.7). A new task starts at zero
    // counted actions, not aborted, with no held input and no in-flight Escape
    // sequence.
    this.actionCount = 0
    this.aborted = false
    this.lastEscapeAt = 0
    this.heldInputQueue.clear()
    this.heldInputQueue = new HeldInputQueue({ now: this.now })
    this.approvalManager.dispose()
    this.pendingApprovalCount = 0

    this.notifyStateChange()
    return { provisioned: true, state: this.getState() }
  }

  /**
   * Ensure Agent Desktop is ready before a `computer_*` tool drives any work.
   *
   * The regular action gate intentionally assumes a valid active session. This
   * preflight owns the repair step: it initializes/validates the VDA integration,
   * provisions when no session is active, verifies that an active session's
   * recorded Agent_Desktop still exists, and recreates the session when that
   * recorded desktop is stale. It never permits a fallback to the User_Desktop.
   */
  async ensureReadyForTool(agentRunId: string): Promise<ToolReadinessResult> {
    if (this.disposed) {
      return this.failedReadiness('Agent Desktop has been shut down.')
    }

    await this.initialize()

    const availability = this.checkAvailability()
    if (availability) {
      return this.failedReadiness(availability)
    }

    const session = this.session
    if (!session) {
      return this.startSessionForReadiness(agentRunId)
    }

    let desktopExists = false
    try {
      desktopExists = await withProvisionTimeout(
        () => this.binding.desktopExists(session.agentDesktopIndex),
        PROVISION_TIMEOUT_MS
      )
    } catch (error) {
      return this.failedReadiness(
        this.describeVdaFailure(error, 'verify the Agent Desktop')
      )
    }

    if (desktopExists) {
      this.lastError = null
      this.notifyStateChange()
      return { ready: true, state: this.getState() }
    }

    this.clearStaleSessionForReprovision()
    return this.startSessionForReadiness(agentRunId)
  }

  /**
   * Complete an agent task: stop staging, force `background` presence, and run
   * ephemeral teardown (Req 1.4, 1.5, 1.6, 1.9).
   *
   * - Stops staging new Agent_Windows for the session (Req 1.4) and sets
   *   `presence: 'background'` (Req 1.9).
   * - **Ephemeral teardown (Req 1.5/1.6):** only when `persistence === 'ephemeral'`
   *   AND the Agent_Desktop was created by ZuraAI. The desktop is removed only
   *   when it contains no windows ZuraAI did not place (Req 1.5). If any
   *   non-agent window resides on the Agent_Desktop, the desktop is RETAINED and
   *   a notice is surfaced via {@link AgentDesktopState.lastError} (Req 1.6).
   * - `persistence === 'persist'`, a reused desktop, or an unmatched
   *   `agentRunId` all retain the desktop.
   *
   * The displayed desktop is intentionally NOT switched here — returning the user
   * to the User_Desktop on Take_Over end / kill switch / quit is handled by other
   * paths (Req 1.10, 3.9, 6.5). Every binding call is wrapped so a failure
   * degrades gracefully (retain + surface error) instead of crashing (Req 8.6:
   * never fall back to the User_Desktop for agent actions).
   *
   * Always clears the session so the capability returns to `available`, and
   * broadcasts a state change.
   */
  async completeSession(agentRunId: string): Promise<void> {
    if (this.disposed) {
      return
    }

    const session = this.session
    // No active session, or completion for a different run: nothing to tear down.
    if (!session || session.agentRunId !== agentRunId) {
      return
    }

    // Stop staging new Agent_Windows (Req 1.4) and force background (Req 1.9).
    this.stagingStopped = true
    session.presence = 'background'

    const teardown = this.teardownEphemeralDesktop(session)
    if (teardown === 'removed') {
      // The Zura-created desktop is gone; do not reuse a stale index next time.
      this.lastAgentDesktopIndex = null
    }

    // Clear the session so capability returns to 'available'.
    this.session = null

    this.notifyStateChange()
  }

  /**
   * Stage / relocate a newly observed Agent_Window onto the recorded
   * Agent_Desktop within {@link WINDOW_PLACEMENT_TIMEOUT_MS} (Req 2.1, 2.2).
   *
   * Behavior:
   * - **Guards (ignore, never stage):** no active session, the service is
   *   disposed, or staging has been stopped for the session (Req 1.4). A
   *   ZuraAI-owned window is also excluded from relocation (Req 2.6) — it is
   *   never moved onto the Agent_Desktop.
   * - **Register the window (Req 2.3):** the window is recorded in
   *   `session.windows` as an {@link AgentWindowRecord} tagged with the session's
   *   `agentRunId`, with best-effort `title`/`pid` sourced from
   *   {@link VdaBinding.enumerateWindows} when available. A window observed for
   *   the first time starts at residence `user-desktop` (fail-closed: input is
   *   withheld until placement is confirmed, Req 2.7).
   * - **Relocate + verify (Req 2.1, 2.2):** {@link VdaBinding.moveWindowToDesktop}
   *   is always issued toward the recorded `agentDesktopIndex`, then confirmed via
   *   {@link VdaBinding.isWindowOnDesktop}. Up to {@link MAX_PLACEMENT_ATTEMPTS}
   *   attempts are made within {@link WINDOW_PLACEMENT_TIMEOUT_MS}. On confirmed
   *   placement the record's residence becomes `agent-desktop` and a
   *   `Stage window` / `Relocate window` timeline step (`status: 'completed'`)
   *   identifying the window + time is emitted (Req 11.2/11.3). On failure after
   *   the attempt threshold a placement-failure step (`status: 'failed'`)
   *   identifying the affected window is emitted (Req 2.5) and the residence is
   *   left `user-desktop` so input stays withheld (Req 2.7).
   *
   * Never throws: every binding call is wrapped so a native failure degrades to a
   * placement failure rather than crashing the app (Req 8.3).
   *
   * @param hwnd Native window handle of the Agent_Window that became visible.
   */
  async notifyWindowOpened(hwnd: number): Promise<void> {
    if (this.disposed) {
      return
    }

    const session = this.session
    // No active session, or staging stopped after completion (Req 1.4): ignore.
    if (!session || this.stagingStopped) {
      return
    }

    // Never relocate a ZuraAI-owned window onto the Agent_Desktop (Req 2.6).
    if (this.zuraOwnedHandles.has(hwnd)) {
      return
    }

    // Best-effort metadata + initial residence from the live enumeration. The
    // observed residence selects the step semantics: a window positively
    // observed on the User_Desktop is a relocation (Req 2.2); a launched window
    // that is not positively on the User_Desktop (already on the Agent_Desktop,
    // or residence unknown) is a staging placement (Req 2.1). Either way a move
    // toward the Agent_Desktop is always issued (Property 7).
    const observed = this.observeWindow(hwnd, session.agentDesktopIndex)
    const isRelocation = observed.onAgentDesktop === false

    // Register (or replace) the window record for this run (Req 2.3). A freshly
    // observed window starts at user-desktop residence (fail-closed, Req 2.7):
    // input is withheld until placement onto the Agent_Desktop is confirmed.
    const record: AgentWindowRecord = {
      hwnd,
      title: observed.title ?? '',
      pid: observed.pid ?? 0,
      agentRunId: session.agentRunId,
      residence: 'user-desktop',
      placementAttempts: 0,
      openedAt: Date.now(),
    }
    session.windows.set(hwnd, record)

    // Always issue a move toward the recorded Agent_Desktop and confirm it, with
    // retry, bounded by WINDOW_PLACEMENT_TIMEOUT_MS (Req 2.1, 2.2, Property 7).
    const placed = await withProvisionTimeout(
      () => this.relocateWithRetry(hwnd, session.agentDesktopIndex, record),
      WINDOW_PLACEMENT_TIMEOUT_MS
    ).catch(() => false)

    if (placed) {
      record.residence = 'agent-desktop'
      this.emitTimelineStep(
        isRelocation
          ? {
              kind: 'relocate-window',
              title: 'Relocate window',
              agentRunId: session.agentRunId,
              hwnd,
              windowTitle: record.title || undefined,
              status: 'completed',
              occurredAt: Date.now(),
            }
          : {
              kind: 'stage-window',
              title: 'Stage window',
              agentRunId: session.agentRunId,
              hwnd,
              windowTitle: record.title || undefined,
              status: 'completed',
              occurredAt: Date.now(),
            }
      )
      return
    }

    // Placement failed after MAX_PLACEMENT_ATTEMPTS: record a failure step
    // identifying the window (Req 2.5) and leave residence user-desktop so input
    // is withheld until the window is confirmed on the Agent_Desktop (Req 2.7).
    record.residence = 'user-desktop'
    this.emitTimelineStep({
      kind: 'placement-failure',
      title: 'Place window',
      agentRunId: session.agentRunId,
      hwnd,
      windowTitle: record.title || undefined,
      status: 'failed',
      occurredAt: Date.now(),
    })
  }

  /**
   * Activate Take_Over: switch the displayed Virtual_Desktop to the Agent_Desktop
   * within {@link DISPLAY_SWITCH_TIMEOUT_MS} and only then set presence to
   * `take-over` (Req 3.3, 3.4).
   *
   * - Only meaningful with an active session; otherwise returns `{ ok: false }`
   *   without touching the OS.
   * - On a confirmed switch (the current displayed index equals the recorded
   *   `agentDesktopIndex`): set `presence: 'take-over'`, `agentDesktopDisplayed:
   *   true`, broadcast, and return `{ ok: true, state }`.
   * - On switch failure/timeout: leave `presence: 'background'`, keep
   *   `agentDesktopDisplayed: false`, deliver no input, surface the error in
   *   {@link AgentDesktopState.lastError}, and return `{ ok: false, error, state }`
   *   (Req 3.4).
   *
   * Never throws: a binding failure degrades to a `{ ok: false }` result.
   */
  async activateTakeOver(): Promise<PresenceResult> {
    if (this.disposed) {
      return this.failedPresence('Agent Desktop has been shut down.')
    }

    const session = this.session
    if (!session) {
      return this.failedPresence('Take_Over is unavailable because no agent session is active.')
    }

    // Already displayed + in take-over: idempotent success.
    if (session.presence === 'take-over' && this.agentDesktopDisplayed) {
      return { ok: true, state: this.getState() }
    }

    let switched = false
    try {
      switched = await withProvisionTimeout(
        () => this.switchToDesktop(session.agentDesktopIndex),
        DISPLAY_SWITCH_TIMEOUT_MS
      )
    } catch (error) {
      switched = false
      this.lastError = this.describeVdaFailure(error, 'display the Agent Desktop')
    }

    if (!switched) {
      // Stay background, deliver no input, surface an error (Req 3.4).
      session.presence = 'background'
      this.agentDesktopDisplayed = false
      const error =
        this.lastError ?? 'Take_Over could not display the Agent Desktop.'
      return this.failedPresence(error)
    }

    // Display switch confirmed: enter take-over (Req 3.3).
    session.presence = 'take-over'
    this.agentDesktopDisplayed = true
    this.lastError = null
    // The Agent_Desktop is now displayed: release held input in FIFO order
    // (Req 3.7) and discard any that aged out while held (Req 3.8). Released
    // actions are surfaced to held-input listeners for the caller to deliver
    // subject to the approval policy; expired ones emit an expiry timeline step.
    this.drainHeldInput()
    this.notifyStateChange()
    return { ok: true, state: this.getState() }
  }

  /**
   * End Take_Over: return the displayed Virtual_Desktop to the recorded
   * User_Desktop and set presence back to `background` (Req 3.9).
   *
   * The session's recorded `userDesktopId` is the desktop the user was on at
   * provisioning (Req 1.3). Presence is forced to `background` and
   * `agentDesktopDisplayed` to `false` even if the return switch fails — the
   * service never leaves input enabled on a failed return (Req 8.6); a failure is
   * surfaced via {@link AgentDesktopState.lastError} but presence is still
   * dropped to `background`.
   *
   * Returns `{ ok: false }` when there is no active session.
   */
  async endTakeOver(): Promise<PresenceResult> {
    if (this.disposed) {
      return this.failedPresence('Agent Desktop has been shut down.')
    }

    const session = this.session
    if (!session) {
      return this.failedPresence('There is no active agent session to end Take_Over for.')
    }

    // Drop presence to background and stop delivering input regardless of the
    // outcome of the return switch (Req 3.9, 8.6).
    session.presence = 'background'
    this.agentDesktopDisplayed = false

    const userDesktopIndex = Number(session.userDesktopId)
    let returned = false
    try {
      if (Number.isInteger(userDesktopIndex) && userDesktopIndex >= 0) {
        returned = await withProvisionTimeout(
          () => this.switchToDesktop(userDesktopIndex),
          DISPLAY_SWITCH_TIMEOUT_MS
        )
      }
    } catch (error) {
      returned = false
      this.lastError = this.describeVdaFailure(error, 'return to the User Desktop')
    }

    if (!returned) {
      const error =
        this.lastError ?? 'Ending Take_Over could not return to the User Desktop.'
      return this.failedPresence(error)
    }

    this.lastError = null
    this.notifyStateChange()
    return { ok: true, state: this.getState() }
  }

  /**
   * Replace the set of ZuraAI-owned window handles excluded from relocation
   * (Req 2.6). The seam the main wiring (Task 17) uses to keep the service's view
   * of ZuraAI windows current as windows open/close.
   */
  setZuraOwnedHandles(handles: Iterable<number>): void {
    this.zuraOwnedHandles = new Set(handles)
  }

  // ===========================================================================
  // Computer Use action gate + kill switch (Task 13)
  // ===========================================================================

  /**
   * The single gate the Computer Use tool path (Task 16.1) calls for every
   * `computer_*` action before delegating to the existing executor. Concentrates
   * all of Agent Desktop's policy in one place so the OS-driving code in
   * `electron/tools/computer-use/` stays untouched (design "Interaction with the
   * Existing Computer Use Path").
   *
   * Returns `{ allow: true, autoApprove, desktopOverride? }` when every gate
   * passes — the caller then delegates to the existing executor — or
   * `{ allow: false, reason, outcome }` when a gate rejects, in which case the
   * caller returns the rejection WITHOUT driving the OS and NEVER falls back to
   * the User_Desktop (Req 4.7, 8.6).
   *
   * Gate order (fail-closed; the first failing gate wins):
   * 1. **Availability (Req 8.5, 10.9, 10.10, 12.1, 12.2):** reject when the
   *    platform is unsupported, the VDA binding is unavailable, the skill is
   *    disabled, or the not-a-sandbox disclosure has not been acknowledged. No
   *    OS driving.
   * 2. **Out-of-surface (Req 12.6):** reject any action name outside the existing
   *    Computer Use action surface (no explicit allowlist entry).
   * 3. **Abort/kill (Req 6.4):** once the session is aborted, reject every
   *    further action with outcome `aborted`.
   * 4. **No active session:** reject — Agent Desktop never drives the OS without
   *    a provisioned session.
   * 5. **Action cap (Req 6.7, 6.8, 6.9):** when the counted-action total has
   *    reached {@link MAX_ACTIONS_PER_SESSION}, reject with `limit-reached`;
   *    otherwise count this Computer Use action toward the cap.
   * 6. **Presence + held input (Req 3.2, 3.5, 3.6):** for input actions, when
   *    presence holds the action (background, or take-over while the
   *    Agent_Desktop is not displayed), enqueue it and reject with outcome
   *    `held`.
   * 7. **Targeting (Req 7):** for window-targeted actions, reject when residence
   *    is not positively confirmed on the Agent_Desktop, the window is
   *    ZuraAI-owned, or (`close_app`) it is not a current-run Agent_Window.
   * 8. **Approval policy (Req 5.1–5.5):** classify the action; `auto-approve`
   *    allows with `autoApprove: true`, `approval-required` allows with
   *    `autoApprove: false` so the caller / renderer prompt resolves it.
   *
   * Capture redirect (Req 4.2): capture actions (`screenshot`) carry
   * `desktopOverride = session.agentDesktopIndex` so the caller captures the
   * Agent_Desktop even when it is not the displayed Virtual_Desktop.
   *
   * Full timeline recording (Req 4.5): every call emits exactly one timeline
   * step — `action-allowed`, `action-rejected`, or `action-held` — capturing the
   * request + decision. The execution *result* of an allowed action is recorded
   * by the caller onto the same logical step.
   *
   * Never throws: a binding failure during targeting/capture degrades to a
   * fail-closed rejection rather than crashing the app (Req 8.3, 8.6).
   */
  async gateComputerAction(input: GateInput): Promise<GateDecision> {
    // 1. Availability (Req 8.5, 10.9, 10.10, 12.1, 12.2). No OS driving.
    const availability = this.checkAvailability()
    if (availability) {
      return this.rejectAction(input.action, availability, 'rejected', input.targetHwnd)
    }

    // 2. Out-of-surface (Req 12.6). Reject any name outside the CU surface.
    if (!isAgentActionType(input.action)) {
      return this.rejectAction(
        input.action,
        `"${input.action}" is not part of the Computer Use action surface.`,
        'rejected',
        input.targetHwnd
      )
    }
    const action = input.action

    // 3. Abort/kill state (Req 6.4): once aborted, dispatch nothing further.
    if (this.aborted) {
      return this.rejectAction(
        action,
        'The agent session was aborted by the kill switch.',
        'aborted',
        input.targetHwnd
      )
    }

    // 4. A provisioned session is required to drive any action.
    const session = this.session
    if (!session) {
      return this.rejectAction(action, 'No agent session is active.', 'rejected', input.targetHwnd)
    }

    // 5. Action cap (Req 6.7, 6.8, 6.9). Count ONLY Computer Use actions. When
    //    the count has already reached the cap, reject before incrementing so
    //    the counter never runs past MAX_ACTIONS_PER_SESSION.
    if (this.actionCount >= MAX_ACTIONS_PER_SESSION) {
      return this.rejectAction(
        action,
        `Action limit reached (${MAX_ACTIONS_PER_SESSION}). Start a new task.`,
        'limit-reached',
        input.targetHwnd
      )
    }
    // This action passed the availability/abort/session/cap gates and counts as a
    // Computer Use action attempt toward the cap (Req 6.7, Property 25).
    this.actionCount += 1

    // 6. Presence + held input (Req 3.2, 3.5, 3.6). Only input actions are held.
    if (isInputAction(action)) {
      const decision = permitsAction(session.presence, this.agentDesktopDisplayed, action)
      if (!decision.permit) {
        // Park the input until the Agent_Desktop is displayed (Req 3.6). It is
        // NOT delivered now; the held queue releases it on the display switch
        // (Req 3.7) or expires it after the TTL (Req 3.8).
        this.heldInputQueue.enqueue({ action, args: input.args })
        const reason =
          decision.reason === 'background-input'
            ? 'Input is held while the agent is staging in the background; switch to the Agent Desktop (Take_Over) to deliver it.'
            : 'Input is held until the Agent Desktop is the displayed desktop; use Take_Over to deliver it.'
        return this.holdAction(action, reason, input.targetHwnd)
      }
    }

    // 7. Targeting (Req 7). Window-targeted actions must positively confirm
    //    Agent_Desktop residence; close_app must target a current-run Agent_Window.
    const targetingReason = this.checkTargeting(action, input, session)
    if (targetingReason) {
      return this.rejectAction(action, targetingReason, 'rejected', input.targetHwnd)
    }

    // 8. Approval policy (Req 5.1–5.5). auto-approve proceeds without a prompt;
    //    approval-required allows with autoApprove:false so the caller/renderer
    //    prompt resolves it (see requestActionApproval for the routing seam).
    const classification = classifyAction(action, {
      classifications: this.settings.approvalPolicy,
    })
    const autoApprove = classification === 'auto-approve'

    // Capture redirect (Req 4.2): capture actions always target the Agent_Desktop
    // index even when it is not the displayed Virtual_Desktop.
    const desktopOverride = action === 'screenshot' ? session.agentDesktopIndex : undefined

    this.emitTimelineStep({
      kind: 'action-allowed',
      title: 'Computer action',
      agentRunId: session.agentRunId,
      hwnd: input.targetHwnd,
      action,
      outcome: 'allowed',
      reason: autoApprove ? 'auto-approved' : 'approval-required',
      status: 'completed',
      occurredAt: this.now(),
    })

    return desktopOverride !== undefined
      ? { allow: true, autoApprove, desktopOverride }
      : { allow: true, autoApprove }
  }

  /**
   * Request approval for an `approval-required` gated action through the
   * {@link AgentDesktopApprovalManager} (Req 5.3, 5.4, 5.8). The renderer
   * resolves it through the narrow `agent-desktop:resolve-approval` IPC channel
   * (wired in Task 17). A non-approved outcome (`rejected` / `timed_out` /
   * `cancelled`) is recorded as a rejection timeline step and the action is
   * skipped (Req 5.7, Property 22).
   *
   * This is the approval-routing seam: {@link gateComputerAction} returns the
   * `autoApprove` flag so the caller knows whether a prompt is needed; the caller
   * (Task 16.1) invokes this to actually block on the prompt and record the
   * non-approved outcome before deciding whether to execute. Returns `true` when
   * the action may proceed, `false` when it must be skipped.
   */
  async requestActionApproval(
    action: AgentActionType,
    args: Record<string, unknown>,
    options: { screenshot?: string; targetHwnd?: number } = {}
  ): Promise<boolean> {
    if (this.aborted || !this.session) {
      return false
    }

    this.pendingApprovalCount += 1
    this.notifyStateChange()

    let decision: AgentDesktopApprovalDecision
    try {
      decision = await this.approvalManager.requestApproval({
        action,
        args: { ...args },
        screenshot: options.screenshot,
      })
    } finally {
      this.pendingApprovalCount = Math.max(0, this.pendingApprovalCount - 1)
      this.notifyStateChange()
    }

    if (decision.approved) {
      return true
    }

    // Non-approved (rejected / timed_out / cancelled): skip + record (Req 5.7).
    const reason =
      decision.outcome === 'timed_out'
        ? 'Approval timed out.'
        : decision.outcome === 'cancelled'
          ? 'Approval was cancelled.'
          : 'Action rejected by the user.'
    const session = this.session
    if (session) {
      this.emitTimelineStep({
        kind: 'action-rejected',
        title: 'Computer action',
        agentRunId: session.agentRunId,
        hwnd: options.targetHwnd,
        action,
        outcome: 'rejected',
        reason,
        status: 'rejected',
        occurredAt: this.now(),
      })
    }
    return false
  }

  /**
   * Abort the active Agent_Run via the double-Escape kill switch (Req 6.2–6.6).
   *
   * - Marks the session aborted so {@link gateComputerAction} dispatches nothing
   *   further (Req 6.4) and resets the shared action counter (mirroring the
   *   Computer Use service's `abortSession`).
   * - Returns the displayed Virtual_Desktop to the recorded User_Desktop
   *   (Req 6.5) — best-effort; a binding failure is swallowed and surfaced, never
   *   crashing, and never leaving input enabled on the Agent_Desktop (Req 8.6).
   * - Cancels all pending approvals (Req 6.6) by disposing the approval manager,
   *   which finishes each pending request with a `cancelled` outcome.
   * - Discards all held input and drops presence to `background`.
   * - Emits a `kill-switch-abort` timeline step and broadcasts the killed state
   *   via {@link notifyStateChange} (the `agent-desktop:killed` broadcast itself
   *   is wired in Task 17).
   *
   * Idempotent and safe to call without an active session.
   */
  abortForKillSwitch(): void {
    if (this.disposed) {
      return
    }

    const session = this.session

    // Shared abort/kill state (Req 6.4) + counter reset (mirrors Computer Use).
    this.aborted = true
    this.actionCount = 0
    this.lastEscapeAt = 0

    // Cancel pending approvals (Req 6.6): dispose finishes each with 'cancelled'.
    this.approvalManager.dispose()
    this.pendingApprovalCount = 0

    // Discard any held input — nothing is delivered after an abort.
    this.heldInputQueue.clear()

    if (session) {
      // Stop driving input: drop to background and undisplay the Agent_Desktop.
      session.presence = 'background'
      this.agentDesktopDisplayed = false

      // Return the displayed Virtual_Desktop to the recorded User_Desktop
      // (Req 6.5). Best-effort: never throw, never fall back to anything else.
      const userDesktopIndex = Number(session.userDesktopId)
      try {
        if (Number.isInteger(userDesktopIndex) && userDesktopIndex >= 0) {
          this.binding.goToDesktop(userDesktopIndex)
        }
      } catch {
        // A native failure during return must not crash the app (Req 8.3, 8.6).
      }

      this.emitTimelineStep({
        kind: 'kill-switch-abort',
        title: 'Kill switch',
        agentRunId: session.agentRunId,
        reason: 'The agent run was aborted by the double-Escape kill switch.',
        status: 'aborted',
        occurredAt: this.now(),
      })
    }

    this.lastError = 'The agent run was aborted by the kill switch.'
    this.notifyStateChange()
  }

  /**
   * Pure double-Escape detector for the kill switch (Req 6.1, 6.2, 6.3).
   *
   * Records an Escape press at time `now` and reports whether it completed a
   * double-Escape within {@link KILL_SWITCH_WINDOW_MS} of the previous press.
   * When it does, {@link abortForKillSwitch} is invoked and the sequence resets;
   * otherwise `now` becomes the first press of a new sequence (a later second
   * press more than the window after the first is treated as a fresh first
   * press, Req 6.3).
   *
   * The interval comparison is strict (`< KILL_SWITCH_WINDOW_MS`) to match
   * Property 23: the kill switch fires iff the gap is strictly less than the
   * window. Timing is driven by the injected clock so the detector is
   * deterministically testable; the 500ms global-shortcut wiring that calls this
   * lives where the Escape shortcut is registered (Task 17).
   *
   * @param now Timestamp of the Escape press (epoch ms). Defaults to the injected clock.
   * @returns `true` when this press triggered an abort, else `false`.
   */
  registerEscape(now: number = this.now()): boolean {
    const previous = this.lastEscapeAt
    if (previous !== 0 && now - previous < KILL_SWITCH_WINDOW_MS) {
      // Double-Escape within the window → abort and reset the sequence (Req 6.2).
      this.lastEscapeAt = 0
      this.abortForKillSwitch()
      return true
    }
    // First press, or a too-late second press that starts a new sequence (Req 6.3).
    this.lastEscapeAt = now
    return false
  }

  /**
   * Subscribe to held-input releases. When Take_Over displays the Agent_Desktop,
   * the held queue is drained and each still-live action is delivered to these
   * listeners in FIFO order (Req 3.7) for the caller to execute subject to the
   * approval policy.
   *
   * @returns An unsubscribe function. Calling it more than once is a no-op.
   */
  onHeldInputReleased(cb: AgentDesktopHeldInputListener): Unsubscribe {
    this.heldInputListeners.add(cb)
    return () => {
      this.heldInputListeners.delete(cb)
    }
  }

  /**
   * Expose the approval manager so the IPC layer (Task 17) can route
   * `agent-desktop:resolve-approval` and `agent-desktop:pending-approval`
   * through the same coordinator the gate uses.
   */
  getApprovalManager(): AgentDesktopApprovalManager {
    return this.approvalManager
  }

  /**
   * Number of counted Computer Use actions consumed in the current session
   * (Req 6.7). Exposed for the IPC/state layer and tests.
   */
  getActionCount(): number {
    return this.actionCount
  }

  /** Whether the current session has been aborted by the kill switch (Req 6.4). */
  isAborted(): boolean {
    return this.aborted
  }

  /**
   * Availability gate shared by the action gate (Req 8.5, 10.9, 10.10, 12.1,
   * 12.2). Returns a user-visible rejection reason when Agent Desktop is not
   * usable, or `null` when it is available. No OS driving.
   */
  private checkAvailability(): string | null {
    if (!this.platformSupported) {
      return 'Agent Desktop is unavailable on this platform.'
    }
    if (this.vdaOutcome === 'unavailable' || !this.binding.isAvailable()) {
      return (
        this.lastError ??
        'The VirtualDesktopAccessor virtual-desktop integration is unavailable.'
      )
    }
    if (!this.settings.enabled) {
      return 'The Agent Desktop skill is disabled.'
    }
    if (!this.settings.disclosureAcknowledged) {
      return 'The Agent Desktop disclosure must be acknowledged before actions can run.'
    }
    return null
  }

  /**
   * Targeting gate for a window-targeted action (Req 7). Returns a user-visible
   * rejection reason when the action must not be delivered to its target window,
   * or `null` when targeting passes (or does not apply to this action). Emits no
   * timeline step itself; the caller records the rejection.
   *
   * Capture / query / launch actions are not window-targeted and pass through.
   * `close_app` requires the target to be a current-run Agent_Window (Req 7.3,
   * 7.4); input actions require positively confirmed Agent_Desktop residence
   * (Req 7.1, 7.2, 7.6, 7.7).
   */
  private checkTargeting(
    action: AgentActionType,
    input: GateInput,
    session: AgentDesktopSession
  ): string | null {
    const requiresWindowTarget = isInputAction(action) || action === 'close_app'
    if (!requiresWindowTarget) {
      return null
    }

    // A window-targeted action without a resolved target cannot be confirmed on
    // the Agent_Desktop — fail closed (Req 7.7).
    if (typeof input.targetHwnd !== 'number') {
      return 'The target window could not be confirmed on the Agent Desktop.'
    }

    const ctx: TargetingContext = {
      agentDesktopIndex: session.agentDesktopIndex,
      agentWindowHandles: new Set(session.windows.keys()),
      zuraOwnedHandles: new Set(this.zuraOwnedHandles),
    }
    const decision = canTargetWindow(
      input.targetHwnd,
      ctx,
      input.onAgentDesktop,
      action === 'close_app'
    )
    if (decision.allow) {
      return null
    }
    return describeTargetingRejection(decision.reason)
  }

  /**
   * Drain the held-input queue on a confirmed Take_Over display switch (Req 3.7,
   * 3.8). Still-live actions are surfaced to held-input listeners in FIFO order
   * for the caller to deliver; aged-out actions are discarded and each emits an
   * `held-expired` timeline step (Req 3.8). Never throws.
   */
  private drainHeldInput(): void {
    const session = this.session
    const { released, expired } = this.heldInputQueue.release()

    for (const item of expired) {
      if (session) {
        this.emitTimelineStep({
          kind: 'held-expired',
          title: 'Held input expired',
          agentRunId: session.agentRunId,
          action: item.action,
          outcome: 'held',
          reason: 'The held input expired before the Agent Desktop was displayed.',
          status: 'expired',
          occurredAt: this.now(),
        })
      }
    }

    for (const item of released) {
      for (const listener of this.heldInputListeners) {
        try {
          listener(item)
        } catch {
          // A listener error must not break the drain or the service.
        }
      }
    }
  }

  /**
   * Build an `{ allow: false }` rejection decision, emit an `action-rejected`
   * timeline step recording the request + decision (Req 4.5), and return it.
   * Never drives the OS and never falls back to the User_Desktop (Req 4.7, 8.6).
   */
  private rejectAction(
    action: string,
    reason: string,
    outcome: GateRejectionOutcome,
    targetHwnd?: number
  ): GateDecision {
    const agentRunId = this.session?.agentRunId ?? ''
    this.emitTimelineStep({
      kind: 'action-rejected',
      title: 'Computer action',
      agentRunId,
      hwnd: targetHwnd,
      action: isAgentActionType(action) ? action : undefined,
      outcome,
      reason,
      status: outcome === 'aborted' ? 'aborted' : 'rejected',
      occurredAt: this.now(),
    })
    return { allow: false, reason, outcome }
  }

  /**
   * Build a held `{ allow: false, outcome: 'held' }` decision, emit an
   * `action-held` timeline step (Req 3.6), and return it. The action has already
   * been parked in the held queue by the caller.
   */
  private holdAction(action: AgentActionType, reason: string, targetHwnd?: number): GateDecision {
    const agentRunId = this.session?.agentRunId ?? ''
    this.emitTimelineStep({
      kind: 'action-held',
      title: 'Input held',
      agentRunId,
      hwnd: targetHwnd,
      action,
      outcome: 'held',
      reason,
      status: 'held',
      occurredAt: this.now(),
    })
    return { allow: false, reason, outcome: 'held' }
  }

  /**
   * Subscribe to timeline steps emitted by window placement / relocation. The
   * IPC layer (Task 17) forwards these to the renderer's `AgentRun` timeline.
   *
   * @returns An unsubscribe function. Calling it more than once is a no-op.
   */
  onTimelineStep(cb: AgentDesktopTimelineStepListener): Unsubscribe {
    this.timelineListeners.add(cb)
    return () => {
      this.timelineListeners.delete(cb)
    }
  }

  /**
   * Observe a window's best-effort metadata and current residence via the
   * binding's enumeration. Never throws: an enumeration failure yields no
   * metadata and an unconfirmed (treated-as-User_Desktop) residence.
   */
  private observeWindow(
    hwnd: number,
    agentDesktopIndex: number
  ): { title?: string; pid?: number; onAgentDesktop?: boolean } {
    try {
      const windows = this.binding.enumerateWindows()
      const match = windows.find((w) => w.hwnd === hwnd)
      if (!match) {
        return {}
      }
      return {
        title: match.title,
        pid: match.pid,
        onAgentDesktop: match.desktopIndex === agentDesktopIndex,
      }
    } catch {
      // Enumeration failure: degrade to no metadata, residence unconfirmed.
      return {}
    }
  }

  /**
   * Move `hwnd` onto `agentDesktopIndex` and confirm residence, retrying up to
   * {@link MAX_PLACEMENT_ATTEMPTS} times. Each attempt increments the record's
   * `placementAttempts`. Returns `true` once {@link VdaBinding.isWindowOnDesktop}
   * confirms the window resides on the Agent_Desktop, else `false` after the
   * attempt budget is exhausted. Per-attempt binding failures are swallowed and
   * counted as a failed attempt (Req 8.3).
   */
  private relocateWithRetry(
    hwnd: number,
    agentDesktopIndex: number,
    record: AgentWindowRecord
  ): boolean {
    for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt += 1) {
      record.placementAttempts = attempt + 1
      try {
        this.binding.moveWindowToDesktop(hwnd, agentDesktopIndex)
        if (this.binding.isWindowOnDesktop(hwnd, agentDesktopIndex)) {
          return true
        }
      } catch {
        // Treat a native failure as a failed attempt and keep retrying within
        // the attempt budget; never let it escape (Req 8.3).
      }
    }
    return false
  }

  /**
   * Switch the displayed Virtual_Desktop to `index` and confirm the switch via
   * {@link VdaBinding.getCurrentDesktopIndex}. Returns `true` only when the
   * current displayed index equals `index` after the switch. Synchronous binding
   * work wrapped by the display-switch timeout in the caller.
   */
  private switchToDesktop(index: number): boolean {
    this.binding.goToDesktop(index)
    return this.binding.getCurrentDesktopIndex() === index
  }

  /**
   * Build a `{ ok: false }` presence result, recording `message` into
   * {@link AgentDesktopState.lastError} and broadcasting the change. Used by every
   * failed presence-transition path so callers can surface the error and the UI
   * stays consistent (Req 3.4, 3.9).
   */
  private failedPresence(message: string): PresenceResult {
    this.lastError = message
    this.notifyStateChange()
    return { ok: false, error: message, state: this.getState() }
  }

  /**
   * Emit a timeline step to every registered timeline listener. A throwing
   * listener is isolated so it cannot break the others or the service.
   */
  private emitTimelineStep(step: AgentDesktopTimelineStep): void {
    if (this.timelineListeners.size === 0) {
      return
    }
    for (const listener of this.timelineListeners) {
      try {
        listener(step)
      } catch {
        // Listener errors must not break emission or the service.
      }
    }
  }

  /**
   * Ensure an Agent_Desktop exists, reusing the last recorded index when it still
   * resolves to an existing Virtual_Desktop, else creating a new one (Req 1.1).
   * Synchronous binding work wrapped by the provisioning timeout in the caller.
   */
  private ensureAgentDesktop(): { index: number; createdByZura: boolean } {
    const recorded = this.lastAgentDesktopIndex
    if (recorded !== null && this.binding.desktopExists(recorded)) {
      // Reuse the previously provisioned Agent_Desktop (Req 1.1).
      return { index: recorded, createdByZura: false }
    }
    // Create a fresh Virtual_Desktop and return its index (Req 1.1).
    const index = this.binding.createDesktop()
    return { index, createdByZura: true }
  }

  /**
   * Ephemeral teardown decision + execution for a completing session
   * (Req 1.5/1.6). Returns the {@link TeardownOutcome} taken. Never throws: a
   * binding failure is caught and the desktop is retained with a surfaced error
   * rather than risking destructive behavior.
   */
  private teardownEphemeralDesktop(session: AgentDesktopSession): TeardownOutcome {
    // Persisted desktops and reused (non-Zura-created) desktops are never removed.
    if (this.settings.persistence !== 'ephemeral') {
      return 'retained-persist'
    }
    if (!session.createdByZura) {
      return 'retained-reused'
    }

    try {
      // Enumerate the windows currently residing on the Agent_Desktop. Any window
      // not registered as an Agent_Window for this run is a window ZuraAI did not
      // place (Req 1.6).
      const onDesktop = this.binding
        .enumerateWindows()
        .filter((w) => w.desktopIndex === session.agentDesktopIndex)

      const nonAgentWindows = onDesktop.filter((w) => !session.windows.has(w.hwnd))

      if (nonAgentWindows.length > 0) {
        // Retain + surface a notice (Req 1.6).
        this.lastError =
          'The Agent Desktop was kept because it contains windows ZuraAI did not open.'
        return 'retained-non-agent'
      }

      // No non-agent windows remain: safe to remove the Zura-created desktop (Req 1.5).
      this.binding.removeDesktop(session.agentDesktopIndex)
      return 'removed'
    } catch (error) {
      // A binding failure must degrade gracefully: retain the desktop and surface
      // the error rather than crash or risk destroying user windows (Req 8.6).
      this.lastError = this.describeVdaFailure(error, 'tear down the Agent Desktop')
      return 'retained-non-agent'
    }
  }

  /**
   * Build a `{ provisioned: false }` result, recording `message` into
   * {@link AgentDesktopState.lastError} and broadcasting the change. Used by every
   * not-provisioned path in {@link startSession} so the User_Desktop stays active.
   */
  private failedStart(message: string): SessionStartResult {
    this.lastError = message
    this.notifyStateChange()
    return { provisioned: false, error: message, state: this.getState() }
  }

  /** Map `startSession` onto the readiness contract. */
  private async startSessionForReadiness(agentRunId: string): Promise<ToolReadinessResult> {
    const started = await this.startSession(agentRunId)
    return started.provisioned
      ? { ready: true, state: started.state }
      : { ready: false, error: started.error, state: started.state }
  }

  /**
   * Clear a stale active session before reprovisioning. This resets state that
   * must not leak from a missing Agent_Desktop into the replacement session.
   */
  private clearStaleSessionForReprovision(): void {
    this.session = null
    this.lastAgentDesktopIndex = null
    this.agentDesktopDisplayed = false
    this.stagingStopped = false
    this.actionCount = 0
    this.aborted = false
    this.lastEscapeAt = 0
    this.heldInputQueue.clear()
    this.heldInputQueue = new HeldInputQueue({ now: this.now })
    this.approvalManager.dispose()
    this.pendingApprovalCount = 0
    this.lastError = null
  }

  /**
   * Build a readiness failure. The state is broadcast so settings UI and Agent
   * Desktop status surfaces see the same failure the tool caller returns.
   */
  private failedReadiness(message: string): ToolReadinessResult {
    this.lastError = message
    this.notifyStateChange()
    return { ready: false, error: message, state: this.getState() }
  }

  /**
   * Translate a thrown provisioning/teardown failure into a user-visible message
   * that names the VirtualDesktopAccessor integration as the cause (Req 8.2, 8.3).
   */
  private describeVdaFailure(error: unknown, whatFailed: string): string {
    if (error instanceof VdaError) {
      return error.message
    }
    if (error instanceof Error && error.message) {
      return `The Agent Desktop could not be provisioned: failed to ${whatFailed} (${error.message}).`
    }
    return `The Agent Desktop could not be provisioned: failed to ${whatFailed}.`
  }

  /**
   * Return an immutable snapshot of the full {@link AgentDesktopState}.
   *
   * Safe to call before {@link initialize}; the pre-initialization snapshot
   * reports `vdaOutcome: 'unavailable'` and the resolved capability.
   */
  getState(): AgentDesktopState {
    return {
      platformSupported: this.platformSupported,
      vdaOutcome: this.vdaOutcome,
      capability: this.resolveCapability(),
      enabled: this.settings.enabled,
      disclosureAcknowledged: this.settings.disclosureAcknowledged,
      presence: this.resolvePresence(),
      agentDesktopDisplayed: this.agentDesktopDisplayed,
      actionCount: this.actionCount,
      maxActions: MAX_ACTIONS_PER_SESSION,
      pendingApprovalCount: this.pendingApprovalCount,
      lastError: this.lastError,
    }
  }

  /**
   * Subscribe to state changes. The listener is invoked with a fresh state
   * snapshot every time the service's state changes.
   *
   * @returns An unsubscribe function. Calling it more than once is a no-op.
   */
  onStateChange(cb: AgentDesktopStateListener): Unsubscribe {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  /**
   * Release the VDA binding and clear all listeners (Req 1.7, app quit).
   *
   * Best-effort and idempotent: a throwing native dispose is swallowed so app
   * teardown never fails. After disposal the capability resolves to
   * `unavailable`.
   */
  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.vdaOutcome = 'unavailable'
    this.session = null
    try {
      this.binding.dispose()
    } catch {
      // Disposal is best-effort; never throw during teardown / app quit.
    }
    // Cancel any pending approvals and discard held input on shutdown.
    try {
      this.approvalManager.dispose()
    } catch {
      // Best-effort: never throw during teardown / app quit.
    }
    this.heldInputQueue.clear()
    this.pendingApprovalCount = 0
    this.listeners.clear()
    this.timelineListeners.clear()
    this.heldInputListeners.clear()
  }

  /**
   * Resolve the Agent Desktop capability state from platform support, the VDA
   * load outcome, the skill toggle, and whether a session is active (Req 8.5,
   * 11.1, 9.2).
   *
   * - `unavailable` when the platform is unsupported, the VDA binding is
   *   unavailable, or the skill is disabled.
   * - `active` when a session is currently provisioned.
   * - `available` otherwise (enabled + VDA loaded, no session yet).
   */
  private resolveCapability(): AgentDesktopCapabilityState {
    if (!this.platformSupported) {
      return 'unavailable'
    }
    if (this.vdaOutcome === 'unavailable') {
      return 'unavailable'
    }
    if (!this.settings.enabled) {
      return 'unavailable'
    }
    if (this.session) {
      return 'active'
    }
    return 'available'
  }

  /** Current presence, or `null` when no session is active. */
  private resolvePresence(): PresenceMode | null {
    return this.session ? this.session.presence : null
  }

  /**
   * Whether staging of new Agent_Windows is currently stopped (Req 1.4).
   *
   * Set by {@link completeSession} and reset by {@link startSession}. The
   * window-placement gate (Task 12) reads this before staging or relocating a
   * new Agent_Window so a completed session never accrues new windows.
   */
  isStagingStopped(): boolean {
    return this.stagingStopped
  }

  /**
   * Broadcast the current state to every registered listener. Each listener
   * receives the same immutable snapshot; a throwing listener is isolated so it
   * cannot break the others.
   */
  private notifyStateChange(): void {
    if (this.listeners.size === 0) {
      return
    }
    const snapshot = this.getState()
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      } catch {
        // Listener errors must not break the broadcast or the service.
      }
    }
  }
}

/**
 * The complete Computer Use action surface Agent Desktop reuses (Req 4.1, 12.6).
 * The single source of truth for the out-of-surface gate: any action name not in
 * this set is rejected by {@link AgentDesktopService.gateComputerAction} without
 * an explicit allowlist entry (Property 39).
 */
const AGENT_ACTION_TYPES: ReadonlySet<AgentActionType> = new Set<AgentActionType>([
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
])

/**
 * Type guard: whether `action` is one of the 10 Computer Use action types
 * (Req 12.6). Narrows an arbitrary string to {@link AgentActionType}.
 */
function isAgentActionType(action: string): action is AgentActionType {
  return AGENT_ACTION_TYPES.has(action as AgentActionType)
}

/**
 * Map a {@link TargetingRejectionReason} to a user-visible message recorded as
 * the targeting-violation reason (Req 7.2, 7.4, 7.6, 7.7).
 */
function describeTargetingRejection(reason: TargetingRejectionReason): string {
  switch (reason) {
    case 'zura-owned':
      return 'The action targets a ZuraAI-owned window, which the agent may not drive.'
    case 'user-desktop':
      return 'The target window resides on the User Desktop, not the Agent Desktop.'
    case 'not-agent-window':
      return 'close_app is restricted to windows the agent opened in this run.'
    case 'unconfirmed':
    default:
      return 'The target window could not be confirmed on the Agent Desktop.'
  }
}

/**
 * Whether `value` is a usable settings record: a non-null, non-array plain
 * object. {@link AgentDesktopService.applySettings} treats anything else as an
 * unusable mirrored payload and retains the last successfully applied settings
 * (Req 10.7).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Deep-ish clone of settings so the service never mutates a shared object. */
function cloneSettings(settings: AgentDesktopSettings): AgentDesktopSettings {
  return {
    enabled: settings.enabled,
    disclosureAcknowledged: settings.disclosureAcknowledged,
    persistence: settings.persistence,
    approvalPolicy: { ...settings.approvalPolicy },
    approvalTimeoutMs: settings.approvalTimeoutMs,
  }
}

/**
 * Run provisioning `work` but reject if it does not settle within `timeoutMs`
 * (Req 1.1, 1.8). The current {@link VdaBinding} is synchronous so `work` settles
 * immediately; the timer guards against a future asynchronous binding hanging
 * past the 2s provisioning bound. The rejection is a plain `Error` describing the
 * timeout; the caller maps it to an integration-naming user-visible message.
 */
function withProvisionTimeout<T>(work: () => T | Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(`provisioning did not complete within ${timeoutMs}ms`))
    }, timeoutMs)

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    try {
      Promise.resolve(work()).then(
        (result) => finish(() => resolve(result)),
        (error) => finish(() => reject(error))
      )
    } catch (error) {
      finish(() => reject(error))
    }
  })
}

/**
 * Factory for an {@link AgentDesktopService}. Pass
 * {@link AgentDesktopServiceOptions.binding} to inject a mock VDA binding and
 * {@link AgentDesktopServiceOptions.platformSupported} to override platform
 * gating in tests.
 */
export function createAgentDesktopService(
  options?: AgentDesktopServiceOptions
): AgentDesktopService {
  return new AgentDesktopService(options)
}

/**
 * Process-wide singleton {@link AgentDesktopService}. Lazily constructed on the
 * first {@link getAgentDesktopService} call. Held here (rather than in
 * `index.ts`) so both the IPC layer (`electron/agentDesktop/index.ts`, Task 17)
 * and the Computer Use gate (`electron/tools/index.ts`, Task 16) can resolve the
 * same instance without a circular import or a duplicated accessor.
 */
let sharedAgentDesktopService: AgentDesktopService | null = null

/**
 * Resolve the process-wide {@link AgentDesktopService} singleton, constructing
 * it with production defaults on first use (a real {@link createVdaBinding}
 * binding, the safe disabled default settings, and `process.platform`-derived
 * platform support).
 *
 * Both the IPC registration layer and the Computer Use gate call this so they
 * share one service instance — one VDA binding, one session, one shared action
 * counter / abort state — exactly as the design requires (a single shared
 * control surface, not parallel counters).
 *
 * The instance is *not* initialized here; the caller (main wiring, Task 17.3)
 * is responsible for calling {@link AgentDesktopService.initialize} once. The
 * service reports `vdaOutcome: 'unavailable'` until then, which is safe.
 */
export function getAgentDesktopService(): AgentDesktopService {
  if (!sharedAgentDesktopService) {
    sharedAgentDesktopService = new AgentDesktopService()
  }
  return sharedAgentDesktopService
}

/**
 * Dispose and clear the process-wide {@link AgentDesktopService} singleton, if
 * one exists. Best-effort and idempotent: {@link AgentDesktopService.dispose}
 * swallows native teardown failures so app quit never fails (Req 1.7). After
 * this call the next {@link getAgentDesktopService} constructs a fresh instance.
 */
export function resetAgentDesktopService(): void {
  if (sharedAgentDesktopService) {
    sharedAgentDesktopService.dispose()
    sharedAgentDesktopService = null
  }
}
