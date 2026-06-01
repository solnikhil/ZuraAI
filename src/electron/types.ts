import type { ChatIndexData, ChatSession, ChatSessionMetadata, Folder } from '../chat/types'
import type { AgentDesktopCapabilityState } from '../chat/types'
import type { ChatDiagnosticEvent } from '../diagnostics/chatDiagnostics'
import type {
  McpApprovalDecision,
  McpNamespacedTool,
  McpPromptResult,
  McpRuntimePrompt,
  McpRuntimeResource,
  McpRuntimeSnapshot,
  McpResourceReadResult,
  McpServerConfig,
  McpServerRuntimeState,
  McpToolExecutionResult,
} from '../mcp/types'
import type { McpServerInputPayload } from '../mcp/draft'
import type { ToolResult } from '../tools/types'

/**
 * Renderer-side subset of electron-updater's UpdateInfo.
 * Only the fields the renderer actually reads are included.
 */
export interface UpdateCheckInfo {
  version: string
  releaseDate?: string
  releaseName?: string | null
  releaseNotes?: string | Array<{ version: string; note: string | null }> | null
}

/**
 * Renderer-side approval decision shape (mirrors BaseApprovalDecision from main).
 */
export interface ApprovalDecision {
  requestId: string
  approved: boolean
  resolvedAt: number
  outcome: 'approved' | 'rejected' | 'timed_out' | 'cancelled'
}

/**
 * Pending code execution approval request shape (mirrors PendingCodeApproval from main).
 */
export interface PendingCodeApproval {
  id: string
  code: string
  language: string
  requestedAt: number
  expiresAt: number
}

/**
 * Pending computer use approval request shape (mirrors PendingComputerAction from main).
 */
export interface PendingComputerAction {
  id: string
  action: string
  args: Record<string, unknown>
  screenshot?: string
  requestedAt: number
  expiresAt: number
}

// ---------------------------------------------------------------------------
// Agent Desktop (Agent View) renderer-side mirrors
//
// These mirror the trusted main-process types in `electron/agentDesktop/*`
// (`types.ts`, `settings.ts`, `approvalManager.ts`, `index.ts`). They are kept
// in sync by convention, matching how `PendingComputerAction` mirrors the
// Computer Use main type. Agent Desktop is Windows-only; on macOS the bridge is
// still typed but every call rejects in main (Req 9.4).
// ---------------------------------------------------------------------------

/**
 * The existing Computer Use action surface reused by Agent Desktop. Req 4.1, 12.6.
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

/** Allowlist-driven approval classification for a single action. Req 5.1, 5.2. */
export type AgentActionClassification = 'auto-approve' | 'approval-required'

/**
 * The agent's interaction state. Req 3.
 * - `background`: staged/waiting, no input delivered to Agent_Windows.
 * - `take-over`: foregrounded and actively driving input on the Agent_Desktop.
 */
export type AgentDesktopPresenceMode = 'background' | 'take-over'

/** Outcome of loading the VirtualDesktopAccessor binding. Req 8.1. */
export type VdaLoadOutcome = 'available' | 'unavailable'

/**
 * Agent Desktop capability state recorded in the Agent_Run capabilities.
 * Req 11.1, 8.5, 9.2.
 *
 * Canonical definition lives in `src/chat/types.ts`; imported above and
 * re-exported here so the renderer-facing electron types stay a single source
 * of truth.
 */
export type { AgentDesktopCapabilityState }

/**
 * Persisted Agent Desktop preferences (sanitized; non-secret). Lives in the
 * `zura-settings` blob under `settings.agentDesktop` (Req 10.1).
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
  approvalPolicy: Record<AgentActionType, AgentActionClassification>
  /** Approval timeout in ms, clamped [5000, 600000], default 60000 (Req 5.6). */
  approvalTimeoutMs: number
}

