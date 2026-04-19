import type { ChatSession, Folder } from '../chat/types'
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

export type SecureStorageKey =
  | 'openRouterApiKey'
  | 'perplexityApiKey'
  | 'groqApiKey'
  | 'tavilyApiKey'
  | 'alibabaApiKey'
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
  | 'chat-store:get-all'
  | 'chat-store:save-all'
  | 'chat-store:migrate'
  | 'chat-store:get-all-folders'
  | 'chat-store:save-folders'
  | 'secure-storage:get'
  | 'secure-storage:set'
  | 'secure-storage:get-all'
  | 'execute-tool'
  | 'window-resize'
  | 'updater:check-for-updates'
  | 'updater:quit-and-install'
  | 'updater:get-version'

export interface IpcInvokeArgsMap {
  'chat-store:get-all': []
  'chat-store:save-all': [sessions: ChatSession[]]
  'chat-store:migrate': [localStorageData: ChatSession[]]
  'chat-store:get-all-folders': []
  'chat-store:save-folders': [folders: Folder[]]
  'secure-storage:get': [key: SecureStorageKey]
  'secure-storage:set': [key: SecureStorageKey, value: string]
  'secure-storage:get-all': []
  'execute-tool': [toolName: string, args: Record<string, unknown>]
  'window-resize': [newBounds: WindowBounds]
  'updater:check-for-updates': []
  'updater:quit-and-install': []
  'updater:get-version': []
}

export interface IpcInvokeReturnMap {
  'chat-store:get-all': ChatSession[]
  'chat-store:save-all': boolean
  'chat-store:migrate': boolean
  'chat-store:get-all-folders': Folder[]
  'chat-store:save-folders': boolean
  'secure-storage:get': string
  'secure-storage:set': boolean
  'secure-storage:get-all': Record<SecureStorageKey, string>
  'execute-tool': ToolResult
  'window-resize': void
  'updater:check-for-updates': unknown
  'updater:quit-and-install': boolean
  'updater:get-version': string
}

export type IpcOnChannel =
  | 'update-available'
  | 'update-downloaded'
  | 'prompt-popup:focus'
  | 'overlay:pending-prompt'
  | 'model-selector:open'
  | 'settings:navigate'
  | 'chat-store:changed'

export interface IpcOnArgsMap {
  'update-available': [version: string]
  'update-downloaded': [version: string]
  'prompt-popup:focus': []
  'overlay:pending-prompt': [prompt: string]
  'model-selector:open': []
  'settings:navigate': [section: string]
  'chat-store:changed': []
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
  getAll: () => Promise<Record<SecureStorageKey, string>>
}

export interface UpdaterAPI {
  checkForUpdates: () => Promise<unknown>
  quitAndInstall: () => Promise<boolean>
  getVersion: () => Promise<string>
  onUpdateAvailable: (callback: (version: string) => void) => () => void
  onUpdateDownloaded: (callback: (version: string) => void) => () => void
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

export interface CodeExecutionAPI {
  resolveApproval: (requestId: string, approved: boolean) => Promise<unknown>
  onPendingApproval: (callback: (pending: unknown[]) => void) => () => void
}

export interface ComputerUseAPI {
  resolveApproval: (requestId: string, approved: boolean) => Promise<unknown>
  onPendingApproval: (callback: (pending: unknown[]) => void) => () => void
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
