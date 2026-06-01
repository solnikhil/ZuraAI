/**
 * Agent Desktop (Agent View) targeting / residence checks — pure.
 *
 * Decides whether an agent action may be delivered to a given target window.
 * This module is intentionally **pure**: no I/O, no shared state, no clocks. It
 * is **fail-closed by construction** — an action is permitted ONLY after the
 * target window's residence has been positively confirmed as the Agent_Desktop
 * and the window is not a ZuraAI-owned window. Anything that cannot be
 * positively confirmed is rejected.
 *
 * Enforces Req 7 (window-targeting limits) and Req 2.7:
 * - Input is delivered only after positively confirming Agent_Desktop residence
 *   (Req 7.1, 2.7).
 * - User_Desktop windows are rejected (Req 7.2).
 * - `close_app` is restricted to current-run Agent_Windows (Req 7.3, 7.4).
 * - Listed windows carry exactly one residence annotation (Req 7.5).
 * - ZuraAI-owned windows are always rejected (Req 7.6).
 * - Residence that cannot be positively determined is rejected (Req 7.7).
 */

import type { WindowResidence } from './types'

/**
 * Context required to evaluate a targeting decision for the current Agent_Run.
 */
export interface TargetingContext {
  /** Resolved current Agent_Desktop Virtual_Desktop index for the session. */
  agentDesktopIndex: number
  /** HWNDs of Agent_Windows associated with the current Agent_Run. Req 7.3. */
  agentWindowHandles: Set<number>
  /** HWNDs of ZuraAI-owned windows (main, overlay, prompt popup, etc.). Req 7.6. */
  zuraOwnedHandles: Set<number>
}

/**
 * Why a targeting request was rejected.
 * - `user-desktop`: the target resides on the User_Desktop (Req 7.2).
 * - `zura-owned`: the target is a ZuraAI-owned window (Req 7.6).
 * - `not-agent-window`: the target is not an Agent_Window of the current run
 *   when the action (e.g. `close_app`) requires it (Req 7.3, 7.4).
 * - `unconfirmed`: residence could not be positively confirmed (Req 7.1, 7.7).
 */
export type TargetingRejectionReason =
  | 'user-desktop'
  | 'zura-owned'
  | 'not-agent-window'
  | 'unconfirmed'

/**
 * Result of a targeting decision. `allow: true` means the action may be
 * delivered; otherwise the caller must reject the action, deliver no input,
 * and record a targeting-violation entry in the Agent_Run timeline.
 */
export type TargetingDecision = { allow: true } | { allow: false; reason: TargetingRejectionReason }

/**
 * Classify which Virtual_Desktop a window resides on. Used to annotate listed
 * windows with exactly one of `agent-desktop` or `user-desktop` (Req 7.5).
 *
 * This is a binary classification: a window is reported as residing on the
 * Agent_Desktop when `onAgentDesktop` is `true`, and on the User_Desktop
 * otherwise. The `hwnd` is part of the documented API surface and is retained
 * for symmetry with {@link canTargetWindow} and future use.
 *
 * @param _hwnd Native window handle being classified. Retained for symmetry
 *   with {@link canTargetWindow} and future use; intentionally unused.
 * @param onAgentDesktop Whether the window currently resides on the Agent_Desktop.
 */
export function classifyResidence(_hwnd: number, onAgentDesktop: boolean): WindowResidence {
  return onAgentDesktop ? 'agent-desktop' : 'user-desktop'
}

/**
 * Decide whether an action may be delivered to `hwnd` for the current run.
 *
 * Fail-closed ordering:
 * 1. ZuraAI-owned window  ⇒ reject `zura-owned` (always, Req 7.6).
 * 2. Residence not positively confirmed (`onAgentDesktop === undefined`)
 *    ⇒ reject `unconfirmed` (Req 7.1, 7.7, 2.7).
 * 3. Window resides on the User_Desktop (`onAgentDesktop === false`)
 *    ⇒ reject `user-desktop` (Req 7.2).
 * 4. Window is on the Agent_Desktop but the action requires it to be a
 *    current-run Agent_Window and it is not ⇒ reject `not-agent-window`
 *    (Req 7.3, 7.4). Applies to `close_app`.
 * 5. Otherwise ⇒ allow.
 *
 * Note on the `onAgentDesktop` type: the design sketch types this as `boolean`,
 * but a plain boolean cannot represent the "residence could not be positively
 * determined" state that Req 7.1/7.7 require to be rejected as `unconfirmed`.
 * It is therefore modelled as `boolean | undefined`, where `undefined` means
 * residence was not positively confirmed and `true` is the only value that
 * positively confirms Agent_Desktop residence.
 *
 * @param hwnd Native window handle the action targets.
 * @param ctx Targeting context for the current Agent_Run.
 * @param onAgentDesktop `true` if positively confirmed on the Agent_Desktop,
 *   `false` if positively confirmed on the User_Desktop, `undefined` if
 *   residence could not be positively confirmed.
 * @param requireAgentWindow When `true` (e.g. for `close_app`), the target must
 *   also be an Agent_Window associated with the current Agent_Run (Req 7.3, 7.4).
 */
export function canTargetWindow(
  hwnd: number,
  ctx: TargetingContext,
  onAgentDesktop: boolean | undefined,
  requireAgentWindow = false
): TargetingDecision {
  // 1. ZuraAI-owned windows are always rejected, regardless of residence (Req 7.6).
  if (ctx.zuraOwnedHandles.has(hwnd)) {
    return { allow: false, reason: 'zura-owned' }
  }

  // 2. Fail closed: residence must be positively confirmed (Req 7.1, 7.7, 2.7).
  if (onAgentDesktop === undefined) {
    return { allow: false, reason: 'unconfirmed' }
  }

  // 3. Confirmed on the User_Desktop ⇒ reject (Req 7.2).
  if (!onAgentDesktop) {
    return { allow: false, reason: 'user-desktop' }
  }

  // Residence is now positively confirmed as the Agent_Desktop.

  // 4. close_app (and any agent-window-restricted action) must target a
  //    current-run Agent_Window (Req 7.3, 7.4).
  if (requireAgentWindow && !ctx.agentWindowHandles.has(hwnd)) {
    return { allow: false, reason: 'not-agent-window' }
  }

  // 5. Positively confirmed Agent_Desktop residence, not ZuraAI-owned, and (if
  //    required) a current-run Agent_Window ⇒ allow.
  return { allow: true }
}
