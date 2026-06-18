import type {
  AppInfoAPI,
  AppMenuAPI,
  AnalyticsAPI,
  ChatDebugAPI,
  ChatDiagnosticsAPI,
  CodeExecutionAPI,
  ComputerUseAPI,
  ContextMenuAPI,
  DevToolsAPI,
  DiscordRpcAPI,
  EmailNotificationsAPI,
  IElectronAPI,
  McpAPI,
  MemoryAPI,
  ScheduledTasksAPI,
  NativeDialogAPI,
  OverlayAPI,
  ResourceMonitorAPI,
  SecureStorageAPI,
  ShellAPI,
  TerminalAPI,
  UpdaterAPI,
  WindowControlsAPI,
} from './electron/types'

declare global {
  interface Window {
    ipcRenderer: IElectronAPI
    secureStorage: SecureStorageAPI
    updater: UpdaterAPI
    overlay: OverlayAPI
    appInfo: AppInfoAPI
    windowControls: WindowControlsAPI
    shell: ShellAPI
    devTools: DevToolsAPI
    contextMenu: ContextMenuAPI
    nativeDialog: NativeDialogAPI
    appMenu: AppMenuAPI
    analytics: AnalyticsAPI
    mcp: McpAPI
    memory: MemoryAPI
    scheduledTasks: ScheduledTasksAPI
    codeExecution: CodeExecutionAPI
    terminal: TerminalAPI
    computerUse: ComputerUseAPI
    chatDiagnostics?: ChatDiagnosticsAPI
    chatDebug?: ChatDebugAPI
    resourceMonitor: ResourceMonitorAPI
    discordRpc: DiscordRpcAPI
    emailNotifications: EmailNotificationsAPI
  }
}

export {}
