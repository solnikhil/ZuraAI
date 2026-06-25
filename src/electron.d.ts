import type {
  AppInfoAPI,
  AppMenuAPI,
  AgentSkillsAPI,
  AnalyticsAPI,
  ChatDebugAPI,
  ChatDiagnosticsAPI,
  ChatLinksAPI,
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
  SecureStorageAPI,
  ArtifactsAPI,
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
    agentSkills: AgentSkillsAPI
    windowControls: WindowControlsAPI
    shell: ShellAPI
    artifacts: ArtifactsAPI
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
    chatLinks?: ChatLinksAPI
    discordRpc: DiscordRpcAPI
    emailNotifications: EmailNotificationsAPI
  }
}

export {}
