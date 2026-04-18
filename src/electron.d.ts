import type {
  AppInfoAPI,
  CodeExecutionAPI,
  DevToolsAPI,
  IElectronAPI,
  McpAPI,
  OverlayAPI,
  PromptPopupAPI,
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
    mcp: McpAPI
    codeExecution: CodeExecutionAPI
  }
}

export {}
