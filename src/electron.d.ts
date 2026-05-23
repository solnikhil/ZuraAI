import type {
  AppInfoAPI,
  ChatDebugAPI,
  ChatDiagnosticsAPI,
  CodeExecutionAPI,
  ComputerUseAPI,
  ContextMenuAPI,
  DevToolsAPI,
  IElectronAPI,
  McpAPI,
  MemoryAPI,
  NativeDialogAPI,
  OverlayAPI,
  PromptPopupAPI,
  ResourceMonitorAPI,
  SecureStorageAPI,
  ShellAPI,
  UpdaterAPI,
  WindowControlsAPI,
} from './electron/types'

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
    contextMenu: ContextMenuAPI
    nativeDialog: NativeDialogAPI
    mcp: McpAPI
    memory: MemoryAPI
    codeExecution: CodeExecutionAPI
    computerUse: ComputerUseAPI
    chatDiagnostics?: ChatDiagnosticsAPI
    chatDebug?: ChatDebugAPI
    resourceMonitor: ResourceMonitorAPI
  }
}

export {}
