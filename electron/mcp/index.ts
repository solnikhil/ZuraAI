import { randomUUID } from 'crypto'
import { BrowserWindow, shell } from 'electron'
import { trustedIpcMain as ipcMain } from '../ipc/trustedIpc'

import type {
  McpApprovalOutcome,
  McpRuntimeSnapshot,
  McpToolExecutionMetadata,
  McpToolExecutionResult,
} from '../../src/mcp/types'

import { McpApprovalManager } from './mcpApprovalManager'
import { McpManager } from './mcpManager'
import { clearMcpServerSecrets, prepareRendererMcpServerInput } from './rendererPayload'
import { getMcpStoreFilePath, saveMcpServers } from './mcpStorage'
import {
  approvePendingMcpAddRequest,
  cancelPendingMcpAddRequest,
  getPendingMcpAddRequest,
} from './mcpAddRequests'
import { trackAnalyticsEvent } from '../analytics'
import { privilegedToolExecutionCoordinator } from '../tools/privilegedToolExecutionCoordinator'

const MCP_STATE_CHANGED_CHANNEL = 'mcp:state-changed'

let mcpManager: McpManager | null = null
let unsubscribeSnapshotBroadcast: (() => void) | null = null
let approvalManager: McpApprovalManager | null = null
let unsubscribeApprovalBroadcast: (() => void) | null = null

function getOrCreateMcpManager(): McpManager {
  if (!mcpManager) {
    mcpManager = new McpManager()
  }

  return mcpManager
}

function getOrCreateApprovalManager(): McpApprovalManager {
  if (!approvalManager) {
    approvalManager = new McpApprovalManager()
  }

  return approvalManager
}

export async function initializeMcpManager(
  options: {
    autoConnect?: boolean
    clientInfo?: { name: string; version: string }
  } = {}
): Promise<McpManager> {
  const manager = getOrCreateMcpManager()
  await manager.initialize(options)
  return manager
}

/** Connect servers flagged autoConnect after first paint (RAM/startup friendly). */
export async function connectAutoConnectMcpServers(): Promise<void> {
  const manager = getOrCreateMcpManager()
  // Ensure metadata is loaded without forcing connect on cold start.
  await manager.initialize({ autoConnect: false })
  const servers = manager.listServers()
  await Promise.allSettled(
    servers
      .filter((server) => server.enabled === true && server.autoConnect === true)
      .map((server) => manager.connectServer(server.id))
  )
}

export async function shutdownMcpManager(): Promise<void> {
  approvalManager?.dispose()
  approvalManager = null

  if (mcpManager) {
    await mcpManager.dispose()
    mcpManager = null
  }
}

