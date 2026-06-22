import type { ChatIndexData, ChatSession, ChatSessionMetadata, Folder } from '../chat/types'
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
 * Pending terminal (system_shell) approval request shape (mirrors PendingTerminalApproval from main).
 */
export interface PendingTerminalApproval {
  id: string
  command: string
  cwd: string
  description: string
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

/**
 * Renderer-side Memory entry shape (mirrors the main-process Memory type in
 * electron/memoryStore.ts). v1 only writes `{ type: 'global' }` scopes; the
 * project variant is reserved for a future projects/folders feature.
 */
export type MemorySource = 'user' | 'model'

export type MemoryOrigin = 'tool' | 'background'
export type MemoryCategory = 'preference' | 'project' | 'personal' | 'workflow' | 'context'

export type MemoryScope =
  | { type: 'global' }
  | { type: 'project'; projectId: string }

export type MemoryStatus = 'active' | 'superseded'

export interface Memory {
  id: string
  content: string
  createdAt: number
  updatedAt: number
  source: MemorySource
  scope: MemoryScope
  category: MemoryCategory
  status: MemoryStatus
  supersedes?: string
  supersededBy?: string
  sessionId?: string
  origin?: MemoryOrigin
}

export interface AddMemoryInput {
  content: string
  source?: MemorySource
  scope?: MemoryScope
  category?: MemoryCategory
  sessionId?: string
  origin?: MemoryOrigin
}

export interface DedupeAddOptions {
  supersedesId?: string
}

export interface DedupeAddResult {
  memory: Memory
  operation: 'added' | 'noop' | 'superseded'
}

export interface UpdateMemoryPatch {
  content?: string
  scope?: MemoryScope
}

/** One rolling per-chat summary in the "Recent activity" (dreaming) layer. */
export interface ConversationSummary {
  sessionId: string
  summary: string
  updatedAt: number
}

export interface MemoryAPI {
  list: (scope?: MemoryScope) => Promise<Memory[]>
  add: (input: AddMemoryInput) => Promise<Memory>
  /** ADD-only write with dedupe + optional supersession (extraction pipeline). */
  addDeduped: (input: AddMemoryInput, options?: DedupeAddOptions) => Promise<DedupeAddResult>
  update: (id: string, patch: UpdateMemoryPatch) => Promise<Memory | null>
  delete: (id: string) => Promise<boolean>
  clear: () => Promise<boolean>
  search: (query: string, limit?: number, scope?: MemoryScope) => Promise<Memory[]>
  /** Layer 2 — rolling conversation summaries ("Recent activity"). */
  summaries: {
    list: () => Promise<ConversationSummary[]>
    upsert: (sessionId: string, summary: string) => Promise<ConversationSummary>
    delete: (sessionId: string) => Promise<boolean>
    clear: () => Promise<boolean>
  }
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
  | 'nvidiaApiKey'
  | 'onlineCompilerApiKey'
  | 'brevoApiKey'

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

export interface DiscordRpcSettings {
  appId: string
}

export interface DiscordRpcState {
  connected: boolean
  missingAppId: boolean
  lastError?: string
}

export interface EmailNotificationSettings {
  enabled: boolean
  senderName: string
  senderEmail: string
  recipientEmail: string
}

export interface EmailNotificationResult {
  ok: boolean
  error?: string
}

export type AnalyticsEventName =
  | 'app_first_launch'
  | 'app_start'
  | 'app_update_installed'
  | 'chat_message_sent'
  | 'provider_used'
  | 'model_used'
  | 'tool_used'
  | 'web_search_used'
  | 'mcp_server_connected'
  | 'overlay_opened'
  | 'app_error'
  | 'app_crash'

export type AnalyticsConsentState = 'undecided' | 'accepted' | 'declined'

export interface AnalyticsState {
  analyticsEnabled: boolean
  anonymousInstallId: string
  firstLaunchSent: boolean
  lastSeenVersion: string
  consentState: AnalyticsConsentState
  hasProjectKey: boolean
}

export type AnalyticsProperties = Record<string, string | number | boolean | undefined>

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
  | 'chat-remove-from-folder'
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
  isChatRowInFolder?: boolean
}

export type MonitorIntervalPreset = '1m' | '30m' | '1h' | '6h' | '12h' | 'daily' | 'weekly'
export type ScheduledTaskIntervalPreset = MonitorIntervalPreset

export type MonitorRunStatus = 'changed' | 'unchanged' | 'error'
export type ScheduledTaskStatus = MonitorRunStatus

export type MonitorUrlResultStatus = 'changed' | 'unchanged' | 'baseline' | 'error'
export type ScheduledTaskLogStatus = MonitorUrlResultStatus | 'completed'

export type ScheduledTaskType = 'web_lookout' | 'reminder'

export interface ScheduledTaskDefinition {
  id: string
  type: ScheduledTaskType
  title: string
  enabled: boolean
  urls: string[]
  reminderText?: string
  instructions: string
  intervalPreset: ScheduledTaskIntervalPreset
  createdAt: number
  updatedAt: number
  lastRunAt?: number
  nextRunAt: number
}

export interface ScheduledTaskInput {
  type: ScheduledTaskType
  title: string
  enabled?: boolean
  urls?: string[]
  reminderText?: string
  instructions?: string
  intervalPreset?: ScheduledTaskIntervalPreset
  dueAt?: number
}

export type ScheduledTaskUpdateInput = Partial<ScheduledTaskInput>

export interface ScheduledTaskLog {
  url: string
  status: ScheduledTaskLogStatus
  contentHash?: string
  previousHash?: string
  changedExcerpt?: string
  message?: string
  error?: string
}

export interface ScheduledTaskRun {
  id: string
  taskId: string
  startedAt: number
  finishedAt: number
  status: ScheduledTaskStatus
  logs: ScheduledTaskLog[]
  diffSummary?: string
  aiSummary?: string
  error?: string
}

export interface ScheduledTaskSummaryRequest {
  requestId: string
  taskId: string
  taskTitle: string
  instructions: string
  diffSummary: string
  changes: Array<{ url: string; excerpt: string }>
}

export interface ScheduledTaskSummaryResponse {
  requestId: string
  summary?: string
  error?: string
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
  | 'overlay:navigate-settings'

export interface IpcSendArgsMap {
  'overlay:drag-start': [cursorX: number, cursorY: number]
  'overlay:drag-move': [cursorX: number, cursorY: number]
  'overlay:drag-end': []
  'overlay:navigate-settings': [section: string]
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
  'discord-rpc:get-state': DiscordRpcState
  'discord-rpc:set-activity': DiscordRpcState
}

export type IpcOnChannel =
  | 'update-available'
  | 'update-downloaded'
  | 'update-error'
  | 'update-download-progress'
  | 'overlay:pending-prompt'
  | 'app:new-chat'
  | 'settings:navigate'
  | 'chat-store:changed'
  | 'context-menu:action'
  | 'chat-diagnostics:event'
  | 'discord-rpc:state-changed'

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
  'overlay:pending-prompt': [prompt: string]
  'app:new-chat': []
  'settings:navigate': [section: string]
  'chat-store:changed': []
  'context-menu:action': [action: NativeContextMenuAction]
  'chat-diagnostics:event': [event: ChatDiagnosticEvent]
  'discord-rpc:state-changed': [state: DiscordRpcState]
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
  setContentHeight: (height: number) => Promise<OverlayState>
  onPendingPrompt: (callback: (prompt: string) => void) => () => void
  dragStart: (cursorX: number, cursorY: number) => void
  dragMove: (cursorX: number, cursorY: number) => void
  dragEnd: () => void
  navigateSettings: (section: string) => void
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

export interface TerminalAPI {
  resolveApproval: (requestId: string, approved: boolean) => Promise<ApprovalDecision>
  onPendingApproval: (callback: (pending: PendingTerminalApproval[]) => void) => () => void
}

export interface ComputerUseAPI {
  resolveApproval: (requestId: string, approved: boolean) => Promise<ApprovalDecision>
  onPendingApproval: (callback: (pending: PendingComputerAction[]) => void) => () => void
  onKilled: (callback: () => void) => () => void
}

export interface EmailNotificationsAPI {
  applySettings: (settings: EmailNotificationSettings) => Promise<EmailNotificationSettings>
  sendTest: () => Promise<EmailNotificationResult>
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
 * Renderer-facing bridge for Discord Rich Presence.
 *
 * Controls connection lifecycle, activity updates, and subscribes to
 * connection-state broadcasts from the main-process client.
 */
export interface DiscordRpcAPI {
  getState: () => Promise<DiscordRpcState>
  setActivity: (activity: Record<string, unknown>) => Promise<DiscordRpcState>
  onStateChange: (callback: (state: DiscordRpcState) => void) => () => void
}

export interface ScheduledTasksAPI {
  list: () => Promise<ScheduledTaskDefinition[]>
  create: (input: ScheduledTaskInput) => Promise<ScheduledTaskDefinition>
  update: (id: string, patch: ScheduledTaskUpdateInput) => Promise<ScheduledTaskDefinition | null>
  delete: (id: string) => Promise<boolean>
  runNow: (id: string) => Promise<ScheduledTaskRun>
  listRuns: (taskId?: string) => Promise<ScheduledTaskRun[]>
  getRun: (runId: string) => Promise<ScheduledTaskRun | null>
  resolveSummary: (response: ScheduledTaskSummaryResponse) => Promise<boolean>
  onChanged: (callback: () => void) => () => void
  onSummaryRequest: (callback: (request: ScheduledTaskSummaryRequest) => void) => () => void
}

export interface AnalyticsAPI {
  getState: () => Promise<AnalyticsState>
  setEnabled: (enabled: boolean) => Promise<AnalyticsState>
  track: (eventName: AnalyticsEventName, properties?: AnalyticsProperties) => Promise<boolean>
}
