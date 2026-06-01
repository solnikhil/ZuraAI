/**
 * Agent Desktop (Agent View) presence state machine (pure).
 *
 * Encodes which action classes are permitted in each Presence_Mode and whether
 * a rejected input action should be held for later delivery. This module is
 * pure: it has no side effects and no dependency on the FFI binding, nut.js,
 * timers, or the OS. It only classifies actions against the presence rules so
 * the service can decide how to route each gated Computer Use action.
 *
 * Presence rules (Req 3):
 * - `background`: permit non-input actions (screenshot, list_windows, find_app)
 *   and stage launch requests; input actions (click, type, key, scroll,
 *   cursor_position) are NOT delivered — they are held. (Req 3.1, 3.2)
 * - `take-over`: deliver input actions only while the Agent_Desktop is the
 *   currently displayed Virtual_Desktop; otherwise hold the input. (Req 3.5, 3.6)
 *
 * launch_app / close_app are intentionally neither input nor non-input here:
 * presence never holds them. They flow straight through presence and are
 * governed instead by the Approval_Policy (Req 5.5) and targeting (Req 7).
 */

import type { AgentActionType, PresenceMode } from './types'

// Re-export PresenceMode for callers that only need the presence surface. The
// canonical definition lives in `./types`; this is a convenience re-export.
export type { PresenceMode } from './types'

/**
 * Actions that read state and never deliver synthetic input. Always permitted
 * regardless of presence or display state. Req 3.2.
 */
export const NON_INPUT_ACTIONS = ['screenshot', 'list_windows', 'find_app'] as const

/**
 * Actions that deliver synthetic input into the shared Input_Session. These are
 * the actions presence gates: held in `background`, and in `take-over` only
 * delivered while the Agent_Desktop is displayed. Req 3.2, 3.5, 3.6.
 */
export const INPUT_ACTIONS = ['click', 'type', 'key', 'scroll', 'cursor_position'] as const

type NonInputAction = (typeof NON_INPUT_ACTIONS)[number]
type InputAction = (typeof INPUT_ACTIONS)[number]

const INPUT_ACTION_SET: ReadonlySet<AgentActionType> = new Set<AgentActionType>(INPUT_ACTIONS)

/**
 * True when the action delivers synthetic input into the shared Input_Session
 * (click, type, key, scroll, cursor_position) and is therefore subject to the
 * presence hold rules. Returns false for capture/query actions and for
 * launch_app / close_app, which presence never holds. Req 3.2.
 */
export function isInputAction(action: AgentActionType): boolean {
  return INPUT_ACTION_SET.has(action)
}

/**
 * Result of evaluating an action against the current presence + display state.
 *
 * - `{ permit: true }` — the action may proceed (subject to later targeting and
 *   approval gates handled elsewhere).
 * - `{ permit: false; reason; hold }` — the action must not be delivered now.
 *   `reason` distinguishes a background-mode hold (`background-input`) from a
 *   take-over hold because the Agent_Desktop is not displayed (`not-displayed`).
 *   `hold` indicates the input should be queued for later delivery rather than
 *   discarded.
 */
export type PresenceDecision =
  | { permit: true }
  | { permit: false; reason: 'background-input' | 'not-displayed'; hold: boolean }

/**
 * Decide whether an action is permitted by the presence rules.
 *
 * Non-input actions (and launch_app / close_app) are always permitted by
 * presence. Input actions are:
 * - held with reason `background-input` while in `background` mode (Req 3.2), and
 * - held with reason `not-displayed` while in `take-over` mode when the
 *   Agent_Desktop is not the displayed Virtual_Desktop (Req 3.6), and
 * - permitted only in `take-over` mode while the Agent_Desktop is displayed
 *   (Req 3.5).
 *
 * @param mode Current Presence_Mode.
 * @param displayed Whether the Agent_Desktop is the displayed Virtual_Desktop.
 * @param action The requested Computer Use action.
 */
export function permitsAction(
  mode: PresenceMode,
  displayed: boolean,
  action: AgentActionType
): PresenceDecision {
  // Capture/query actions and launch/close are not input — presence never holds them.
  if (!isInputAction(action)) {
    return { permit: true }
  }

  // From here on the action is an input action subject to presence hold rules.
  if (mode === 'background') {
    // Input is held while staging in the background. Req 3.2.
    return { permit: false, reason: 'background-input', hold: true }
  }

  // mode === 'take-over': input is delivered only while the Agent_Desktop is displayed.
  if (!displayed) {
    // Held until the Agent_Desktop becomes the displayed Virtual_Desktop. Req 3.6.
    return { permit: false, reason: 'not-displayed', hold: true }
  }

  // take-over AND Agent_Desktop displayed: input may proceed. Req 3.5.
  return { permit: true }
}

export type { NonInputAction, InputAction }
