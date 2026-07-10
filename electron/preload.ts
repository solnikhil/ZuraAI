import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import type {
  McpApprovalDecision,
  McpAuthStatus,
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
  IpcSendChannel,
  AddMemoryInput,
  AgentApprovalOverlayDecision,
  AgentApprovalOverlayRequest,
  AgentSkillsQuery,
  AnalyticsEventName,
  AnalyticsProperties,
  AnalyticsState,
  AppMenuCommand,
  DiscordRpcState,
  EmailNotificationSettings,
  Memory,
  MemoryScope,
  ScheduledAutomationRunRequest,
  ScheduledAutomationRunResponse,
  ScheduledTaskInput,
  ScheduledTaskSummaryRequest,
  ScheduledTaskSummaryResponse,
  ScheduledTaskUpdateInput,
  ProviderProxyFetchRequest,
  ProviderProxyFetchResponse,
  PendingCodeApproval,
  PendingComputerAction,
  PendingTerminalApproval,
  CommandCenterCommand,
  CommandCenterActionId,
  CommandCenterState,
  CommandCenterSubmitResult,
  CommandCenterWorkflow,
  CommandCenterIndex,
  CommandCenterExecuteResult,
  CommandCenterItemActionId,
  CommandCenterItemActionResult,
  UpdateMemoryPatch,
  WindowAppearance,
} from '../src/electron/types'

const isDebug = process.env.ZURA_DEBUG === '1'
const preloadLog = (message: string) => {
  if (!isDebug) return
  console.log(`\x1b[90m→\x1b[0m \x1b[2m\x1b[1m[preload]\x1b[0m ${message}`)
}

preloadLog('Preload script STARTED')

// Window controls API (custom title bar)
contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.invoke('window-controls:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window-controls:toggle-maximize'),
  close: () => ipcRenderer.invoke('window-controls:close'),
  isMaximized: () => ipcRenderer.invoke('window-controls:is-maximized'),
  setAppearance: (appearance: WindowAppearance) =>
    ipcRenderer.invoke('window-controls:set-appearance', appearance),
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

const SEND_CHANNELS = new Set<IpcSendChannel>([])

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
  'tool-media:load',
  'chat-diagnostics:append-event',
  'chat-diagnostics:get-debug-reference',
  'chat-diagnostics:list-events',
  'chat-debug-window:open',
  'chat-links:consume-pending',
  'chat-links:peek-pending',

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
])

const ON_CHANNELS = new Set<IpcOnChannel>([
  'update-available',
  'update-downloaded',
  'update-error',
  'update-download-progress',
  'app:new-chat',
  'settings:navigate',
  'chat-store:changed',
  'context-menu:action',
  'chat-diagnostics:event',
  'chat-links:message',
])

const MCP_INVOKE_CHANNELS = new Set<string>([
  'mcp:list-servers',
  'mcp:add-server',
  'mcp:update-server',
  'mcp:remove-server',
  'mcp:connect-server',
  'mcp:disconnect-server',
  'mcp:get-state',
  'mcp:open-config-file',
  'mcp:list-tools',
  'mcp:list-resources',
  'mcp:read-resource',
  'mcp:list-prompts',
  'mcp:get-prompt',
  'mcp:execute-tool',
  'mcp:resolve-approval',
  'mcp:start-oauth',
  'mcp:clear-oauth',
  'mcp:get-auth-status',
  'mcp:resolve-add-request',
  'mcp:approve-add-request',
  'mcp:cancel-add-request',
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
  'memory:summaries-delete',
  'memory:summaries-clear',
])

const MEMORY_ON_CHANNELS = new Set<string>(['memory-store:changed'])

const DISCORD_RPC_INVOKE_CHANNELS = new Set<string>([
  'discord-rpc:get-state',
  'discord-rpc:set-activity',
])

const DISCORD_RPC_ON_CHANNELS = new Set<string>(['discord-rpc:state-changed'])

const COMMAND_CENTER_INVOKE_CHANNELS = new Set<string>([
  'command-center:set-extension-enabled',
  'command-center:show',
  'command-center:hide',
  'command-center:get-context',
  'command-center:list-actions',
  'command-center:get-index',
  'command-center:refresh-app-index',
  'command-center:save-workflow',
  'command-center:delete-workflow',
  'command-center:execute-action',
  'command-center:insert-emoji',
  'command-center:execute-index-item',
  'command-center:execute-item-action',
  'command-center:execute-workflow',
  'command-center:open-chat-session',
  'command-center:set-layout',
  'command-center:submit-command',
])

