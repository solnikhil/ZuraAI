import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

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
} from '../src/mcp/types'
import type { OverlaySettings, OverlayState } from '../src/electron'

const preloadLog = (message: string) => {
  console.log(`[PRELOAD] ${message}`)
}

preloadLog('Preload script STARTED')

// Window controls API (custom title bar)
contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.invoke('window-controls:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window-controls:toggle-maximize'),
  close: () => ipcRenderer.invoke('window-controls:close'),
  isMaximized: () => ipcRenderer.invoke('window-controls:is-maximized'),
  onWindowState: (callback: (state: { isMaximized: boolean }) => void) => {
    const listener = (_event: IpcRendererEvent, state: { isMaximized: boolean }) => {
      callback(state)
    }
    ipcRenderer.on('window-controls:state', listener)
    return () => ipcRenderer.removeListener('window-controls:state', listener)
  },
})

// IPC hardening
// Only allow a small set of channels to be used by the renderer.
// This prevents arbitrary IPC access if the renderer is compromised.

const SEND_CHANNELS = new Set<string>()

const INVOKE_CHANNELS = new Set<string>([
  // Chat store
  'chat-store:get-all',
  'chat-store:save-all',
  'chat-store:migrate',
  'chat-store:get-all-folders',
  'chat-store:save-folders',

  // Secure storage
  'secure-storage:get',
  'secure-storage:set',
  'secure-storage:get-all',

  // Tools
  'execute-tool',

  // Window resize
  'window-resize',

  // Updater
  'updater:check-for-updates',
  'updater:quit-and-install',
  'updater:get-version',
])

const ON_CHANNELS = new Set<string>(['update-available', 'update-downloaded', 'prompt-popup:focus', 'overlay:pending-prompt'])

const MCP_INVOKE_CHANNELS = new Set<string>([
  'mcp:list-servers',
  'mcp:add-server',
  'mcp:update-server',
  'mcp:remove-server',
  'mcp:connect-server',
  'mcp:disconnect-server',
  'mcp:get-state',
  'mcp:list-tools',
  'mcp:list-resources',
  'mcp:read-resource',
  'mcp:list-prompts',
  'mcp:get-prompt',
  'mcp:execute-tool',
  'mcp:resolve-approval',
])

const MCP_ON_CHANNELS = new Set<string>(['mcp:state-changed'])

function assertAllowed(
  kind: 'send' | 'invoke' | 'on' | 'off',
  channel: string,
  allowed: Set<string>
) {
  if (!allowed.has(channel)) {
    throw new Error(`Blocked IPC ${kind} channel: ${channel}`)
  }
}

contextBridge.exposeInMainWorld(
  'ipcRenderer',
  Object.freeze({
    on: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => {
      assertAllowed('on', channel, ON_CHANNELS)
      ipcRenderer.on(channel, listener)
    },
    off: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => {
      assertAllowed('off', channel, ON_CHANNELS)
      ipcRenderer.off(channel, listener)
    },
    send: (channel: string, ...args: any[]) => {
      assertAllowed('send', channel, SEND_CHANNELS)
      ipcRenderer.send(channel, ...args)
    },
    invoke: (channel: string, ...args: any[]) => {
      assertAllowed('invoke', channel, INVOKE_CHANNELS)

      // Extra validation for tool execution
      if (channel === 'execute-tool') {
        const toolName = args[0]
        if (toolName !== 'web_search') {
          return Promise.resolve({
            success: false,
            error: `Tool "${String(toolName)}" is disabled.`,
          })
        }
      }

      return ipcRenderer.invoke(channel, ...args)
    },
  })
)