/**
 * Single broadcast payload for `agent-desktop:state-changed` and the return
 * value of `get-state` / `apply-settings` / take-over calls (mirrors the main
 * `AgentDesktopState`).
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
  presence: AgentDesktopPresenceMode | null
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

/**
 * Result of a Take_Over / end-Take_Over transition (mirrors the main
 * `PresenceResult`). On failure the presence is left unchanged and an error is
 * surfaced (Req 3.4).
 */
export type AgentDesktopPresenceResult =
  | { ok: true; state: AgentDesktopState }
  | { ok: false; error: string; state: AgentDesktopState }

/**
 * A pending Agent Desktop action awaiting user approval (mirrors
 * `PendingAgentDesktopAction` from main). `classification` is always
 * `approval-required` because auto-approved actions never reach the manager.
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

/**
 * Payload broadcast on `agent-desktop:killed` (Req 6.6). Identifies the aborted
 * Agent_Run plus the state captured at abort time so the renderer timeline can
 * reflect the aborted session immediately.
 */
export interface AgentDesktopKilledPayload {
  agentRunId: string
  reason: string
  occurredAt: number
  state: AgentDesktopState
}


/**
 * Renderer-side Memory entry shape (mirrors the main-process Memory type in
 * electron/memoryStore.ts). v1 only writes `{ type: 'global' }` scopes; the
 * project variant is reserved for a future projects/folders feature.
 */
export type MemorySource = 'user' | 'model'

export type MemoryScope =
  | { type: 'global' }
  | { type: 'project'; projectId: string }

export interface Memory {
  id: string
  content: string
  createdAt: number
  updatedAt: number
  source: MemorySource
  scope: MemoryScope
  sessionId?: string
}

export interface AddMemoryInput {
  content: string
  source?: MemorySource
  scope?: MemoryScope
  sessionId?: string
}

export interface UpdateMemoryPatch {
  content?: string
  scope?: MemoryScope
}

export interface MemoryAPI {
  list: (scope?: MemoryScope) => Promise<Memory[]>
  add: (input: AddMemoryInput) => Promise<Memory>
  update: (id: string, patch: UpdateMemoryPatch) => Promise<Memory | null>
  delete: (id: string) => Promise<boolean>
  clear: () => Promise<boolean>
  search: (query: string, limit?: number, scope?: MemoryScope) => Promise<Memory[]>
  /**
   * Subscribe to broadcast notifications when any window mutates the memory
   * store. Returns an unsubscribe function.
   */
  onChanged: (callback: () => void) => () => void
}


export type SecureStorageKey =
  | 'openRouterApiKey'
  | 'perplexityApiKey'
  | 'groqApiKey'
  | 'tavilyApiKey'
  | 'alibabaApiKey'
  | 'deepseekApiKey'
  | 'fireworksApiKey'
  | 'onlineCompilerApiKey'

export interface StorageStatus {
  encryptionAvailable: boolean
  storageFileExists: boolean
  storagePath: string
  keyCount: number
  lastError: string | null
}

export interface AppRuntimeInfo {
  appName: string
  appVersion: string
  channel: string
  isPackaged: boolean
  electronVersion: string
  chromiumVersion: string
  nodeVersion: string
  v8Version: string
  osVersion: string
  commitHash: string
  commitDate: string
}

export interface AppMemoryReport {
  capturedAt: string
  currentProcess: {
    workingSetSize: number
    peakWorkingSetSize: number
    privateBytes: number
    sharedBytes: number
  }
  appMetrics: Array<{
    pid: number
    type: string
    name?: string
    memory: {
      workingSetSize: number
      peakWorkingSetSize: number
      privateBytes: number
      sharedBytes: number
    }
    cpu: {
      percentCPUUsage: number
      idleWakeupsPerSecond: number
    }
    creationTime: number
  }>
}

export interface OverlaySettings {
  enabled: boolean
  launchOnStartup: boolean
  hotkey: string
  anchor: 'right'
  compactWidth: number
  expandedWidth: number
  promptAutoHideEnabled: boolean
  promptAutoHideTimeout: number
}

