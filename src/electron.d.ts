import type {
  AppInfoAPI,
  AppMenuAPI,
  AgentApprovalAPI,
  AgentSkillsAPI,
  AnalyticsAPI,
  BackgroundWindowAPI,
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
  ProviderRuntimeAPI,
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
    providerRuntime: ProviderRuntimeAPI
    appInfo: AppInfoAPI
    agentApproval?: AgentApprovalAPI
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
    backgroundWindow: BackgroundWindowAPI
    chatDiagnostics?: ChatDiagnosticsAPI
    chatDebug?: ChatDebugAPI
    chatLinks?: ChatLinksAPI
    discordRpc: DiscordRpcAPI
    emailNotifications: EmailNotificationsAPI
  }
}

export {}