const COMMAND_CENTER_ON_CHANNELS = new Set<string>([
  'command-center:shown',
  'command-center:command',
])

const SCHEDULED_TASKS_INVOKE_CHANNELS = new Set<string>([
  'scheduled-tasks:set-extension-enabled',
  'scheduled-tasks:list',
  'scheduled-tasks:create',
  'scheduled-tasks:update',
  'scheduled-tasks:delete',
  'scheduled-tasks:run-now',
  'scheduled-tasks:list-runs',
  'scheduled-tasks:get-run',
  'scheduled-tasks:resolve-summary',
  'scheduled-tasks:resolve-automation-run',
])

const SCHEDULED_TASKS_ON_CHANNELS = new Set<string>([
  'scheduled-tasks:changed',
  'scheduled-tasks:summary-request',
  'scheduled-tasks:automation-run-request',
])

const ANALYTICS_INVOKE_CHANNELS = new Set<string>([
  'analytics:get-state',
  'analytics:set-enabled',
  'analytics:track',
])

const EMAIL_NOTIFICATIONS_INVOKE_CHANNELS = new Set<string>([
  'email-notifications:apply-settings',
  'email-notifications:send-test',
])

const PROVIDER_PROXY_INVOKE_CHANNELS = new Set<string>(['provider-proxy:opencode-fetch'])

const AGENT_SKILLS_INVOKE_CHANNELS = new Set<string>([
  'agent-skills:list',
  'agent-skills:activate',
  'agent-skills:select-project-root',
  'agent-skills:clear-project-root',
  'agent-skills:search',
  'agent-skills:install',
])