export interface OverlayState extends OverlaySettings {
  visible: boolean
  mode: 'hidden' | 'compact' | 'expanded'
  shortcutRegistered: boolean
}

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export type NativeContextMenuAction =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'select-all'
  | 'chat-rename'
  | 'chat-pin'
  | 'chat-unpin'
  | 'chat-duplicate'
  | 'chat-delete'

export type NativeContextMenuKind = 'default' | 'chat-row'

export interface NativeContextMenuRequest {
  hasSelection: boolean
  isEditable: boolean
  isContentEditable: boolean
  hasLink: boolean
  linkUrl: string
  mouseX: number
  mouseY: number
  isDev: boolean
  kind?: NativeContextMenuKind
  isPinnedChatRow?: boolean
}

/**
 * Renderer-safe shape describing one sampled OS process belonging to the app.
 *
 * Values are normalized away from Electron's raw `ProcessMetric` units:
 * memory is reported in MB (rounded to 1 decimal) and CPU as a percent.
 */
export type ProcessSampleType =
  | 'Browser'
  | 'Tab'
  | 'GPU'
  | 'Utility'
  | 'Zygote'
  | 'Sandbox helper'
  | 'Unknown'

export interface ProcessSample {
  pid: number
  type: ProcessSampleType
  /** Raw type string from Electron in case main reported something we don't model yet. */
  rawType: string
  name: string
  memoryMB: number
  peakMemoryMB: number
  cpuPercent: number
  /** Title of the BrowserWindow that owns this Tab process, when known. */
  windowTitle?: string
}

export interface ResourceSample {
  capturedAt: number
  processes: ProcessSample[]
}

export type AppMenuCommand =
  | 'new-chat'
  | 'open-settings'
  | 'open-about'
  | 'reload'
  | 'toggle-devtools'
  | 'reset-zoom'
  | 'zoom-in'
  | 'zoom-out'
  | 'toggle-fullscreen'
  | 'minimize'
  | 'toggle-maximize'
  | 'close-window'
  | 'open-help'

export type IpcSendChannel =
  | 'overlay:drag-start'
  | 'overlay:drag-move'
  | 'overlay:drag-end'
  | 'open-model-selector'
  | 'overlay:navigate-settings'
  | 'resource-monitor:subscribe'
  | 'resource-monitor:unsubscribe'

export interface IpcSendArgsMap {
  'overlay:drag-start': [cursorX: number, cursorY: number]
  'overlay:drag-move': [cursorX: number, cursorY: number]
  'overlay:drag-end': []
  'open-model-selector': []
  'overlay:navigate-settings': [section: string]
  'resource-monitor:subscribe': []
  'resource-monitor:unsubscribe': []
}

export type IpcInvokeChannel =
  | 'chat-store:get-metadata'
  | 'chat-store:get-session'
  | 'chat-store:save-session'
  | 'chat-store:delete-session'
  | 'chat-store:save-index'
  | 'chat-store:get-all'
  | 'chat-store:save-all'
  | 'chat-store:migrate'
  | 'chat-store:get-all-folders'
  | 'chat-store:save-folders'
  | 'chat-diagnostics:append-event'
  | 'chat-diagnostics:get-debug-reference'
  | 'chat-diagnostics:list-events'
  | 'chat-debug-window:open'
  | 'secure-storage:get'
  | 'secure-storage:set'
  | 'secure-storage:get-presence'
  | 'secure-storage:get-all'
  | 'execute-tool'
  | 'window-resize'
  | 'context-menu:show'
  | 'native-dialog:confirm-delete-chat'
  | 'updater:check-for-updates'
  | 'updater:quit-and-install'
  | 'updater:get-version'
  | 'resource-monitor:get-now'

