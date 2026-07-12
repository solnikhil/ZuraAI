import type {
  AppInfoAPI,
  AppMenuAPI,
  AgentApprovalAPI,
  AgentSkillsAPI,
  AnalyticsAPI,
  ChatDebugAPI,
  ChatDiagnosticsAPI,
  ChatLinksAPI,
  CodeExecutionAPI,
  ComputerUseAPI,
  CommandCenterAPI,
  GitHubWorkspaceApi,
  ContextMenuAPI,
  DevToolsAPI,
  DiscordRpcAPI,
  EmailNotificationsAPI,
  IElectronAPI,
  McpAPI,
  MemoryAPI,
  ScheduledTasksAPI,
  NativeDialogAPI,
  ProviderProxyAPI,
  SecureStorageAPI,
  ArtifactsAPI,
  ShellAPI,
  TerminalAPI,
  UpdaterAPI,
  WindowControlsAPI,
} from './electron/types'
import type { ZuraExtensionsApi } from './extensions/types'

declare global {
  interface Window {
    ipcRenderer: IElectronAPI
    secureStorage: SecureStorageAPI
    updater: UpdaterAPI
    providerProxy: ProviderProxyAPI
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
    commandCenter: CommandCenterAPI
    githubWorkspace: GitHubWorkspaceApi
    extensions: ZuraExtensionsApi
    chatDiagnostics?: ChatDiagnosticsAPI
    chatDebug?: ChatDebugAPI
    chatLinks?: ChatLinksAPI
    discordRpc: DiscordRpcAPI
    emailNotifications: EmailNotificationsAPI
  }
}

export {}
