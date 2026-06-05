import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

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
import type {
  IpcInvokeArgsMap,
  IpcInvokeChannel,
  IpcOnArgsMap,
  IpcOnChannel,
  IpcSendArgsMap,
  IpcSendChannel,
  AddMemoryInput,
  AgentDesktopKilledPayload,
  AgentDesktopPresenceResult,
  AgentDesktopSettings,
  AgentDesktopState,
  AppMenuCommand,
  ApprovalDecision,
  Memory,
  MemoryScope,
  OverlaySettings,
  OverlayState,
  PendingAgentDesktopAction,
  PendingCodeApproval,
  PendingComputerAction,
  ResourceSample,
  UpdateMemoryPatch,
} from '../src/electron/types'

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

const SEND_CHANNELS = new Set<IpcSendChannel>([
  'overlay:drag-start',
  'overlay:drag-move',
  'overlay:drag-end',
  'open-model-selector',
  'overlay:navigate-settings',
  'resource-monitor:subscribe',
  'resource-monitor:unsubscribe',
])

const INVOKE_CHANNELS = new Set<IpcInvokeChannel>([
  // Chat store
  'chat-store:get-metadata',
  'chat-store:get-session',
  'chat-store:save-session',
  'chat-store:delete-session',
  'chat-store:save-index',
  'chat-store:get-all',
  'chat-store:save-all',
  'chat-store:migrate',
  'chat-store:get-all-folders',
  'chat-store:save-folders',
  'chat-diagnostics:append-event',
  'chat-diagnostics:get-debug-reference',
  'chat-diagnostics:list-events',
  'chat-debug-window:open',

  // Secure storage
  'secure-storage:get',
  'secure-storage:set',
  'secure-storage:get-presence',
  'secure-storage:get-all',

  // Tools
  'execute-tool',

  // Window resize
  'window-resize',
  'context-menu:show',
  'native-dialog:confirm-delete-chat',

  // Updater
  'updater:check-for-updates',
  'updater:quit-and-install',
  'updater:get-version',

  // Resource monitor
  'resource-monitor:get-now',
])

const ON_CHANNELS = new Set<IpcOnChannel>([
  'update-available',
  'update-downloaded',
  'update-error',
  'update-download-progress',
  'prompt-popup:focus',
  'overlay:pending-prompt',
  'model-selector:open',
  'app:new-chat',
  'settings:navigate',
  'chat-store:changed',
  'context-menu:action',
  'chat-diagnostics:event',
  'resource-monitor:sample',
])

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

const MEMORY_INVOKE_CHANNELS = new Set<string>([
  'memory:list',
  'memory:add',
  'memory:add-deduped',
  'memory:update',
  'memory:delete',
  'memory:clear',
  'memory:search',
  'memory:summaries-list',
  'memory:summaries-upsert',
])

const MEMORY_ON_CHANNELS = new Set<string>(['memory-store:changed'])

// Agent Desktop (Agent View) — dedicated, allowlisted bridge mirroring the
// `window.overlay` / `window.computerUse` precedent. Windows-only in practice
// (handlers are not registered on macOS), but the bridge is always exposed and
// every channel is validated + macOS-rejected in main. Req 9.3, 12.5.
const AGENT_DESKTOP_INVOKE_CHANNELS = new Set<string>([
  'agent-desktop:get-state',
  'agent-desktop:apply-settings',
  'agent-desktop:take-over',
  'agent-desktop:end-take-over',
  'agent-desktop:resolve-approval',
  'agent-desktop:acknowledge-disclosure',
])

const AGENT_DESKTOP_ON_CHANNELS = new Set<string>([
  'agent-desktop:state-changed',
  'agent-desktop:pending-approval',
  'agent-desktop:killed',
])

function assertAllowed<TChannel extends string>(
  kind: 'send' | 'invoke' | 'on' | 'off',
  channel: TChannel,
  allowed: Set<TChannel>
) {
  if (!allowed.has(channel)) {
    throw new Error(`Blocked IPC ${kind} channel: ${channel}`)
  }
}