export function registerMcpHandlers(): void {
  unregisterMcpHandlers()

  const manager = getOrCreateMcpManager()
  const approvals = getOrCreateApprovalManager()
  const broadcastCurrentSnapshot = () => {
    broadcastMcpSnapshot(buildSnapshot(manager, approvals))
  }

  unsubscribeSnapshotBroadcast = manager.onSnapshotChange(() => {
    broadcastCurrentSnapshot()
  })
  unsubscribeApprovalBroadcast = approvals.onPendingApprovalsChange(() => {
    broadcastCurrentSnapshot()
  })

  ipcMain.handle('mcp:list-servers', async () => {
    await manager.initialize()
    return manager.listServers()
  })

  ipcMain.handle('mcp:add-server', async (_event, serverConfig: unknown) => {
    await manager.initialize()
    const serverId = extractServerId(serverConfig) ?? randomUUID()
    const preparedServer = await prepareRendererMcpServerInput(serverConfig, { serverId })
    const server = await manager.addServer(preparedServer)
    return server
  })

  ipcMain.handle('mcp:update-server', async (_event, serverId: string, updates: unknown) => {
    await manager.initialize()
    const normalizedServerId = assertMcpServerId(serverId)
    const existingServer = manager.listServers().find((server) => server.id === normalizedServerId)
    const preparedUpdates = await prepareRendererMcpServerInput(updates, {
      serverId: normalizedServerId,
      existingServer,
    })

    approvals.rejectRequestsForServer(normalizedServerId)
    return manager.updateServer(normalizedServerId, preparedUpdates)
  })

  ipcMain.handle('mcp:remove-server', async (_event, serverId: string) => {
    await manager.initialize()
    const normalizedServerId = assertMcpServerId(serverId)
    const existingServer = manager.listServers().find((server) => server.id === normalizedServerId)
    approvals.rejectRequestsForServer(normalizedServerId)
    const removed = await manager.removeServer(normalizedServerId)

    if (removed) {
      await clearMcpServerSecrets(existingServer)
    }

    return removed
  })

  ipcMain.handle('mcp:connect-server', async (_event, serverId: string) => {
    await manager.initialize()
    const normalizedServerId = assertMcpServerId(serverId)
    const state = await manager.connectServer(normalizedServerId)
    const server = manager.getSnapshot().servers.find((entry) => entry.id === normalizedServerId)
    void trackAnalyticsEvent('mcp_server_connected', {
      transport: server?.transport,
      serverTrustState: server?.trustState,
    })
    return state
  })

  ipcMain.handle('mcp:disconnect-server', async (_event, serverId: string) => {
    await manager.initialize()
    const normalizedServerId = assertMcpServerId(serverId)
    approvals.rejectRequestsForServer(normalizedServerId)
    return manager.disconnectServer(normalizedServerId)
  })

  ipcMain.handle('mcp:get-state', async () => {
    await manager.initialize()
    return buildSnapshot(manager, approvals)
  })

  ipcMain.handle('mcp:open-config-file', async () => {
    await manager.initialize()
    const filePath = getMcpStoreFilePath()
    await saveMcpServers(manager.listServers())
    const error = await shell.openPath(filePath)

    return {
      ok: !error,
      path: filePath,
      error: error || undefined,
    }
  })

  ipcMain.handle('mcp:list-tools', async (_event, serverId?: string) => {
    await manager.initialize()
    if (typeof serverId === 'string' && serverId.trim()) {
      return manager.getServerTools(serverId)
    }

    return manager.listTools()
  })

  ipcMain.handle('mcp:list-resources', async (_event, serverId?: string) => {
    await manager.initialize()
    if (typeof serverId === 'string' && serverId.trim()) {
      return manager.getServerResources(serverId)
    }

    return manager.listResources()
  })

  ipcMain.handle('mcp:read-resource', async (_event, serverId: string, uri: string) => {
    await manager.initialize()
    return manager.readResource(assertMcpServerId(serverId), assertMcpUri(uri))
  })

  ipcMain.handle('mcp:list-prompts', async (_event, serverId?: string) => {
    await manager.initialize()
    if (typeof serverId === 'string' && serverId.trim()) {
      return manager.getServerPrompts(serverId)
    }

    return manager.listPrompts()
  })

  ipcMain.handle(
    'mcp:get-prompt',
    async (_event, serverId: string, promptName: string, args: unknown) => {
      await manager.initialize()
      return manager.getPrompt(
        assertMcpServerId(serverId),
        assertMcpPromptName(promptName),
        assertArgumentsRecord(args)
      )
    }
  )

  ipcMain.handle(
    'mcp:execute-tool',
    async (event, namespacedToolName: string, args: unknown, executionContext?: unknown) => {
      const normalizedToolName = assertMcpToolName(namespacedToolName)
      const normalizedArgs = assertArgumentsRecord(args)
      const context = assertMcpExecutionContext(executionContext)
      const coordinated = await privilegedToolExecutionCoordinator.execute(
        {
          senderWebContentsId: event.sender?.id ?? -1,
          toolName: normalizedToolName,
          args: normalizedArgs,
          approvalToken: context.approvalToken,
          runId: context.runId,
          // MCP annotations are external input and never weaken main-owned accounting.
          mutating: true,
        },
        async ({ approved, signal }) => {
          await manager.initialize()
          return executeMcpTool(
            manager,
            approvals,
            normalizedToolName,
            normalizedArgs,
            approved,
            signal
          )
        }
      )
      if (!coordinated.ok) {
        return buildCoordinatorDeniedResult(normalizedToolName, coordinated.reason)
      }
      return coordinated.value
    }
  )

  ipcMain.handle('mcp:resolve-approval', async (_event, requestId: string, approved: boolean) => {
    return approvals.resolveApproval(assertApprovalRequestId(requestId), approved === true)
  })

  ipcMain.handle('mcp:start-oauth', async (_event, serverId: string) => {
    await manager.initialize()
    return manager.startOAuth(assertMcpServerId(serverId))
  })

  ipcMain.handle('mcp:clear-oauth', async (_event, serverId: string) => {
    await manager.initialize()
    return manager.clearOAuth(assertMcpServerId(serverId))
  })

  ipcMain.handle('mcp:get-auth-status', async (_event, serverId: string) => {
    await manager.initialize()
    return manager.getAuthStatus(assertMcpServerId(serverId))
  })

  ipcMain.handle('mcp:resolve-add-request', async (_event, requestId: string) => {
    return getPendingMcpAddRequest(assertMcpAddRequestId(requestId))
  })

  ipcMain.handle('mcp:cancel-add-request', async (_event, requestId: string) => {
    return cancelPendingMcpAddRequest(assertMcpAddRequestId(requestId))
  })

  ipcMain.handle('mcp:approve-add-request', async (_event, requestId: string) => {
    await manager.initialize()
    return approvePendingMcpAddRequest(assertMcpAddRequestId(requestId), {
      addServer: async (payload) => {
        const serverId = extractServerId(payload) ?? randomUUID()
        const preparedServer = await prepareRendererMcpServerInput(payload, { serverId })
        return manager.addServer(preparedServer)
      },
      connectServer: async (serverId) => manager.connectServer(assertMcpServerId(serverId)),
      startOAuth: async (serverId) => manager.startOAuth(assertMcpServerId(serverId)),
    })
  })
}

