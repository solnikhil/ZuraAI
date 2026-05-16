import type { ChatIndexData, ChatSession, ChatSessionMetadata, Folder } from '../chat/types'
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

export type IpcSendChannel =
  | 'overlay:drag-start'
  | 'overlay:drag-move'
  | 'overlay:drag-end'
  | 'open-model-selector'
  | 'overlay:navigate-settings'

export interface IpcSendArgsMap {
  'overlay:drag-start': [cursorX: number, cursorY: number]
  'overlay:drag-move': [cursorX: number, cursorY: number]
  'overlay:drag-end': []
  'open-model-selector': []
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
  | 'secure-storage:get'
  | 'secure-storage:set'
  | 'secure-storage:get-presence'
  | 'secure-storage:get-all'
  | 'execute-tool'
  | 'window-resize'
  | 'context-menu:show'
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
  'secure-storage:get': [key: SecureStorageKey]
  'secure-storage:set': [key: SecureStorageKey, value: string]
  'secure-storage:get-presence': []
  'secure-storage:get-all': []
  'execute-tool': [toolName: string, args: Record<string, unknown>]
  'window-resize': [newBounds: WindowBounds]
  'context-menu:show': [request: NativeContextMenuRequest]
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
  'secure-storage:get': string
  'secure-storage:set': boolean
  'secure-storage:get-presence': Record<SecureStorageKey, boolean>
  'secure-storage:get-all': Record<SecureStorageKey, string>
  'execute-tool': ToolResult
  'window-resize': void
  'context-menu:show': void
  'updater:check-for-updates': UpdateCheckInfo | null
  'updater:quit-and-install': boolean
  'updater:get-version': string
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

export interface CodeExecutionAPI {
  resolveApproval: (requestId: string, approved: boolean) => Promise<ApprovalDecision>
  onPendingApproval: (callback: (pending: PendingCodeApproval[]) => void) => () => void
}

export interface ComputerUseAPI {
  resolveApproval: (requestId: string, approved: boolean) => Promise<ApprovalDecision>
  onPendingApproval: (callback: (pending: PendingComputerAction[]) => void) => () => void
  onKilled: (callback: () => void) => () => void
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
