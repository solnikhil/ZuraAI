/**
 * Agent Desktop (Agent View) shared types.
 *
 * These types are shared across the Agent Desktop main-process modules
 * (service, approval policy, presence, targeting, window registry, IPC) and
 * mirror the Computer Use action surface that Agent Desktop reuses.
 */

/**
 * The existing Computer Use action surface. Agent Desktop reuses these exact
 * action types rather than introducing new model-callable tools. Req 4.1, 12.6.
 */
export type AgentActionType =
  | 'screenshot'
  | 'click'
  | 'type'
  | 'key'
  | 'scroll'
  | 'cursor_position'
  | 'list_windows'
  | 'launch_app'
  | 'close_app'
  | 'find_app'

/**
 * Allowlist-driven approval classification for a single action. Req 5.1, 5.2.
 * An action is `auto-approve` only when it matches an explicit allowlist entry;
 * everything else (including unknown actions) is `approval-required`.
 */
export type ActionClassification = 'auto-approve' | 'approval-required'

/**
 * The agent's interaction state. Req 3.
 * - `background`: staged/waiting, no input delivered to Agent_Windows.
 * - `take-over`: foregrounded and actively driving input on the Agent_Desktop.
 */
export type PresenceMode = 'background' | 'take-over'

/**
 * Which Virtual_Desktop a window resides on. Req 7.5.
 */
export type WindowResidence = 'agent-desktop' | 'user-desktop'

/**
 * Outcome of attempting to load the VirtualDesktopAccessor binding. Req 8.1.
 * Defined here as a shared type; the `vdaBinding` module imports it.
 */
export type VdaLoadOutcome = 'available' | 'unavailable'

/**
 * Agent Desktop capability state recorded in the Agent_Run capabilities.
 * Req 11.1, 8.5, 9.2.
 * - `unavailable`: non-Windows, VDA unavailable, or skill disabled.
 * - `available`: enabled + VDA loaded but no session active.
 * - `active`: a session is currently provisioned.
 */
export type AgentDesktopCapabilityState = 'available' | 'active' | 'unavailable'

/**
 * In-memory record of a single Agent_Window (not persisted). Req 2.3, 2.5.
 * Keyed by native window handle (HWND) in the session window map.
 */
export interface AgentWindowRecord {
  /** Native window handle. */
  hwnd: number
  /** Window title at the time of association. */
  title: string
  /** Owning process id. */
  pid: number
  /** The Agent_Run that launched this window. Req 2.3. */
  agentRunId: string
  /** Last-known residence of the window. */
  residence: WindowResidence
  /** Number of relocation attempts made (toward MAX_PLACEMENT_ATTEMPTS). Req 2.5. */
  placementAttempts: number
  /** When the window was first observed. */
  openedAt: number
}

/**
 * Main-process runtime state for a single provisioned Agent_Desktop session
 * (not persisted). Req 1.1–1.3.
 */
export interface AgentDesktopSession {
  /** The Agent_Run this session belongs to. */
  agentRunId: string
  /** GUID-style identifier recorded at provisioning. Req 1.1, 1.2. */
  agentDesktopId: string
  /** Resolved current Virtual_Desktop index (volatile; shifts on reordering). */
  agentDesktopIndex: number
  /** User_Desktop identifier recorded at creation for safe return. Req 1.3, 1.10, 6.5. */
  userDesktopId: string
  /** False when an existing Virtual_Desktop was reused rather than created. */
  createdByZura: boolean
  /** Current presence mode. */
  presence: PresenceMode
  /** Agent_Windows for this session, keyed by HWND. */
  windows: Map<number, AgentWindowRecord>
  /** When the session was provisioned. */
  startedAt: number
}

/**
 * Single broadcast payload for `agent-desktop:state-changed` and the return
 * value of `get-state` / `apply-settings` / take-over calls.
 */
export interface AgentDesktopState {
  /** False on macOS / non-Windows platforms. Req 9. */
  platformSupported: boolean
  /** VDA binding load outcome. Req 8.1. */
  vdaOutcome: VdaLoadOutcome
  /** Resolved capability state. */
  capability: AgentDesktopCapabilityState
  /** Whether the Agent_Desktop_Skill is enabled. */
  enabled: boolean
  /** Whether the not-a-sandbox disclosure has been acknowledged. Req 12.1, 12.2. */
  disclosureAcknowledged: boolean
  /** Current presence, or null when no session is active. */
  presence: PresenceMode | null
  /** Whether the Agent_Desktop is the currently displayed Virtual_Desktop. */
  agentDesktopDisplayed: boolean
  /** Shared Computer Use session action counter. Req 6.7. */
  actionCount: number
  /** MAX_ACTIONS_PER_SESSION. */
  maxActions: number
  /** Number of currently pending approvals. */
  pendingApprovalCount: number
  /** Last surfaced error, or null. */
  lastError: string | null
}