export function unregisterMcpHandlers(): void {
  unsubscribeSnapshotBroadcast?.()
  unsubscribeSnapshotBroadcast = null
  unsubscribeApprovalBroadcast?.()
  unsubscribeApprovalBroadcast = null

  ipcMain.removeHandler('mcp:list-servers')
  ipcMain.removeHandler('mcp:add-server')
  ipcMain.removeHandler('mcp:update-server')
  ipcMain.removeHandler('mcp:remove-server')
  ipcMain.removeHandler('mcp:connect-server')
  ipcMain.removeHandler('mcp:disconnect-server')
  ipcMain.removeHandler('mcp:get-state')
  ipcMain.removeHandler('mcp:open-config-file')
  ipcMain.removeHandler('mcp:list-tools')
  ipcMain.removeHandler('mcp:list-resources')
  ipcMain.removeHandler('mcp:read-resource')
  ipcMain.removeHandler('mcp:list-prompts')
  ipcMain.removeHandler('mcp:get-prompt')
  ipcMain.removeHandler('mcp:execute-tool')
  ipcMain.removeHandler('mcp:resolve-approval')
  ipcMain.removeHandler('mcp:start-oauth')
  ipcMain.removeHandler('mcp:clear-oauth')
  ipcMain.removeHandler('mcp:get-auth-status')
  ipcMain.removeHandler('mcp:resolve-add-request')
  ipcMain.removeHandler('mcp:approve-add-request')
  ipcMain.removeHandler('mcp:cancel-add-request')
}

function broadcastMcpSnapshot(snapshot: McpRuntimeSnapshot): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(MCP_STATE_CHANGED_CHANNEL, snapshot)
    }
  }
}