// Secure storage API
contextBridge.exposeInMainWorld(
  'secureStorage',
  Object.freeze({
    get: (key: string) => ipcRenderer.invoke('secure-storage:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('secure-storage:set', key, value),
    getAll: () => ipcRenderer.invoke('secure-storage:get-all'),
  })
)

// Auto-updater API
contextBridge.exposeInMainWorld(
  'updater',
  Object.freeze({
    checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
    getVersion: () => ipcRenderer.invoke('updater:get-version'),
    onUpdateAvailable: (callback: (version: string) => void) => {
      const listener = (_event: IpcRendererEvent, version: string) => callback(version)
      ipcRenderer.on('update-available', listener)
      return () => ipcRenderer.off('update-available', listener)
    },
    onUpdateDownloaded: (callback: (version: string) => void) => {
      const listener = (_event: IpcRendererEvent, version: string) => callback(version)
      ipcRenderer.on('update-downloaded', listener)
      return () => ipcRenderer.off('update-downloaded', listener)
    },
  })
)

contextBridge.exposeInMainWorld(
  'overlay',
  Object.freeze({
    show: () => ipcRenderer.invoke('overlay:show') as Promise<OverlayState>,
    hide: () => ipcRenderer.invoke('overlay:hide') as Promise<OverlayState>,
    toggle: () => ipcRenderer.invoke('overlay:toggle') as Promise<OverlayState>,
    expand: () => ipcRenderer.invoke('overlay:expand') as Promise<OverlayState>,
    collapse: () => ipcRenderer.invoke('overlay:collapse') as Promise<OverlayState>,
    getState: () => ipcRenderer.invoke('overlay:get-state') as Promise<OverlayState>,
    focusMainWindow: () => ipcRenderer.invoke('overlay:focus-main-window') as Promise<void>,
    applySettings: (settings: Partial<OverlaySettings>) =>
      ipcRenderer.invoke('overlay:apply-settings', settings) as Promise<OverlayState>,
    onPendingPrompt: (callback: (prompt: string) => void) => {
      const listener = (_event: IpcRendererEvent, prompt: string) => callback(prompt)
      ipcRenderer.on('overlay:pending-prompt', listener)
      return () => ipcRenderer.removeListener('overlay:pending-prompt', listener)
    },
  })
)

contextBridge.exposeInMainWorld(
  'appInfo',
  Object.freeze({
    get: () => ipcRenderer.invoke('app-info:get'),
    openAboutWindow: () => ipcRenderer.invoke('app-info:open-about-window'),
  })
)

contextBridge.exposeInMainWorld(
  'promptPopup',
  Object.freeze({
    show: () => ipcRenderer.invoke('prompt-popup:show') as Promise<void>,
    hide: () => ipcRenderer.invoke('prompt-popup:hide') as Promise<void>,
    submit: (prompt: string) => ipcRenderer.invoke('prompt-popup:submit', prompt) as Promise<void>,
    onFocus: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('prompt-popup:focus', listener)
      return () => ipcRenderer.removeListener('prompt-popup:focus', listener)
    },
  })
)

contextBridge.exposeInMainWorld(
  'shell',
  Object.freeze({
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  })
)

contextBridge.exposeInMainWorld(
  'devTools',
  Object.freeze({
    inspectElement: (x: number, y: number) => ipcRenderer.invoke('devtools:inspect-element', x, y),
  })
)

contextBridge.exposeInMainWorld(
  'mcp',
  Object.freeze({
    listServers: () => {
      assertAllowed('invoke', 'mcp:list-servers', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:list-servers') as Promise<McpServerConfig[]>
    },
    addServer: (serverConfig: unknown) => {
      assertAllowed('invoke', 'mcp:add-server', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:add-server', serverConfig) as Promise<McpServerConfig>
    },
    updateServer: (serverId: string, updates: unknown) => {
      assertAllowed('invoke', 'mcp:update-server', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:update-server', serverId, updates) as Promise<McpServerConfig>
    },
    removeServer: (serverId: string) => {
      assertAllowed('invoke', 'mcp:remove-server', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:remove-server', serverId) as Promise<boolean>
    },
    connectServer: (serverId: string) => {
      assertAllowed('invoke', 'mcp:connect-server', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:connect-server', serverId) as Promise<McpServerRuntimeState>
    },
    disconnectServer: (serverId: string) => {
      assertAllowed('invoke', 'mcp:disconnect-server', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:disconnect-server', serverId) as Promise<McpServerRuntimeState>
    },
    getState: () => {
      assertAllowed('invoke', 'mcp:get-state', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:get-state') as Promise<McpRuntimeSnapshot>
    },
    listTools: (serverId?: string) => {
      assertAllowed('invoke', 'mcp:list-tools', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:list-tools', serverId) as Promise<McpNamespacedTool[]>
    },
    listResources: (serverId?: string) => {
      assertAllowed('invoke', 'mcp:list-resources', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:list-resources', serverId) as Promise<McpRuntimeResource[]>
    },
    readResource: (serverId: string, uri: string) => {
      assertAllowed('invoke', 'mcp:read-resource', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:read-resource', serverId, uri) as Promise<McpResourceReadResult>
    },
    listPrompts: (serverId?: string) => {
      assertAllowed('invoke', 'mcp:list-prompts', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:list-prompts', serverId) as Promise<McpRuntimePrompt[]>
    },
    getPrompt: (serverId: string, promptName: string, args: Record<string, unknown>) => {
      assertAllowed('invoke', 'mcp:get-prompt', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:get-prompt', serverId, promptName, args) as Promise<McpPromptResult>
    },
    executeTool: (namespacedToolName: string, args: Record<string, unknown>) => {
      assertAllowed('invoke', 'mcp:execute-tool', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:execute-tool', namespacedToolName, args) as Promise<McpToolExecutionResult>
    },
    resolveApproval: (requestId: string, approved: boolean) => {
      assertAllowed('invoke', 'mcp:resolve-approval', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:resolve-approval', requestId, approved) as Promise<McpApprovalDecision>
    },
    onStateChange: (callback: (snapshot: McpRuntimeSnapshot) => void) => {
      assertAllowed('on', 'mcp:state-changed', MCP_ON_CHANNELS)
      const listener = (_event: IpcRendererEvent, snapshot: McpRuntimeSnapshot) => {
        callback(snapshot)
      }
      ipcRenderer.on('mcp:state-changed', listener)
      return () => {
        assertAllowed('off', 'mcp:state-changed', MCP_ON_CHANNELS)
        ipcRenderer.removeListener('mcp:state-changed', listener)
      }
    },
  })
)