export interface IpcInvokeArgsMap {
  'chat-store:get-metadata': []
  'chat-store:get-session': [sessionId: string]
  'chat-store:save-session': [session: ChatSession]
  'chat-store:delete-session': [sessionId: string]
  'chat-store:save-index': [index: ChatIndexData]
  'chat-store:get-all': []
  'chat-store:save-all': [sessions: ChatSession[]]
  'chat-store:migrate': [localStorageData: ChatSession[]]
  'chat-store:get-all-folders': []
  'chat-store:save-folders': [folders: Folder[]]
  'chat-diagnostics:append-event': [event: ChatDiagnosticEvent]
  'chat-diagnostics:get-debug-reference': [sessionId: string]
  'chat-diagnostics:list-events': [sessionId: string]
  'chat-debug-window:open': [sessionId: string]
  'secure-storage:get': [key: SecureStorageKey]
  'secure-storage:set': [key: SecureStorageKey, value: string]
  'secure-storage:get-presence': []
  'secure-storage:get-all': []
  'execute-tool': [toolName: string, args: Record<string, unknown>]
  'window-resize': [newBounds: WindowBounds]
  'context-menu:show': [request: NativeContextMenuRequest]
  'native-dialog:confirm-delete-chat': []
  'updater:check-for-updates': []
  'updater:quit-and-install': []
  'updater:get-version': []
  'resource-monitor:get-now': []
}

export interface IpcInvokeReturnMap {
  'chat-store:get-metadata': ChatSessionMetadata[]
  'chat-store:get-session': ChatSession | null
  'chat-store:save-session': boolean
  'chat-store:delete-session': boolean
  'chat-store:save-index': boolean
  'chat-store:get-all': ChatSession[]
  'chat-store:save-all': boolean
  'chat-store:migrate': boolean
  'chat-store:get-all-folders': Folder[]
  'chat-store:save-folders': boolean
  'chat-diagnostics:append-event': boolean
  'chat-diagnostics:get-debug-reference': string | null
  'chat-diagnostics:list-events': ChatDiagnosticEvent[]
  'chat-debug-window:open': boolean
  'secure-storage:get': string
  'secure-storage:set': boolean
  'secure-storage:get-presence': Record<SecureStorageKey, boolean>
  'secure-storage:get-all': Record<SecureStorageKey, string>
  'execute-tool': ToolResult
  'window-resize': void
  'context-menu:show': void
  'native-dialog:confirm-delete-chat': boolean
  'updater:check-for-updates': UpdateCheckInfo | null
  'updater:quit-and-install': boolean
  'updater:get-version': string
  'resource-monitor:get-now': ResourceSample
}

export type IpcOnChannel =
  | 'update-available'
  | 'update-downloaded'
  | 'update-error'
  | 'update-download-progress'
  | 'prompt-popup:focus'
  | 'overlay:pending-prompt'
  | 'model-selector:open'
  | 'app:new-chat'
  | 'settings:navigate'
  | 'chat-store:changed'
  | 'context-menu:action'
  | 'chat-diagnostics:event'
  | 'resource-monitor:sample'

export interface UpdaterDownloadProgress {
  percent: number
  transferred: number
  total: number
}

export interface IpcOnArgsMap {
  'update-available': [version: string]
  'update-downloaded': [version: string]
  'update-error': [message: string]
  'update-download-progress': [progress: UpdaterDownloadProgress]
  'prompt-popup:focus': []
  'overlay:pending-prompt': [prompt: string]
  'model-selector:open': []
  'app:new-chat': []
  'settings:navigate': [section: string]
  'chat-store:changed': []
  'context-menu:action': [action: NativeContextMenuAction]
  'chat-diagnostics:event': [event: ChatDiagnosticEvent]
  'resource-monitor:sample': [sample: ResourceSample]
}

export interface IElectronAPI {
  on: <TChannel extends IpcOnChannel>(
    channel: TChannel,
    listener: (event: unknown, ...args: IpcOnArgsMap[TChannel]) => void
  ) => void
  off: <TChannel extends IpcOnChannel>(
    channel: TChannel,
    listener: (event: unknown, ...args: IpcOnArgsMap[TChannel]) => void
  ) => void
  send: <TChannel extends IpcSendChannel>(
    channel: TChannel,
    ...args: IpcSendArgsMap[TChannel]
  ) => void
  invoke: <TChannel extends IpcInvokeChannel>(
    channel: TChannel,
    ...args: IpcInvokeArgsMap[TChannel]
  ) => Promise<IpcInvokeReturnMap[TChannel]>
}