function assertMcpServerId(serverId: string): string {
  if (typeof serverId !== 'string' || !serverId.trim()) {
    throw new Error('Invalid MCP server id')
  }

  return serverId.trim()
}

function assertApprovalRequestId(requestId: string): string {
  if (typeof requestId !== 'string' || !requestId.trim()) {
    throw new Error('Invalid MCP approval request id')
  }

  return requestId.trim()
}

function assertMcpAddRequestId(requestId: string): string {
  if (typeof requestId !== 'string' || !requestId.trim()) {
    throw new Error('Invalid MCP add request id')
  }

  return requestId.trim()
}

function assertMcpToolName(namespacedToolName: string): string {
  if (
    typeof namespacedToolName !== 'string' ||
    !/^mcp__([a-z0-9_]+)__([a-z0-9_]+)$/.test(namespacedToolName.trim())
  ) {
    throw new Error('Invalid MCP tool name')
  }

  return namespacedToolName.trim()
}

function assertMcpUri(uri: string): string {
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new Error('Invalid MCP resource uri')
  }

  return uri.trim()
}

function assertMcpPromptName(promptName: string): string {
  if (typeof promptName !== 'string' || !promptName.trim()) {
    throw new Error('Invalid MCP prompt name')
  }

  return promptName.trim()
}

function assertArgumentsRecord(args: unknown): Record<string, unknown> {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return {}
  }

  return args as Record<string, unknown>
}

function assertMcpExecutionContext(value: unknown): {
  approvalToken?: string
  runId?: string
} {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid MCP execution context')
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => key !== 'approvalToken' && key !== 'runId')) {
    throw new Error('Invalid MCP execution context')
  }
  if (
    record.approvalToken !== undefined &&
    (typeof record.approvalToken !== 'string' ||
      record.approvalToken.length < 1 ||
      record.approvalToken.length > 200)
  ) {
    throw new Error('Invalid MCP approval token')
  }
  if (
    record.runId !== undefined &&
    (typeof record.runId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(record.runId))
  ) {
    throw new Error('Invalid MCP Agent run id')
  }
  return {
    approvalToken: record.approvalToken as string | undefined,
    runId: record.runId as string | undefined,
  }
}

