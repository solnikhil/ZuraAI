import { randomUUID } from 'crypto'
import { BrowserWindow, ipcMain } from 'electron'

import type {
  McpApprovalOutcome,
  McpRuntimeSnapshot,
  McpToolExecutionMetadata,
  McpToolExecutionResult,
} from '../../src/mcp/types'

import { McpApprovalManager } from './mcpApprovalManager'
import { McpManager } from './mcpManager'
import { clearMcpServerSecrets, prepareRendererMcpServerInput } from './rendererPayload'

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

export async function initializeMcpManager(options: {
  autoConnect?: boolean
  clientInfo?: { name: string; version: string }
} = {}): Promise<McpManager> {
  const manager = getOrCreateMcpManager()
  await manager.initialize(options)
  return manager
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
    return manager.connectServer(assertMcpServerId(serverId))
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

  ipcMain.handle('mcp:execute-tool', async (_event, namespacedToolName: string, args: unknown) => {
    await manager.initialize()
    const normalizedToolName = assertMcpToolName(namespacedToolName)
    const normalizedArgs = assertArgumentsRecord(args)
    return executeMcpTool(manager, approvals, normalizedToolName, normalizedArgs)
  })

  ipcMain.handle('mcp:resolve-approval', async (_event, requestId: string, approved: boolean) => {
    return approvals.resolveApproval(assertApprovalRequestId(requestId), approved === true)
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
  ipcMain.removeHandler('mcp:list-tools')
  ipcMain.removeHandler('mcp:list-resources')
  ipcMain.removeHandler('mcp:read-resource')
  ipcMain.removeHandler('mcp:list-prompts')
  ipcMain.removeHandler('mcp:get-prompt')
  ipcMain.removeHandler('mcp:execute-tool')
  ipcMain.removeHandler('mcp:resolve-approval')
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

function assertMcpToolName(namespacedToolName: string): string {
  if (typeof namespacedToolName !== 'string' || !/^mcp__([a-z0-9_]+)__([a-z0-9_]+)$/.test(namespacedToolName.trim())) {
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
  args: Record<string, unknown>
): Promise<McpToolExecutionResult> {
  const startedAt = Date.now()

  try {
    const executable = await manager.getExecutableTool(namespacedToolName)
    let approvalState: McpToolExecutionMetadata['approvalState'] = 'not-required'

    if (executable.server.requireApproval) {
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
    }

    const result = await manager.executeTool(namespacedToolName, args)
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

function extractToolErrorMessage(result: { content: unknown[]; structuredContent?: unknown; isError: boolean }): string {
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
