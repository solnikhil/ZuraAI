import type { ChatIndexData, ChatSession, ChatSessionMetadata, Folder } from '../chat/types'
import type { ChatDiagnosticEvent } from '../diagnostics/chatDiagnostics'
import type {
  McpApprovalDecision,
  McpAuthStatus,
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
import type { McpAgentAddApproveResult, McpAgentAddReview } from '../mcp/addRequestTypes'
import type { ToolResult } from '../tools/types'
import type { BuiltinMainToolName } from '../tools/builtinMainToolContract'
import type { ProviderRuntimeStreamRequest } from '../providers/providerRuntimeTypes'
import type { ProviderStreamEvent, SerializedProviderError } from '@zura/provider-core'
import type {
  AgentSkillActivationResult,
  AgentSkillInstallResult,
  AgentSkillsListResult,
  AgentSkillSearchResult,
  AgentSkillScope,
} from '../agentSkills/types'

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

export interface AgentApprovalOverlayRequest {
  id: string
  title: string
  summary: string
  toolName: string
  kind: string
  arguments: Array<{ label: string; value: string }>
  /** Exact validated model arguments. Main binds any approval token to this payload. */
  toolArguments: Record<string, unknown>
}

export interface AgentApprovalOverlayDecision {
  approved: boolean
  trusted?: boolean
  /** Main-owned, one-use authorization bound to the sender, tool, and exact arguments. */
  approvalToken?: string
}

export interface BuiltinToolExecutionContext {
  approvalToken?: string
  /** Opaque ChatRunController identity; never included in model-visible arguments. */
  runId?: string
  agentSkills?: {
    projectRoot?: string
    disabledSkillNames?: string[]
  }
}

export type BackgroundWindowRunOutcome = 'completed' | 'cancelled' | 'failed'

export interface BackgroundWindowRunStoppedEvent {
  runId: string
  reason: 'stop-and-release' | 'stop-task' | 'target-lost' | 'overlay-failed'
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
 * electron/memoryStore.ts). Folder chats use project scopes so memory can be
 * recalled inside that workspace while optional global memory remains visible.
 */
export type MemorySource = 'user' | 'model'

export type MemoryOrigin = 'tool' | 'background'
export type MemoryCategory = 'preference' | 'project' | 'personal' | 'workflow' | 'context'

export type MemoryScope =
  | { type: 'global' }
  | { type: 'project'; projectId: string; includeGlobal?: boolean }

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
  | 'groqApiKey'
  | 'tavilyApiKey'
  | 'alibabaApiKey'
  | 'deepseekApiKey'
  | 'opencodeGoApiKey'
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

export interface AgentSkillsQuery {
  projectRoot?: string
  disabledSkillNames?: string[]
}

export interface AgentSkillsAPI {
  list: (query?: AgentSkillsQuery) => Promise<AgentSkillsListResult>
  activate: (name: string) => Promise<AgentSkillActivationResult>
  selectProjectRoot: () => Promise<string>
  clearProjectRoot: () => Promise<string>
  search: (query: string) => Promise<AgentSkillSearchResult>
  install: (
    packageRef: string,
    target: AgentSkillScope,
    projectRoot?: string
  ) => Promise<AgentSkillInstallResult>
}

export interface ProviderRuntimeStartRequest extends Omit<ProviderRuntimeStreamRequest, 'signal'> {
  requestId: string
  ollamaUrl?: string
  alibabaRegion?: import('../services/alibabaEndpoints').AlibabaRegion
  openRouterDebug?: boolean
}

export interface ProviderRuntimeGenerateRequest {
  requestId: string
  provider: import('../providers/providerTypes').ActiveProviderId
  model: string
  prompt: string
  maxTokens?: number
  jsonMode?: boolean
  ollamaUrl?: string
  alibabaRegion?: import('../services/alibabaEndpoints').AlibabaRegion
}

export interface ProviderRuntimeListModelsRequest {
  requestId: string
  provider: import('../providers/providerTypes').ActiveProviderId
  ollamaUrl?: string
}

export type ProviderRuntimeBridgeEvent =
  | {
      requestId: string
      type: 'event'
      event: Exclude<ProviderStreamEvent, { type: 'error' }>
    }
  | { requestId: string; type: 'error'; error: SerializedProviderError }
  | { requestId: string; type: 'done' }

export interface ProviderRuntimeAPI {
  start: (request: ProviderRuntimeStartRequest) => Promise<boolean>
  generate: (request: ProviderRuntimeGenerateRequest) => Promise<string>
  listModels: (request: ProviderRuntimeListModelsRequest) => Promise<unknown[]>
  signInCodex: () => Promise<boolean>
  getCodexAuthStatus: () => Promise<{ signedIn: boolean }>
  signOutCodex: () => Promise<boolean>
  cancel: (requestId: string) => Promise<boolean>
  onEvent: (callback: (event: ProviderRuntimeBridgeEvent) => void) => () => void
}

export interface ExternalChatMessageRequest {
  sessionId: string
  message?: string
  createIfMissing?: boolean
  receivedAt: number
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

export type ScheduledTaskType = 'web_lookout' | 'reminder' | 'ai_automation'
export type ScheduledAutomationMode = 'prompt' | 'watch' | 'agent'
export type ScheduledAutomationApprovalMode = 'read_only' | 'ask_each_run' | 'trusted_repeat'
export type ScheduledAutomationOutputDestination =
  | 'log'
  | 'notification'
  | 'email'
  | 'chat'
  | 'artifact'
export type ScheduledAutomationNotifyPolicy = 'every_run' | 'meaningful_change' | 'error_only'

export interface ScheduledAutomationSchedule {
  kind: 'interval' | 'daily' | 'weekly' | 'once'
  intervalPreset?: ScheduledTaskIntervalPreset
  timeOfDay?: string
  weekdays?: number[]
  timezone?: string
  workHours?: {
    enabled: boolean
    start: string
    end: string
  }
}

export interface ScheduledAutomationContextSource {
  type: 'current_datetime' | 'folder_memory' | 'chat' | 'url' | 'file' | 'mcp_resource'
  id?: string
  label?: string
  value?: string
}

export interface ScheduledAutomationBudgets {
  timeoutMs?: number
  maxToolCalls?: number
  maxWebSearches?: number
  maxTokens?: number
}

export interface ScheduledTaskDefinition {
  id: string
  type: ScheduledTaskType
  title: string
  enabled: boolean
  urls: string[]
  reminderText?: string
  instructions: string
  intervalPreset: ScheduledTaskIntervalPreset
  schedule?: ScheduledAutomationSchedule
  prompt?: string
  automationMode?: ScheduledAutomationMode
  contextSources?: ScheduledAutomationContextSource[]
  allowedTools?: string[]
  approvalMode?: ScheduledAutomationApprovalMode
  outputDestinations?: ScheduledAutomationOutputDestination[]
  notifyPolicy?: ScheduledAutomationNotifyPolicy
  budgets?: ScheduledAutomationBudgets
  automationChatSessionId?: string
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
  schedule?: ScheduledAutomationSchedule
  prompt?: string
  automationMode?: ScheduledAutomationMode
  contextSources?: ScheduledAutomationContextSource[]
  allowedTools?: string[]
  approvalMode?: ScheduledAutomationApprovalMode
  outputDestinations?: ScheduledAutomationOutputDestination[]
  notifyPolicy?: ScheduledAutomationNotifyPolicy
  budgets?: ScheduledAutomationBudgets
  automationChatSessionId?: string
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
  promptSnapshot?: string
  resolvedContextSummary?: string
  model?: string
  provider?: string
  outputText?: string
  automationChatSessionId?: string
  artifactIds?: string[]
  generatedFiles?: Array<{ id: string; name: string; type?: string }>
  toolCallSummaries?: Array<{ name: string; success: boolean; error?: string }>
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    cost?: number
  }
  changeVerdict?: {
    changed: boolean
    summary?: string
  }
  deliveryStatus?: Partial<
    Record<ScheduledAutomationOutputDestination, 'sent' | 'skipped' | 'error'>
  >
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

export interface ScheduledAutomationRunRequest {
  requestId: string
  taskId: string
  taskTitle: string
  prompt: string
  instructions: string
  automationMode: ScheduledAutomationMode
  contextSources: ScheduledAutomationContextSource[]
  allowedTools: string[]
  approvalMode: ScheduledAutomationApprovalMode
  outputDestinations: ScheduledAutomationOutputDestination[]
  notifyPolicy: ScheduledAutomationNotifyPolicy
  budgets: ScheduledAutomationBudgets
  previousOutput?: string
}

export interface ScheduledAutomationRunResponse {
  requestId: string
  outputText?: string
  automationChatSessionId?: string
  resolvedContextSummary?: string
  model?: string
  provider?: string
  artifactIds?: string[]
  generatedFiles?: Array<{ id: string; name: string; type?: string }>
  toolCallSummaries?: Array<{ name: string; success: boolean; error?: string }>
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    cost?: number
  }
  changeVerdict?: {
    changed: boolean
    summary?: string
  }
  deliveryStatus?: Partial<
    Record<ScheduledAutomationOutputDestination, 'sent' | 'skipped' | 'error'>
  >
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

export type IpcSendChannel = never

export type IpcSendArgsMap = Record<never, never>

export type IpcInvokeChannel =
  | 'chat-store:get-metadata'
  | 'chat-store:get-session'
  | 'chat-store:save-session'
  | 'chat-store:delete-session'
  | 'chat-store:save-index'
  | 'chat-store:get-all'
  | 'chat-store:get-usage-sessions'
  | 'chat-store:save-all'
  | 'chat-store:migrate'
  | 'chat-store:get-all-folders'
  | 'chat-store:save-folders'
  | 'tool-media:load'
  | 'chat-diagnostics:append-event'
  | 'chat-diagnostics:get-debug-reference'
  | 'chat-diagnostics:list-events'
  | 'chat-debug-window:open'
  | 'chat-links:consume-pending'
  | 'chat-links:peek-pending'
  | 'secure-storage:set'
  | 'secure-storage:get-presence'
  | 'execute-tool'
  | 'window-resize'
  | 'context-menu:show'
  | 'native-dialog:confirm-delete-chat'
  | 'updater:check-for-updates'
  | 'updater:quit-and-install'
  | 'updater:get-version'
  | 'provider-runtime:start'
  | 'provider-runtime:generate'
  | 'provider-runtime:list-models'
  | 'provider-runtime:codex-sign-in'
  | 'provider-runtime:codex-auth-status'
  | 'provider-runtime:codex-sign-out'
  | 'provider-runtime:cancel'

export interface IpcInvokeArgsMap {
  'chat-store:get-metadata': []
  'chat-store:get-session': [sessionId: string, options?: { limit?: number }]
  'chat-store:save-session': [session: ChatSession]
  'chat-store:delete-session': [sessionId: string]
  'chat-store:save-index': [index: ChatIndexData]
  'chat-store:get-all': []
  'chat-store:get-usage-sessions': []
  'chat-store:save-all': [sessions: ChatSession[]]
  'chat-store:migrate': [localStorageData: ChatSession[]]
  'chat-store:get-all-folders': []
  'chat-store:save-folders': [folders: Folder[]]
  'tool-media:load': [mediaRef: string]
  'chat-diagnostics:append-event': [event: ChatDiagnosticEvent]
  'chat-diagnostics:get-debug-reference': [sessionId: string]
  'chat-diagnostics:list-events': [sessionId: string]
  'chat-debug-window:open': [sessionId: string]
  'chat-links:consume-pending': []
  'chat-links:peek-pending': []
  'secure-storage:set': [key: SecureStorageKey, value: string]
  'secure-storage:get-presence': []
  'execute-tool': [
    toolName: BuiltinMainToolName,
    args: Record<string, unknown>,
    executionContext?: BuiltinToolExecutionContext,
  ]
  'window-resize': [newBounds: WindowBounds]
  'context-menu:show': [request: NativeContextMenuRequest]
  'native-dialog:confirm-delete-chat': []
  'updater:check-for-updates': []
  'updater:quit-and-install': []
  'updater:get-version': []
  'provider-runtime:start': [request: ProviderRuntimeStartRequest]
  'provider-runtime:generate': [request: ProviderRuntimeGenerateRequest]
  'provider-runtime:list-models': [request: ProviderRuntimeListModelsRequest]
  'provider-runtime:codex-sign-in': []
  'provider-runtime:codex-auth-status': []
  'provider-runtime:codex-sign-out': []
  'provider-runtime:cancel': [requestId: string]
}

export interface IpcInvokeReturnMap {
  'chat-store:get-metadata': ChatSessionMetadata[]
  'chat-store:get-session': ChatSession | null
  'chat-store:save-session': boolean
  'chat-store:delete-session': boolean
  'chat-store:save-index': boolean
  'chat-store:get-all': ChatSession[]
  'chat-store:get-usage-sessions': ChatSession[]
  'chat-store:save-all': boolean
  'chat-store:migrate': boolean
  'chat-store:get-all-folders': Folder[]
  'chat-store:save-folders': boolean
  'tool-media:load': string | null
  'chat-diagnostics:append-event': boolean
  'chat-diagnostics:get-debug-reference': string | null
  'chat-diagnostics:list-events': ChatDiagnosticEvent[]
  'chat-debug-window:open': boolean
  'chat-links:consume-pending': ExternalChatMessageRequest[]
  'chat-links:peek-pending': ExternalChatMessageRequest[]
  'secure-storage:set': boolean
  'secure-storage:get-presence': Record<SecureStorageKey, boolean>
  'execute-tool': ToolResult
  'window-resize': void
  'context-menu:show': void
  'native-dialog:confirm-delete-chat': boolean
  'updater:check-for-updates': UpdateCheckInfo | null
  'updater:quit-and-install': boolean
  'updater:get-version': string
  'provider-runtime:start': boolean
  'provider-runtime:generate': string
  'provider-runtime:list-models': unknown[]
  'provider-runtime:codex-sign-in': boolean
  'provider-runtime:codex-auth-status': { signedIn: boolean }
  'provider-runtime:codex-sign-out': boolean
  'provider-runtime:cancel': boolean
  'discord-rpc:get-state': DiscordRpcState
  'discord-rpc:set-activity': DiscordRpcState
}

export type IpcOnChannel =
  | 'update-available'
  | 'update-downloaded'
  | 'update-error'
  | 'update-download-progress'
  | 'app:new-chat'
  | 'settings:navigate'
  | 'chat-store:changed'
  | 'context-menu:action'
  | 'chat-diagnostics:event'
  | 'chat-links:message'
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
  'app:new-chat': []
  'settings:navigate': [section: string]
  'chat-store:changed': []
  'context-menu:action': [action: NativeContextMenuAction]
  'chat-diagnostics:event': [event: ChatDiagnosticEvent]
  'chat-links:message': [request: ExternalChatMessageRequest]
  'discord-rpc:state-changed': [state: DiscordRpcState]
}

export interface IElectronAPI {
  on: <TChannel extends IpcOnChannel>(
    channel: TChannel,
    listener: (...args: IpcOnArgsMap[TChannel]) => void
  ) => () => void
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
  set: (key: SecureStorageKey, value: string) => Promise<boolean>
  getPresence: () => Promise<Record<SecureStorageKey, boolean>>
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
  setAppearance: (appearance: WindowAppearance) => Promise<boolean>
  onWindowState: (callback: (state: { isMaximized: boolean }) => void) => () => void
}

export interface WindowAppearance {
  material: 'solid' | 'acrylic'
  themeSource: 'light' | 'dark' | 'system'
}

export interface ShellAPI {
  openExternal: (url: string) => Promise<void>
  readClipboardText: () => Promise<string>
}

export interface OpenArtifactExternallyInput {
  sessionId: string
  artifactId: string
  title: string
  kind: import('../artifacts/artifactTypes').ArtifactKind
  language?: string
  content: string
}

export interface OpenArtifactExternallyResult {
  ok: boolean
  path?: string
  error?: string
}

export interface ArtifactsAPI {
  openExternally: (payload: OpenArtifactExternallyInput) => Promise<OpenArtifactExternallyResult>
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

export interface BackgroundWindowAPI {
  releaseRun: (runId: string, outcome: BackgroundWindowRunOutcome) => Promise<boolean>
  onRunStopped: (callback: (event: BackgroundWindowRunStoppedEvent) => void) => () => void
}

export interface AgentApprovalAPI {
  requestApproval: (request: AgentApprovalOverlayRequest) => Promise<AgentApprovalOverlayDecision>
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
  openConfigFile: () => Promise<{ ok: boolean; path?: string; error?: string }>
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
  startOAuth: (serverId: string) => Promise<{ ok: boolean; status: McpAuthStatus; error?: string }>
  clearOAuth: (serverId: string) => Promise<McpAuthStatus>
  getAuthStatus: (serverId: string) => Promise<McpAuthStatus>
  resolveAddRequest: (requestId: string) => Promise<McpAgentAddReview>
  approveAddRequest: (requestId: string) => Promise<McpAgentAddApproveResult>
  cancelAddRequest: (requestId: string) => Promise<McpAgentAddReview>
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

export interface ChatLinksAPI {
  consumePending: () => Promise<ExternalChatMessageRequest[]>
  peekPending: () => Promise<ExternalChatMessageRequest[]>
  onMessage: (callback: (request: ExternalChatMessageRequest) => void) => () => void
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
  setExtensionEnabled: (enabled: boolean) => Promise<boolean>
  list: () => Promise<ScheduledTaskDefinition[]>
  create: (input: ScheduledTaskInput) => Promise<ScheduledTaskDefinition>
  update: (id: string, patch: ScheduledTaskUpdateInput) => Promise<ScheduledTaskDefinition | null>
  delete: (id: string) => Promise<boolean>
  runNow: (id: string) => Promise<ScheduledTaskRun>
  listRuns: (taskId?: string) => Promise<ScheduledTaskRun[]>
  getRun: (runId: string) => Promise<ScheduledTaskRun | null>
  resolveSummary: (response: ScheduledTaskSummaryResponse) => Promise<boolean>
  resolveAutomationRun: (response: ScheduledAutomationRunResponse) => Promise<boolean>
  onChanged: (callback: () => void) => () => void
  onSummaryRequest: (callback: (request: ScheduledTaskSummaryRequest) => void) => () => void
  onAutomationRunRequest: (callback: (request: ScheduledAutomationRunRequest) => void) => () => void
}

export interface AnalyticsAPI {
  getState: () => Promise<AnalyticsState>
  setEnabled: (enabled: boolean) => Promise<AnalyticsState>
  track: (eventName: AnalyticsEventName, properties?: AnalyticsProperties) => Promise<boolean>
}