contextBridge.exposeInMainWorld(
  'ipcRenderer',
  Object.freeze({
    on: <TChannel extends IpcOnChannel>(
      channel: TChannel,
      listener: (event: IpcRendererEvent, ...args: IpcOnArgsMap[TChannel]) => void
    ) => {
      assertAllowed('on', channel, ON_CHANNELS)
      ipcRenderer.on(channel, listener)
    },
    off: <TChannel extends IpcOnChannel>(
      channel: TChannel,
      listener: (event: IpcRendererEvent, ...args: IpcOnArgsMap[TChannel]) => void
    ) => {
      assertAllowed('off', channel, ON_CHANNELS)
      ipcRenderer.off(channel, listener)
    },
    send: <TChannel extends IpcSendChannel>(channel: TChannel, ...args: IpcSendArgsMap[TChannel]) => {
      assertAllowed('send', channel, SEND_CHANNELS)
      ipcRenderer.send(channel, ...args)
    },
    invoke: <TChannel extends IpcInvokeChannel>(
      channel: TChannel,
      ...args: IpcInvokeArgsMap[TChannel]
    ) => {
      assertAllowed('invoke', channel, INVOKE_CHANNELS)

      // Extra validation for tool execution
      if (channel === 'execute-tool') {
        const toolName = args[0]
        const isNativeWindowsTool =
          typeof toolName === 'string' &&
          (toolName.startsWith('windows_uia_') ||
            toolName.startsWith('file_') ||
            toolName.startsWith('app_') ||
            toolName.startsWith('window_') ||
            toolName === 'system_shell')
        if (
          toolName !== 'web_search' &&
          toolName !== 'code_execution' &&
          !(typeof toolName === 'string' && toolName.startsWith('computer_')) &&
          !isNativeWindowsTool
        ) {
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
    getPresence: () => ipcRenderer.invoke('secure-storage:get-presence'),
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
    onUpdateError: (callback: (message: string) => void) => {
      const listener = (_event: IpcRendererEvent, message: string) => callback(message)
      ipcRenderer.on('update-error', listener)
      return () => ipcRenderer.off('update-error', listener)
    },
    onUpdateProgress: (
      callback: (progress: IpcOnArgsMap['update-download-progress'][0]) => void
    ) => {
      const listener = (
        _event: IpcRendererEvent,
        progress: IpcOnArgsMap['update-download-progress'][0]
      ) => callback(progress)
      ipcRenderer.on('update-download-progress', listener)
      return () => ipcRenderer.off('update-download-progress', listener)
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
    dragStart: (cursorX: number, cursorY: number) => {
      ipcRenderer.send('overlay:drag-start', cursorX, cursorY)
    },
    dragMove: (cursorX: number, cursorY: number) => {
      ipcRenderer.send('overlay:drag-move', cursorX, cursorY)
    },
    dragEnd: () => {
      ipcRenderer.send('overlay:drag-end')
    },
    navigateSettings: (section: string) => {
      ipcRenderer.send('overlay:navigate-settings', section)
    },
  })
)

contextBridge.exposeInMainWorld(
  'appInfo',
  Object.freeze({
    get: () => ipcRenderer.invoke('app-info:get'),
    getMemoryReport: () => ipcRenderer.invoke('app-info:get-memory-report'),
    openAboutWindow: () => ipcRenderer.invoke('app-info:open-about-window'),
  })
)

contextBridge.exposeInMainWorld(
  'promptPopup',
  Object.freeze({
    show: () => ipcRenderer.invoke('prompt-popup:show') as Promise<void>,
    hide: () => ipcRenderer.invoke('prompt-popup:hide') as Promise<void>,
    submit: (prompt: string) => ipcRenderer.invoke('prompt-popup:submit', prompt) as Promise<void>,
    openModelSelector: () => {
      ipcRenderer.send('open-model-selector')
    },
    onFocus: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('prompt-popup:focus', listener)
      return () => ipcRenderer.removeListener('prompt-popup:focus', listener)
    },
  })
)

contextBridge.exposeInMainWorld(
  'contextMenu',
  Object.freeze({
    show: (request: IpcInvokeArgsMap['context-menu:show'][0]) =>
      ipcRenderer.invoke('context-menu:show', request) as Promise<void>,
    onAction: (callback: (action: IpcOnArgsMap['context-menu:action'][0]) => void) => {
      const listener = (_event: IpcRendererEvent, action: IpcOnArgsMap['context-menu:action'][0]) =>
        callback(action)
      ipcRenderer.on('context-menu:action', listener)
      return () => ipcRenderer.removeListener('context-menu:action', listener)
    },
  })
)

contextBridge.exposeInMainWorld(
  'nativeDialog',
  Object.freeze({
    confirmDeleteChat: () =>
      ipcRenderer.invoke('native-dialog:confirm-delete-chat') as Promise<boolean>,
  })
)

contextBridge.exposeInMainWorld(
  'appMenu',
  Object.freeze({
    command: (command: AppMenuCommand) =>
      ipcRenderer.invoke('app-menu:command', command) as Promise<boolean>,
  })
)

contextBridge.exposeInMainWorld(
  'shell',
  Object.freeze({
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
    readClipboardText: () => ipcRenderer.invoke('clipboard:read-text') as Promise<string>,
  })
)

contextBridge.exposeInMainWorld(
  'devTools',
  Object.freeze({
    inspectElement: (x: number, y: number) => ipcRenderer.invoke('devtools:inspect-element', x, y),
  })
)

contextBridge.exposeInMainWorld(
  'codeExecution',
  Object.freeze({
    resolveApproval: (requestId: string, approved: boolean) =>
      ipcRenderer.invoke('code-execution:resolve-approval', requestId, approved),
    onPendingApproval: (callback: (pending: PendingCodeApproval[]) => void) => {
      const listener = (_event: IpcRendererEvent, pending: PendingCodeApproval[]) => callback(pending)
      ipcRenderer.on('code-execution:pending-approval', listener)
      return () => ipcRenderer.removeListener('code-execution:pending-approval', listener)
    },
  })
)


contextBridge.exposeInMainWorld(
  'chatDiagnostics',
  Object.freeze({
    listEvents: (sessionId: string) =>
      ipcRenderer.invoke('chat-diagnostics:list-events', sessionId),
    onEvent: (callback: (event: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, event: unknown) => callback(event)
      ipcRenderer.on('chat-diagnostics:event', listener)
      return () => ipcRenderer.removeListener('chat-diagnostics:event', listener)
    },
  })
)

contextBridge.exposeInMainWorld(
  'chatDebug',
  Object.freeze({
    open: (sessionId: string) =>
      ipcRenderer.invoke('chat-debug-window:open', sessionId) as Promise<boolean>,
  })
)

contextBridge.exposeInMainWorld(
  'resourceMonitor',
  Object.freeze({
    getNow: () => ipcRenderer.invoke('resource-monitor:get-now') as Promise<ResourceSample>,
    subscribe: (callback: (sample: ResourceSample) => void) => {
      const listener = (_event: IpcRendererEvent, sample: ResourceSample) => callback(sample)
      ipcRenderer.on('resource-monitor:sample', listener)
      ipcRenderer.send('resource-monitor:subscribe')
      return () => {
        ipcRenderer.removeListener('resource-monitor:sample', listener)
        ipcRenderer.send('resource-monitor:unsubscribe')
      }
    },
  })
)


contextBridge.exposeInMainWorld(
  'computerUse',
  Object.freeze({
    resolveApproval: (requestId: string, approved: boolean) =>
      ipcRenderer.invoke('computer-use:resolve-approval', requestId, approved),
    onPendingApproval: (callback: (pending: PendingComputerAction[]) => void) => {
      const listener = (_event: IpcRendererEvent, pending: PendingComputerAction[]) => callback(pending)
      ipcRenderer.on('computer-use:pending-approval', listener)
      return () => ipcRenderer.removeListener('computer-use:pending-approval', listener)
    },
    onKilled: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('computer-use:killed', listener)
      return () => ipcRenderer.removeListener('computer-use:killed', listener)
    },
  })
)

// Agent Desktop (Agent View) — dedicated, allowlisted bridge mirroring
// `window.overlay`. Every channel is gated by the Agent Desktop allowlists; main
// validates all inputs and rejects on macOS (Req 9.3, 9.4, 12.5).
contextBridge.exposeInMainWorld(
  'agentDesktop',
  Object.freeze({
    getState: () => {
      assertAllowed('invoke', 'agent-desktop:get-state', AGENT_DESKTOP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('agent-desktop:get-state') as Promise<AgentDesktopState>
    },
    applySettings: (settings: Partial<AgentDesktopSettings>) => {
      assertAllowed('invoke', 'agent-desktop:apply-settings', AGENT_DESKTOP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('agent-desktop:apply-settings', settings) as Promise<AgentDesktopState>
    },
    takeOver: () => {
      assertAllowed('invoke', 'agent-desktop:take-over', AGENT_DESKTOP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('agent-desktop:take-over') as Promise<AgentDesktopPresenceResult>
    },
    endTakeOver: () => {
      assertAllowed('invoke', 'agent-desktop:end-take-over', AGENT_DESKTOP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('agent-desktop:end-take-over') as Promise<AgentDesktopPresenceResult>
    },
    resolveApproval: (requestId: string, approved: boolean) => {
      assertAllowed('invoke', 'agent-desktop:resolve-approval', AGENT_DESKTOP_INVOKE_CHANNELS)
      return ipcRenderer.invoke(
        'agent-desktop:resolve-approval',
        requestId,
        approved
      ) as Promise<ApprovalDecision>
    },
    acknowledgeDisclosure: () => {
      assertAllowed(
        'invoke',
        'agent-desktop:acknowledge-disclosure',
        AGENT_DESKTOP_INVOKE_CHANNELS
      )
      return ipcRenderer.invoke('agent-desktop:acknowledge-disclosure') as Promise<AgentDesktopState>
    },
    onStateChange: (callback: (state: AgentDesktopState) => void) => {
      assertAllowed('on', 'agent-desktop:state-changed', AGENT_DESKTOP_ON_CHANNELS)
      const listener = (_event: IpcRendererEvent, state: AgentDesktopState) => callback(state)
      ipcRenderer.on('agent-desktop:state-changed', listener)
      return () => {
        assertAllowed('off', 'agent-desktop:state-changed', AGENT_DESKTOP_ON_CHANNELS)
        ipcRenderer.removeListener('agent-desktop:state-changed', listener)
      }
    },
    onPendingApproval: (callback: (pending: PendingAgentDesktopAction[]) => void) => {
      assertAllowed('on', 'agent-desktop:pending-approval', AGENT_DESKTOP_ON_CHANNELS)
      const listener = (_event: IpcRendererEvent, pending: PendingAgentDesktopAction[]) =>
        callback(pending)
      ipcRenderer.on('agent-desktop:pending-approval', listener)
      return () => {
        assertAllowed('off', 'agent-desktop:pending-approval', AGENT_DESKTOP_ON_CHANNELS)
        ipcRenderer.removeListener('agent-desktop:pending-approval', listener)
      }
    },
    onKilled: (callback: (payload: AgentDesktopKilledPayload) => void) => {
      assertAllowed('on', 'agent-desktop:killed', AGENT_DESKTOP_ON_CHANNELS)
      const listener = (_event: IpcRendererEvent, payload: AgentDesktopKilledPayload) =>
        callback(payload)
      ipcRenderer.on('agent-desktop:killed', listener)
      return () => {
        assertAllowed('off', 'agent-desktop:killed', AGENT_DESKTOP_ON_CHANNELS)
        ipcRenderer.removeListener('agent-desktop:killed', listener)
      }
    },
  })
)


contextBridge.exposeInMainWorld(
  'memory',
  Object.freeze({
    list: (scope?: MemoryScope) => {
      assertAllowed('invoke', 'memory:list', MEMORY_INVOKE_CHANNELS)
      return ipcRenderer.invoke('memory:list', scope) as Promise<Memory[]>
    },
    add: (input: AddMemoryInput) => {
      assertAllowed('invoke', 'memory:add', MEMORY_INVOKE_CHANNELS)
      return ipcRenderer.invoke('memory:add', input) as Promise<Memory>
    },
    addDeduped: (input: AddMemoryInput, options?: { supersedesId?: string }) => {
      assertAllowed('invoke', 'memory:add-deduped', MEMORY_INVOKE_CHANNELS)
      return ipcRenderer.invoke('memory:add-deduped', input, options) as Promise<{
        memory: Memory
        operation: 'added' | 'noop' | 'superseded'
      }>
    },
    update: (id: string, patch: UpdateMemoryPatch) => {
      assertAllowed('invoke', 'memory:update', MEMORY_INVOKE_CHANNELS)
      return ipcRenderer.invoke('memory:update', id, patch) as Promise<Memory | null>
    },
    delete: (id: string) => {
      assertAllowed('invoke', 'memory:delete', MEMORY_INVOKE_CHANNELS)
      return ipcRenderer.invoke('memory:delete', id) as Promise<boolean>
    },
    clear: () => {
      assertAllowed('invoke', 'memory:clear', MEMORY_INVOKE_CHANNELS)
      return ipcRenderer.invoke('memory:clear') as Promise<boolean>
    },
    search: (query: string, limit?: number, scope?: MemoryScope) => {
      assertAllowed('invoke', 'memory:search', MEMORY_INVOKE_CHANNELS)
      return ipcRenderer.invoke('memory:search', query, limit, scope) as Promise<Memory[]>
    },
    summaries: Object.freeze({
      list: () => {
        assertAllowed('invoke', 'memory:summaries-list', MEMORY_INVOKE_CHANNELS)
        return ipcRenderer.invoke('memory:summaries-list') as Promise<
          import('../src/electron/types').ConversationSummary[]
        >
      },
      upsert: (sessionId: string, summary: string) => {
        assertAllowed('invoke', 'memory:summaries-upsert', MEMORY_INVOKE_CHANNELS)
        return ipcRenderer.invoke('memory:summaries-upsert', sessionId, summary) as Promise<
          import('../src/electron/types').ConversationSummary
        >
      },
    }),
    onChanged: (callback: () => void) => {
      assertAllowed('on', 'memory-store:changed', MEMORY_ON_CHANNELS)
      const listener = () => callback()
      ipcRenderer.on('memory-store:changed', listener)
      return () => {
        assertAllowed('off', 'memory-store:changed', MEMORY_ON_CHANNELS)
        ipcRenderer.removeListener('memory-store:changed', listener)
      }
    },
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