const AGENT_APPROVAL_INVOKE_CHANNELS = new Set<string>(['agent-approval:request'])

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
    send: (channel: IpcSendChannel) => {
      assertAllowed('send', channel, SEND_CHANNELS)
      ipcRenderer.send(channel)
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
          (toolName.startsWith('ui_') ||
            toolName.startsWith('windows_uia_') ||
            toolName.startsWith('file_') ||
            toolName.startsWith('app_') ||
            toolName.startsWith('window_') ||
            toolName.startsWith('scheduled_task_') ||
            toolName === 'activate_skill' ||
            toolName === 'system_active_window' ||
            toolName === 'system_status' ||
            toolName === 'system_settings_open' ||
            toolName === 'system_open_path' ||
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
  'appInfo',
  Object.freeze({
    get: () => ipcRenderer.invoke('app-info:get'),
    getMemoryReport: () => ipcRenderer.invoke('app-info:get-memory-report'),
    openAboutWindow: () => ipcRenderer.invoke('app-info:open-about-window'),
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
  'scheduledTasks',
  Object.freeze({
    setExtensionEnabled: (enabled: boolean) => {
      assertAllowed(
        'invoke',
        'scheduled-tasks:set-extension-enabled',
        SCHEDULED_TASKS_INVOKE_CHANNELS
      )
      return ipcRenderer.invoke('scheduled-tasks:set-extension-enabled', enabled === true)
    },
    list: () => {
      assertAllowed('invoke', 'scheduled-tasks:list', SCHEDULED_TASKS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('scheduled-tasks:list')
    },
    create: (input: ScheduledTaskInput) => {
      assertAllowed('invoke', 'scheduled-tasks:create', SCHEDULED_TASKS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('scheduled-tasks:create', input)
    },
    update: (id: string, patch: ScheduledTaskUpdateInput) => {
      assertAllowed('invoke', 'scheduled-tasks:update', SCHEDULED_TASKS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('scheduled-tasks:update', id, patch)
    },
    delete: (id: string) => {
      assertAllowed('invoke', 'scheduled-tasks:delete', SCHEDULED_TASKS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('scheduled-tasks:delete', id)
    },
    runNow: (id: string) => {
      assertAllowed('invoke', 'scheduled-tasks:run-now', SCHEDULED_TASKS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('scheduled-tasks:run-now', id)
    },
    listRuns: (taskId?: string) => {
      assertAllowed('invoke', 'scheduled-tasks:list-runs', SCHEDULED_TASKS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('scheduled-tasks:list-runs', taskId)
    },
    getRun: (runId: string) => {
      assertAllowed('invoke', 'scheduled-tasks:get-run', SCHEDULED_TASKS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('scheduled-tasks:get-run', runId)
    },
    resolveSummary: (response: ScheduledTaskSummaryResponse) => {
      assertAllowed('invoke', 'scheduled-tasks:resolve-summary', SCHEDULED_TASKS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('scheduled-tasks:resolve-summary', response)
    },
    resolveAutomationRun: (response: ScheduledAutomationRunResponse) => {
      assertAllowed(
        'invoke',
        'scheduled-tasks:resolve-automation-run',
        SCHEDULED_TASKS_INVOKE_CHANNELS
      )
      return ipcRenderer.invoke('scheduled-tasks:resolve-automation-run', response)
    },
    onChanged: (callback: () => void) => {
      assertAllowed('on', 'scheduled-tasks:changed', SCHEDULED_TASKS_ON_CHANNELS)
      const listener = () => callback()
      ipcRenderer.on('scheduled-tasks:changed', listener)
      return () => ipcRenderer.removeListener('scheduled-tasks:changed', listener)
    },
    onSummaryRequest: (callback: (request: ScheduledTaskSummaryRequest) => void) => {
      assertAllowed('on', 'scheduled-tasks:summary-request', SCHEDULED_TASKS_ON_CHANNELS)
      const listener = (_event: IpcRendererEvent, request: ScheduledTaskSummaryRequest) =>
        callback(request)
      ipcRenderer.on('scheduled-tasks:summary-request', listener)
      return () => ipcRenderer.removeListener('scheduled-tasks:summary-request', listener)
    },
    onAutomationRunRequest: (callback: (request: ScheduledAutomationRunRequest) => void) => {
      assertAllowed('on', 'scheduled-tasks:automation-run-request', SCHEDULED_TASKS_ON_CHANNELS)
      const listener = (_event: IpcRendererEvent, request: ScheduledAutomationRunRequest) =>
        callback(request)
      ipcRenderer.on('scheduled-tasks:automation-run-request', listener)
      return () => ipcRenderer.removeListener('scheduled-tasks:automation-run-request', listener)
    },
  })
)

contextBridge.exposeInMainWorld(
  'analytics',
  Object.freeze({
    getState: () => {
      assertAllowed('invoke', 'analytics:get-state', ANALYTICS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('analytics:get-state') as Promise<AnalyticsState>
    },
    setEnabled: (enabled: boolean) => {
      assertAllowed('invoke', 'analytics:set-enabled', ANALYTICS_INVOKE_CHANNELS)
      return ipcRenderer.invoke(
        'analytics:set-enabled',
        enabled === true
      ) as Promise<AnalyticsState>
    },
    track: (eventName: AnalyticsEventName, properties?: AnalyticsProperties) => {
      assertAllowed('invoke', 'analytics:track', ANALYTICS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('analytics:track', eventName, properties) as Promise<boolean>
    },
  })
)

contextBridge.exposeInMainWorld(
  'emailNotifications',
  Object.freeze({
    applySettings: (settings: EmailNotificationSettings) => {
      assertAllowed(
        'invoke',
        'email-notifications:apply-settings',
        EMAIL_NOTIFICATIONS_INVOKE_CHANNELS
      )
      return ipcRenderer.invoke(
        'email-notifications:apply-settings',
        settings
      ) as Promise<EmailNotificationSettings>
    },
    sendTest: () => {
      assertAllowed('invoke', 'email-notifications:send-test', EMAIL_NOTIFICATIONS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('email-notifications:send-test') as Promise<{
        ok: boolean
        error?: string
      }>
    },
  })
)

contextBridge.exposeInMainWorld(
  'providerProxy',
  Object.freeze({
    fetchOpencode: (request: ProviderProxyFetchRequest) => {
      assertAllowed('invoke', 'provider-proxy:opencode-fetch', PROVIDER_PROXY_INVOKE_CHANNELS)
      return ipcRenderer.invoke(
        'provider-proxy:opencode-fetch',
        request
      ) as Promise<ProviderProxyFetchResponse>
    },
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
  'agentSkills',
  Object.freeze({
    list: (query?: AgentSkillsQuery) => {
      assertAllowed('invoke', 'agent-skills:list', AGENT_SKILLS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('agent-skills:list', query)
    },
    activate: (name: string) => {
      assertAllowed('invoke', 'agent-skills:activate', AGENT_SKILLS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('agent-skills:activate', name)
    },
    selectProjectRoot: () => {
      assertAllowed('invoke', 'agent-skills:select-project-root', AGENT_SKILLS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('agent-skills:select-project-root')
    },
    clearProjectRoot: () => {
      assertAllowed('invoke', 'agent-skills:clear-project-root', AGENT_SKILLS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('agent-skills:clear-project-root')
    },
    search: (query: string) => {
      assertAllowed('invoke', 'agent-skills:search', AGENT_SKILLS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('agent-skills:search', query)
    },
    install: (packageRef: string, target: 'user' | 'project', projectRoot?: string) => {
      assertAllowed('invoke', 'agent-skills:install', AGENT_SKILLS_INVOKE_CHANNELS)
      return ipcRenderer.invoke('agent-skills:install', packageRef, target, projectRoot)
    },
  })
)

contextBridge.exposeInMainWorld(
  'artifacts',
  Object.freeze({
    openExternally: (payload: unknown) =>
      ipcRenderer.invoke('artifacts:open-external', payload) as Promise<{
        ok: boolean
        path?: string
        error?: string
      }>,
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
      const listener = (_event: IpcRendererEvent, pending: PendingCodeApproval[]) =>
        callback(pending)
      ipcRenderer.on('code-execution:pending-approval', listener)
      return () => ipcRenderer.removeListener('code-execution:pending-approval', listener)
    },
  })
)

contextBridge.exposeInMainWorld(
  'terminal',
  Object.freeze({
    resolveApproval: (requestId: string, approved: boolean) =>
      ipcRenderer.invoke('terminal:resolve-approval', requestId, approved),
    onPendingApproval: (callback: (pending: PendingTerminalApproval[]) => void) => {
      const listener = (_event: IpcRendererEvent, pending: PendingTerminalApproval[]) =>
        callback(pending)
      ipcRenderer.on('terminal:pending-approval', listener)
      return () => ipcRenderer.removeListener('terminal:pending-approval', listener)
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
  'chatLinks',
  Object.freeze({
    consumePending: () =>
      ipcRenderer.invoke('chat-links:consume-pending') as Promise<
        import('../src/electron/types').ExternalChatMessageRequest[]
      >,
    peekPending: () =>
      ipcRenderer.invoke('chat-links:peek-pending') as Promise<
        import('../src/electron/types').ExternalChatMessageRequest[]
      >,
    onMessage: (
      callback: (request: import('../src/electron/types').ExternalChatMessageRequest) => void
    ) => {
      const listener = (
        _event: IpcRendererEvent,
        request: import('../src/electron/types').ExternalChatMessageRequest
      ) => callback(request)
      ipcRenderer.on('chat-links:message', listener)
      return () => ipcRenderer.removeListener('chat-links:message', listener)
    },
  })
)

contextBridge.exposeInMainWorld(
  'agentApproval',
  Object.freeze({
    requestApproval: (request: AgentApprovalOverlayRequest) => {
      assertAllowed('invoke', 'agent-approval:request', AGENT_APPROVAL_INVOKE_CHANNELS)
      return ipcRenderer.invoke(
        'agent-approval:request',
        request
      ) as Promise<AgentApprovalOverlayDecision>
    },
  })
)

contextBridge.exposeInMainWorld(
  'computerUse',
  Object.freeze({
    resolveApproval: (requestId: string, approved: boolean) =>
      ipcRenderer.invoke('computer-use:resolve-approval', requestId, approved),
    onPendingApproval: (callback: (pending: PendingComputerAction[]) => void) => {
      const listener = (_event: IpcRendererEvent, pending: PendingComputerAction[]) =>
        callback(pending)
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

contextBridge.exposeInMainWorld(
  'commandCenter',
  Object.freeze({
    setExtensionEnabled: (enabled: boolean) => {
      assertAllowed(
        'invoke',
        'command-center:set-extension-enabled',
        COMMAND_CENTER_INVOKE_CHANNELS
      )
      return ipcRenderer.invoke(
        'command-center:set-extension-enabled',
        enabled
      ) as Promise<CommandCenterState>
    },
    show: () => {
      assertAllowed('invoke', 'command-center:show', COMMAND_CENTER_INVOKE_CHANNELS)
      return ipcRenderer.invoke('command-center:show') as Promise<boolean>
    },
    hide: () => {
      assertAllowed('invoke', 'command-center:hide', COMMAND_CENTER_INVOKE_CHANNELS)
      return ipcRenderer.invoke('command-center:hide') as Promise<boolean>
    },
    getContext: () => {
      assertAllowed('invoke', 'command-center:get-context', COMMAND_CENTER_INVOKE_CHANNELS)
      return ipcRenderer.invoke('command-center:get-context')
    },
    listActions: () => {
      assertAllowed('invoke', 'command-center:list-actions', COMMAND_CENTER_INVOKE_CHANNELS)
      return ipcRenderer.invoke('command-center:list-actions')
    },
    getIndex: (query?: string) => {
      assertAllowed('invoke', 'command-center:get-index', COMMAND_CENTER_INVOKE_CHANNELS)
      return ipcRenderer.invoke('command-center:get-index', query) as Promise<CommandCenterIndex>
    },
    refreshAppIndex: () => {
      assertAllowed('invoke', 'command-center:refresh-app-index', COMMAND_CENTER_INVOKE_CHANNELS)
      return ipcRenderer.invoke('command-center:refresh-app-index') as Promise<
        NonNullable<CommandCenterIndex['diagnostics']>['apps']
      >
    },
    saveWorkflow: (workflow: Partial<CommandCenterWorkflow>) => {
      assertAllowed('invoke', 'command-center:save-workflow', COMMAND_CENTER_INVOKE_CHANNELS)
      return ipcRenderer.invoke(
        'command-center:save-workflow',
        workflow
      ) as Promise<CommandCenterWorkflow | null>
    },
    deleteWorkflow: (id: string) => {
      assertAllowed('invoke', 'command-center:delete-workflow', COMMAND_CENTER_INVOKE_CHANNELS)
      return ipcRenderer.invoke('command-center:delete-workflow', id) as Promise<boolean>
    },
    executeAction: (actionId: CommandCenterActionId) => {
      assertAllowed('invoke', 'command-center:execute-action', COMMAND_CENTER_INVOKE_CHANNELS)
      return ipcRenderer.invoke('command-center:execute-action', actionId)
    },
    insertEmoji: (emoji: string) => {
      assertAllowed('invoke', 'command-center:insert-emoji', COMMAND_CENTER_INVOKE_CHANNELS)
      return ipcRenderer.invoke(
        'command-center:insert-emoji',
        emoji
      ) as Promise<CommandCenterExecuteResult>
    },
    executeIndexItem: (itemId: string, query?: string) => {
      assertAllowed('invoke', 'command-center:execute-index-item', COMMAND_CENTER_INVOKE_CHANNELS)
      return ipcRenderer.invoke(
        'command-center:execute-index-item',
        itemId,
        query
      ) as Promise<CommandCenterExecuteResult>
    },
    executeItemAction: (itemId: string, actionId: CommandCenterItemActionId, query?: string) => {
      assertAllowed('invoke', 'command-center:execute-item-action', COMMAND_CENTER_INVOKE_CHANNELS)
      return ipcRenderer.invoke(
        'command-center:execute-item-action',
        itemId,
        actionId,
        query
      ) as Promise<CommandCenterItemActionResult>
    },
    executeWorkflow: (workflowId: string) => {
      assertAllowed('invoke', 'command-center:execute-workflow', COMMAND_CENTER_INVOKE_CHANNELS)
      return ipcRenderer.invoke(
        'command-center:execute-workflow',
        workflowId
      ) as Promise<CommandCenterExecuteResult>
    },
    openChatSession: (sessionId: string) => {
      assertAllowed('invoke', 'command-center:open-chat-session', COMMAND_CENTER_INVOKE_CHANNELS)
      return ipcRenderer.invoke('command-center:open-chat-session', sessionId) as Promise<boolean>
    },
    setLayout: (layout: 'search' | 'chat') => {
      assertAllowed('invoke', 'command-center:set-layout', COMMAND_CENTER_INVOKE_CHANNELS)
      return ipcRenderer.invoke('command-center:set-layout', layout) as Promise<boolean>
    },
    submitCommand: (text: string) => {
      assertAllowed('invoke', 'command-center:submit-command', COMMAND_CENTER_INVOKE_CHANNELS)
      return ipcRenderer.invoke(
        'command-center:submit-command',
        text
      ) as Promise<CommandCenterSubmitResult>
    },
    onShown: (callback: () => void) => {
      assertAllowed('on', 'command-center:shown', COMMAND_CENTER_ON_CHANNELS)
      const listener = () => callback()
      ipcRenderer.on('command-center:shown', listener)
      return () => ipcRenderer.removeListener('command-center:shown', listener)
    },
    onCommand: (callback: (command: CommandCenterCommand) => void) => {
      assertAllowed('on', 'command-center:command', COMMAND_CENTER_ON_CHANNELS)
      const listener = (_event: IpcRendererEvent, command: CommandCenterCommand) =>
        callback(command)
      ipcRenderer.on('command-center:command', listener)
      return () => ipcRenderer.removeListener('command-center:command', listener)
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
      delete: (sessionId: string) => {
        assertAllowed('invoke', 'memory:summaries-delete', MEMORY_INVOKE_CHANNELS)
        return ipcRenderer.invoke('memory:summaries-delete', sessionId) as Promise<boolean>
      },
      clear: () => {
        assertAllowed('invoke', 'memory:summaries-clear', MEMORY_INVOKE_CHANNELS)
        return ipcRenderer.invoke('memory:summaries-clear') as Promise<boolean>
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
  'discordRpc',
  Object.freeze({
    getState: () => {
      assertAllowed('invoke', 'discord-rpc:get-state', DISCORD_RPC_INVOKE_CHANNELS)
      return ipcRenderer.invoke('discord-rpc:get-state') as Promise<DiscordRpcState>
    },
    setActivity: (activity: Record<string, unknown>) => {
      assertAllowed('invoke', 'discord-rpc:set-activity', DISCORD_RPC_INVOKE_CHANNELS)
      return ipcRenderer.invoke('discord-rpc:set-activity', activity) as Promise<DiscordRpcState>
    },
    onStateChange: (callback: (state: DiscordRpcState) => void) => {
      assertAllowed('on', 'discord-rpc:state-changed', DISCORD_RPC_ON_CHANNELS)
      const listener = (_event: IpcRendererEvent, state: DiscordRpcState) => callback(state)
      ipcRenderer.on('discord-rpc:state-changed', listener)
      return () => {
        assertAllowed('off', 'discord-rpc:state-changed', DISCORD_RPC_ON_CHANNELS)
        ipcRenderer.removeListener('discord-rpc:state-changed', listener)
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
    openConfigFile: () => {
      assertAllowed('invoke', 'mcp:open-config-file', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:open-config-file') as Promise<{
        ok: boolean
        path?: string
        error?: string
      }>
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
      return ipcRenderer.invoke(
        'mcp:read-resource',
        serverId,
        uri
      ) as Promise<McpResourceReadResult>
    },
    listPrompts: (serverId?: string) => {
      assertAllowed('invoke', 'mcp:list-prompts', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:list-prompts', serverId) as Promise<McpRuntimePrompt[]>
    },
    getPrompt: (serverId: string, promptName: string, args: Record<string, unknown>) => {
      assertAllowed('invoke', 'mcp:get-prompt', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke(
        'mcp:get-prompt',
        serverId,
        promptName,
        args
      ) as Promise<McpPromptResult>
    },
    executeTool: (namespacedToolName: string, args: Record<string, unknown>) => {
      assertAllowed('invoke', 'mcp:execute-tool', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke(
        'mcp:execute-tool',
        namespacedToolName,
        args
      ) as Promise<McpToolExecutionResult>
    },
    resolveApproval: (requestId: string, approved: boolean) => {
      assertAllowed('invoke', 'mcp:resolve-approval', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke(
        'mcp:resolve-approval',
        requestId,
        approved
      ) as Promise<McpApprovalDecision>
    },
    startOAuth: (serverId: string) => {
      assertAllowed('invoke', 'mcp:start-oauth', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:start-oauth', serverId) as Promise<{
        ok: boolean
        status: McpAuthStatus
        error?: string
      }>
    },
    clearOAuth: (serverId: string) => {
      assertAllowed('invoke', 'mcp:clear-oauth', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:clear-oauth', serverId) as Promise<McpAuthStatus>
    },
    getAuthStatus: (serverId: string) => {
      assertAllowed('invoke', 'mcp:get-auth-status', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:get-auth-status', serverId) as Promise<McpAuthStatus>
    },
    resolveAddRequest: (requestId: string) => {
      assertAllowed('invoke', 'mcp:resolve-add-request', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:resolve-add-request', requestId)
    },
    approveAddRequest: (requestId: string) => {
      assertAllowed('invoke', 'mcp:approve-add-request', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:approve-add-request', requestId)
    },
    cancelAddRequest: (requestId: string) => {
      assertAllowed('invoke', 'mcp:cancel-add-request', MCP_INVOKE_CHANNELS)
      return ipcRenderer.invoke('mcp:cancel-add-request', requestId)
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