export interface SecureStorageAPI {
  get: (key: SecureStorageKey) => Promise<string>
  set: (key: SecureStorageKey, value: string) => Promise<boolean>
  getPresence: () => Promise<Record<SecureStorageKey, boolean>>
  getAll: () => Promise<Record<SecureStorageKey, string>>
}

export interface UpdaterAPI {
  checkForUpdates: () => Promise<UpdateCheckInfo | null>
  quitAndInstall: () => Promise<boolean>
  getVersion: () => Promise<string>
  onUpdateAvailable: (callback: (version: string) => void) => () => void
  onUpdateDownloaded: (callback: (version: string) => void) => () => void
  onUpdateError: (callback: (message: string) => void) => () => void
  onUpdateProgress: (callback: (progress: UpdaterDownloadProgress) => void) => () => void
}

export interface OverlayAPI {
  show: () => Promise<OverlayState>
  hide: () => Promise<OverlayState>
  toggle: () => Promise<OverlayState>
  expand: () => Promise<OverlayState>
  collapse: () => Promise<OverlayState>
  getState: () => Promise<OverlayState>
  focusMainWindow: () => Promise<void>
  applySettings: (settings: Partial<OverlaySettings>) => Promise<OverlayState>
  onPendingPrompt: (callback: (prompt: string) => void) => () => void
  dragStart: (cursorX: number, cursorY: number) => void
  dragMove: (cursorX: number, cursorY: number) => void
  dragEnd: () => void
  navigateSettings: (section: string) => void
}

export interface PromptPopupAPI {
  show: () => Promise<void>
  hide: () => Promise<void>
  submit: (prompt: string) => Promise<void>
  openModelSelector: () => void
  onFocus: (callback: () => void) => () => void
}

export interface AppInfoAPI {
  get: () => Promise<AppRuntimeInfo>
  getMemoryReport: () => Promise<AppMemoryReport | null>
  openAboutWindow: () => Promise<void>
}

export interface WindowControlsAPI {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onWindowState: (callback: (state: { isMaximized: boolean }) => void) => () => void
}

export interface ShellAPI {
  openExternal: (url: string) => Promise<void>
  readClipboardText: () => Promise<string>
}

export interface DevToolsAPI {
  inspectElement: (x: number, y: number) => Promise<void>
}

export interface ContextMenuAPI {
  show: (request: NativeContextMenuRequest) => Promise<void>
  onAction: (callback: (action: NativeContextMenuAction) => void) => () => void
}

export interface NativeDialogAPI {
  confirmDeleteChat: () => Promise<boolean>
}

export interface AppMenuAPI {
  command: (command: AppMenuCommand) => Promise<boolean>
}

export interface CodeExecutionAPI {
  resolveApproval: (requestId: string, approved: boolean) => Promise<ApprovalDecision>
  onPendingApproval: (callback: (pending: PendingCodeApproval[]) => void) => () => void
}

export interface ComputerUseAPI {
  resolveApproval: (requestId: string, approved: boolean) => Promise<ApprovalDecision>
  onPendingApproval: (callback: (pending: PendingComputerAction[]) => void) => () => void
  onKilled: (callback: () => void) => () => void
}

/**
 * Renderer-facing bridge for the Windows-only Agent Desktop (Agent View)
 * feature. Mirrors the `window.overlay` / `window.computerUse` precedent: a
 * dedicated, allowlisted contextBridge surface with invoke methods plus
 * broadcast subscriptions. Every channel is validated in main and rejects on
 * macOS (Req 9.4). Req 9.3, 12.5.
 */
