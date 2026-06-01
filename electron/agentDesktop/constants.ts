/**
 * Agent Desktop (Agent View) constants.
 *
 * Timing constants and shared limits for the Windows-only Agent Desktop feature.
 * The action cap and kill-switch window are re-exported from the existing
 * Computer Use constants so the action cap and kill switch remain a single
 * shared control surface rather than a parallel counter.
 */

// Re-exported from Computer Use so the action cap and kill switch stay a single
// shared control surface (not duplicated here). See Req 6.7 / kill switch.
export { MAX_ACTIONS_PER_SESSION, KILL_SWITCH_WINDOW_MS } from '../tools/computer-use/constants'

/** Max time to ensure an Agent_Desktop exists (reuse or create). Req 1.1, 1.8. */
export const PROVISION_TIMEOUT_MS = 2_000

/** Max time to load + probe the VirtualDesktopAccessor binding. Req 8.1. */
export const VDA_LOAD_TIMEOUT_MS = 5_000

/** Max time to move/relocate an Agent_Window onto the Agent_Desktop. Req 2.1, 2.2. */
export const WINDOW_PLACEMENT_TIMEOUT_MS = 1_000

/** Number of relocation attempts before recording a placement failure. Req 2.5. */
export const MAX_PLACEMENT_ATTEMPTS = 3

/** Max time to positively confirm a target window's residence. Req 7.1, 7.7. */
export const TARGETING_CONFIRM_TIMEOUT_MS = 1_000

/** How long a held input action waits for the Agent_Desktop to be displayed. Req 3.6, 3.8. */
export const HELD_INPUT_TTL_MS = 60_000

/** Max time to switch the displayed Virtual_Desktop during Take_Over. Req 3.3. */
export const DISPLAY_SWITCH_TIMEOUT_MS = 1_000

/** Default approval timeout. Req 5.6. */
export const DEFAULT_APPROVAL_TIMEOUT_MS = 60_000

/** Minimum configurable approval timeout (clamp lower bound). Req 5.6. */
export const MIN_APPROVAL_TIMEOUT_MS = 5_000

/** Maximum configurable approval timeout (clamp upper bound). Req 5.6. */
export const MAX_APPROVAL_TIMEOUT_MS = 600_000

/** Max time to mirror renderer preferences into the service. Req 10.6. */
export const SETTINGS_MIRROR_TIMEOUT_MS = 1_000