function extractServerId(serverConfig: unknown): string | null {
  if (
    typeof serverConfig !== 'object' ||
    serverConfig === null ||
    Array.isArray(serverConfig) ||
    !('id' in serverConfig)
  ) {
    return null
  }

  const value = serverConfig.id
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function buildSnapshot(manager: McpManager, approvals: McpApprovalManager): McpRuntimeSnapshot {
  return {
    ...manager.getSnapshot(),
    pendingApprovals: approvals.listPendingApprovals(),
  }
}

async function executeMcpTool(
  manager: McpManager,
  approvals: McpApprovalManager,
  namespacedToolName: string,
  args: Record<string, unknown>,
  autoApprove = false,
  signal?: AbortSignal
): Promise<McpToolExecutionResult> {
  const startedAt = Date.now()

  try {
    const executable = await manager.getExecutableTool(namespacedToolName)
    let approvalState: McpToolExecutionMetadata['approvalState'] = 'not-required'

    if (executable.server.requireApproval && !autoApprove) {
      const decision = await approvals.requestApproval({
        serverId: executable.server.id,
        serverName: executable.server.name,
        serverTransport: executable.server.transport,
        toolName: executable.tool.toolName,
        namespacedToolName,
        arguments: args,
      })

      approvalState = decision.outcome
      if (!decision.approved) {
        const rejectedOutcome = decision.outcome === 'approved' ? 'rejected' : decision.outcome
        return buildRejectedExecutionResult(executable, rejectedOutcome, startedAt)
      }
    } else if (executable.server.requireApproval && autoApprove) {
      approvalState = 'approved'
    }

    const result = signal
      ? await manager.executeTool(namespacedToolName, args, signal)
      : await manager.executeTool(namespacedToolName, args)
    const durationMs = Date.now() - startedAt
    const toolErrorMessage = extractToolErrorMessage(result.result)

    if (result.result.isError) {
      return {
        success: false,
        data: result.result,
        error: toolErrorMessage,
        metadata: {
          origin: 'mcp',
          serverId: result.server.id,
          serverName: result.server.name,
          namespacedToolName,
          originalToolName: result.tool.toolName,
          trusted: result.server.trustState === 'trusted',
          approvalState,
          durationMs,
          outcome: inferExecutionOutcome(toolErrorMessage),
        },
      }
    }

    return {
      success: true,
      data: result.result,
      metadata: {
        origin: 'mcp',
        serverId: result.server.id,
        serverName: result.server.name,
        namespacedToolName,
        originalToolName: result.tool.toolName,
        trusted: result.server.trustState === 'trusted',
        approvalState,
        durationMs,
        outcome: 'success',
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      error: message,
      metadata: {
        origin: 'mcp',
        serverId: '',
        serverName: '',
        namespacedToolName,
        originalToolName: namespacedToolName,
        trusted: false,
        approvalState: 'not-required',
        durationMs: Date.now() - startedAt,
        outcome: inferExecutionOutcome(message),
      },
    }
  }
}

function buildCoordinatorDeniedResult(
  namespacedToolName: string,
  reason:
    | 'cancelled'
    | 'tool_budget'
    | 'mutation_budget'
    | 'time_budget'
    | 'global_capacity'
    | 'sender_capacity'
): McpToolExecutionResult {
  const message = `Agent run stopped by ${reason.replace(/_/g, ' ')}.`
  return {
    success: false,
    error: message,
    metadata: {
      origin: 'mcp',
      serverId: '',
      serverName: '',
      namespacedToolName,
      originalToolName: namespacedToolName,
      trusted: false,
      approvalState: 'not-required',
      durationMs: 0,
      outcome: inferExecutionOutcome(message),
    },
  }
}

function buildRejectedExecutionResult(
  executable: Awaited<ReturnType<McpManager['getExecutableTool']>>,
  outcome: Extract<McpApprovalOutcome, 'rejected' | 'timed_out' | 'cancelled'>,
  startedAt: number
): McpToolExecutionResult {
  const errorMessage =
    outcome === 'timed_out'
      ? `Approval timed out for MCP tool "${executable.tool.toolName}".`
      : outcome === 'cancelled'
        ? `Approval was cancelled for MCP tool "${executable.tool.toolName}".`
        : `Approval rejected for MCP tool "${executable.tool.toolName}".`

  return {
    success: false,
    error: errorMessage,
    metadata: {
      origin: 'mcp',
      serverId: executable.server.id,
      serverName: executable.server.name,
      namespacedToolName: executable.tool.namespacedName,
      originalToolName: executable.tool.toolName,
      trusted: executable.server.trustState === 'trusted',
      approvalState: outcome,
      durationMs: Date.now() - startedAt,
      outcome,
    },
  }
}

function extractToolErrorMessage(result: {
  content: unknown[]
  structuredContent?: unknown
  isError: boolean
}): string {
  if (!result.isError) {
    return ''
  }

  for (const entry of result.content) {
    if (typeof entry === 'string' && entry.trim()) {
      return entry.trim()
    }

    if (typeof entry === 'object' && entry !== null) {
      const record = entry as Record<string, unknown>
      if (typeof record.text === 'string' && record.text.trim()) {
        return record.text.trim()
      }
      if (typeof record.message === 'string' && record.message.trim()) {
        return record.message.trim()
      }
    }
  }

  if (typeof result.structuredContent === 'string' && result.structuredContent.trim()) {
    return result.structuredContent.trim()
  }

  return 'MCP tool execution failed'
}

function inferExecutionOutcome(message: string): McpToolExecutionMetadata['outcome'] {
  return message.toLowerCase().includes('timed out') ? 'timed_out' : 'error'
}