export interface AgentDesktopAPI {
  /** Return the current Agent Desktop state (`agent-desktop:get-state`). */
  getState: () => Promise<AgentDesktopState>
  /**
   * Mirror sanitized renderer preferences into the service
   * (`agent-desktop:apply-settings`, Req 10.6). Returns the applied state.
   */
  applySettings: (settings: Partial<AgentDesktopSettings>) => Promise<AgentDesktopState>
  /** Activate Take_Over (`agent-desktop:take-over`, Req 3.3). */
  takeOver: () => Promise<AgentDesktopPresenceResult>
  /** End Take_Over (`agent-desktop:end-take-over`, Req 3.9). */
  endTakeOver: () => Promise<AgentDesktopPresenceResult>
  /** Resolve a pending approval (`agent-desktop:resolve-approval`, Req 5.8). */
  resolveApproval: (requestId: string, approved: boolean) => Promise<ApprovalDecision>
  /**
   * Record the not-a-sandbox disclosure acknowledgement that gates enabling the
   * skill (`agent-desktop:acknowledge-disclosure`, Req 12.1, 12.2). Returns the
   * resulting state.
   */
  acknowledgeDisclosure: () => Promise<AgentDesktopState>
  /** Subscribe to state-change broadcasts (`agent-desktop:state-changed`). */
  onStateChange: (callback: (state: AgentDesktopState) => void) => () => void
  /** Subscribe to pending-approval broadcasts (`agent-desktop:pending-approval`). */
  onPendingApproval: (
    callback: (pending: PendingAgentDesktopAction[]) => void
  ) => () => void
  /** Subscribe to kill-switch abort broadcasts (`agent-desktop:killed`, Req 6.6). */
  onKilled: (callback: (payload: AgentDesktopKilledPayload) => void) => () => void
}


export interface McpAPI {
  listServers: () => Promise<McpServerConfig[]>
  addServer: (serverConfig: McpServerInputPayload) => Promise<McpServerConfig>
  updateServer: (serverId: string, updates: McpServerInputPayload) => Promise<McpServerConfig>
  removeServer: (serverId: string) => Promise<boolean>
  connectServer: (serverId: string) => Promise<McpServerRuntimeState>
  disconnectServer: (serverId: string) => Promise<McpServerRuntimeState>
  getState: () => Promise<McpRuntimeSnapshot>
  listTools: (serverId?: string) => Promise<McpNamespacedTool[]>
  listResources: (serverId?: string) => Promise<McpRuntimeResource[]>
  readResource: (serverId: string, uri: string) => Promise<McpResourceReadResult>
  listPrompts: (serverId?: string) => Promise<McpRuntimePrompt[]>
  getPrompt: (
    serverId: string,
    promptName: string,
    args: Record<string, unknown>
  ) => Promise<McpPromptResult>
  executeTool: (
    namespacedToolName: string,
    args: Record<string, unknown>
  ) => Promise<McpToolExecutionResult>
  resolveApproval: (requestId: string, approved: boolean) => Promise<McpApprovalDecision>
  onStateChange: (callback: (snapshot: McpRuntimeSnapshot) => void) => () => void
}


/**
 * Renderer-facing bridge for the dev-only chat diagnostics surface.
 *
 * Available only when the app is running unpacked (`!app.isPackaged`).
 * Outside dev the underlying channels are still allowlisted for type safety,
 * but main returns empty/no-op responses.
 */
export interface ChatDiagnosticsAPI {
  listEvents: (sessionId: string) => Promise<ChatDiagnosticEvent[]>
  onEvent: (callback: (event: ChatDiagnosticEvent) => void) => () => void
}


/**
 * Renderer-facing bridge for opening the dev-only chat debug BrowserWindow.
 *
 * Available only when the app is running unpacked (`!app.isPackaged`); main
 * returns `false` in packaged builds without opening anything.
 */
export interface ChatDebugAPI {
  open: (sessionId: string) => Promise<boolean>
}

/**
 * Renderer-facing bridge for the live Resource Monitor sampler.
 *
 * `subscribe` opens a stream of per-process samples; the returned function
 * unsubscribes and tears down the underlying main-process interval if no
 * other window is listening.
 */
export interface ResourceMonitorAPI {
  subscribe: (callback: (sample: ResourceSample) => void) => () => void
  getNow: () => Promise<ResourceSample>
}
