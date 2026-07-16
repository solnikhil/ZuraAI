import type { IpcInvokeChannel, IpcOnChannel, IpcSendChannel } from './types'

/** Source of truth for generic and grouped dedicated preload allowlists. */
export const PRELOAD_CHANNEL_MANIFEST = {
  generic: {
    send: [] as const satisfies readonly IpcSendChannel[],
    invoke: [
      'chat-store:get-metadata',
      'chat-store:get-session',
      'chat-store:save-session',
      'chat-store:delete-session',
      'chat-store:save-index',
      'chat-store:get-all',
      'chat-store:get-usage-sessions',
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
      'secure-storage:set',
      'secure-storage:get-presence',
      'execute-tool',
      'window-resize',
      'context-menu:show',
      'native-dialog:confirm-delete-chat',
      'updater:check-for-updates',
      'updater:quit-and-install',
      'updater:get-version',
    ] as const satisfies readonly IpcInvokeChannel[],
    on: [
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
    ] as const satisfies readonly IpcOnChannel[],
  },
  mcp: {
    invoke: [
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
    ],
    on: ['mcp:state-changed'],
  },
  memory: {
    invoke: [
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
    ],
    on: ['memory-store:changed'],
  },
  discordRpc: {
    invoke: ['discord-rpc:get-state', 'discord-rpc:set-activity'],
    on: ['discord-rpc:state-changed'],
  },
  scheduledTasks: {
    invoke: [
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
    ],
    on: [
      'scheduled-tasks:changed',
      'scheduled-tasks:summary-request',
      'scheduled-tasks:automation-run-request',
    ],
  },
  analytics: { invoke: ['analytics:get-state', 'analytics:set-enabled', 'analytics:track'] },
  emailNotifications: {
    invoke: ['email-notifications:apply-settings', 'email-notifications:send-test'],
  },
  providerRuntime: {
    invoke: [
      'provider-runtime:start',
      'provider-runtime:generate',
      'provider-runtime:list-models',
      'provider-runtime:codex-sign-in',
      'provider-runtime:codex-auth-status',
      'provider-runtime:codex-sign-out',
      'provider-runtime:cancel',
    ],
    on: ['provider-runtime:event'],
  },
  agentSkills: {
    invoke: [
      'agent-skills:list',
      'agent-skills:activate',
      'agent-skills:select-project-root',
      'agent-skills:clear-project-root',
      'agent-skills:search',
      'agent-skills:install',
    ],
  },
  agentApproval: { invoke: ['agent-approval:request'] },
} as const

export function assertNoDuplicatePreloadChannels(): void {
  for (const direction of ['invoke', 'on'] as const) {
    const owners = new Map<string, string>()
    for (const [owner, channels] of Object.entries(PRELOAD_CHANNEL_MANIFEST)) {
      const directional = (channels as Partial<Record<typeof direction, readonly string[]>>)[
        direction
      ]
      if (!directional) continue
      for (const channel of directional) {
        const existing = owners.get(channel)
        if (existing)
          throw new Error(
            `Duplicate preload ${direction} channel "${channel}" in ${existing} and ${owner}`
          )
        owners.set(channel, owner)
      }
    }
  }
}
