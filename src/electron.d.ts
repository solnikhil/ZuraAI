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
} from './mcp/types'

export interface IElectronAPI {
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void
    off: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void
    send: (channel: string, ...args: unknown[]) => void
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

export interface StorageStatus {
    encryptionAvailable: boolean
    storageFileExists: boolean
    storagePath: string
    keyCount: number
    lastError: string | null
}

export interface SecureStorageAPI {
    get: (key: string) => Promise<string>
    set: (key: string, value: string) => Promise<boolean>
    getAll: () => Promise<Record<string, string>>
}

export interface UpdaterAPI {
    checkForUpdates: () => Promise<unknown>
    quitAndInstall: () => Promise<boolean>
    getVersion: () => Promise<string>
    onUpdateAvailable: (callback: (version: string) => void) => () => void
    onUpdateDownloaded: (callback: (version: string) => void) => () => void
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
}

export interface OverlayState extends OverlaySettings {
    visible: boolean
    mode: 'hidden' | 'compact' | 'expanded'
    shortcutRegistered: boolean
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
}

export interface DevToolsAPI {
    inspectElement: (x: number, y: number) => Promise<void>
}

export interface McpAPI {
    listServers: () => Promise<McpServerConfig[]>
    addServer: (serverConfig: unknown) => Promise<McpServerConfig>
    updateServer: (serverId: string, updates: unknown) => Promise<McpServerConfig>
    removeServer: (serverId: string) => Promise<boolean>
    connectServer: (serverId: string) => Promise<McpServerRuntimeState>
    disconnectServer: (serverId: string) => Promise<McpServerRuntimeState>
    getState: () => Promise<McpRuntimeSnapshot>
    listTools: (serverId?: string) => Promise<McpNamespacedTool[]>
    listResources: (serverId?: string) => Promise<McpRuntimeResource[]>
    readResource: (serverId: string, uri: string) => Promise<McpResourceReadResult>
    listPrompts: (serverId?: string) => Promise<McpRuntimePrompt[]>
    getPrompt: (serverId: string, promptName: string, args: Record<string, unknown>) => Promise<McpPromptResult>
    executeTool: (namespacedToolName: string, args: Record<string, unknown>) => Promise<McpToolExecutionResult>
    resolveApproval: (requestId: string, approved: boolean) => Promise<McpApprovalDecision>
    onStateChange: (callback: (snapshot: McpRuntimeSnapshot) => void) => () => void
}

declare global {
    interface Window {
        ipcRenderer: IElectronAPI
        secureStorage: SecureStorageAPI
        updater: UpdaterAPI
overlay: OverlayAPI
        promptPopup: PromptPopupAPI
        appInfo: AppInfoAPI
        windowControls: WindowControlsAPI
        shell: ShellAPI
        devTools: DevToolsAPI
        mcp: McpAPI
    }
}
