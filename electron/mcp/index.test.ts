// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const indexMocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  removeHandler: vi.fn((channel: string) => {
    indexMocks.handlers.delete(channel)
  }),
  windows: [] as Array<{
    isDestroyed: () => boolean
    webContents: { send: ReturnType<typeof vi.fn> }
  }>,
  getAllWindows: vi.fn(() => indexMocks.windows),
  openPath: vi.fn(async () => ''),
  getMcpStoreFilePath: vi.fn(() => '/tmp/zura-mcp-test/mcp-servers.json'),
  saveMcpServers: vi.fn(async () => undefined),
  managerInstances: [] as MockMcpManager[],
  approvalInstances: [] as Array<{
    requestApproval: ReturnType<typeof vi.fn>
    resolveApproval: ReturnType<typeof vi.fn>
  }>,
}))

vi.mock('../ipc/trustedIpc', () => ({
  trustedIpcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      indexMocks.handlers.set(channel, handler)
    },
    removeHandler: indexMocks.removeHandler,
  },
}))

class MockMcpManager {
  readonly initialize = vi.fn(async () => this.getSnapshot())
  readonly dispose = vi.fn(async () => undefined)
  readonly listServers = vi.fn(() => [{ id: 'server-1', name: 'Server', enabled: true }])
  readonly addServer = vi.fn(async (serverConfig: unknown) => ({
    id: 'server-2',
    ...toRecord(serverConfig),
  }))
  readonly updateServer = vi.fn(async (serverId: string, updates: unknown) => ({
    id: serverId,
    ...toRecord(updates),
  }))
  readonly removeServer = vi.fn(async () => true)
  readonly connectServer = vi.fn(async (serverId: string) => ({
    serverId,
    status: 'connected',
    tools: [],
    capabilities: { tools: true, resources: false, prompts: false },
    lastConnectionError: null,
    lastConnectionTime: null,
  }))
  readonly disconnectServer = vi.fn(async (serverId: string) => ({
    serverId,
    status: 'disconnected',
    tools: [],
    capabilities: { tools: false, resources: false, prompts: false },
    lastConnectionError: null,
    lastConnectionTime: null,
  }))
  readonly getSnapshot = vi.fn(() => ({
    servers: [{ id: 'server-1', name: 'Server', enabled: true }],
    runtimeStates: [
      {
        serverId: 'server-1',
        status: 'connected',
        tools: [],
        capabilities: { tools: true, resources: false, prompts: false },
        lastConnectionError: null,
        lastConnectionTime: null,
      },
    ],
    tools: [{ namespacedName: 'mcp__server__read_file' }],
    resources: [],
    prompts: [],
    authStatuses: [],
    pendingApprovals: [],
  }))
  readonly startOAuth = vi.fn(async (serverId: string) => ({
    ok: true,
    status: {
      serverId,
      mode: 'oauth2Pkce',
      state: 'signed_in',
      label: 'Signed in',
      requiresSignIn: false,
      lastError: null,
    },
  }))
  readonly clearOAuth = vi.fn(async (serverId: string) => ({
    serverId,
    mode: 'oauth2Pkce',
    state: 'reauth_required',
    label: 'Needs sign-in',
    requiresSignIn: true,
    lastError: null,
  }))
  readonly getAuthStatus = vi.fn((serverId: string) => ({
    serverId,
    mode: 'none',
    state: 'none',
    label: 'No auth',
    requiresSignIn: false,
    lastError: null,
  }))
  readonly listTools = vi.fn(() => [{ namespacedName: 'mcp__server__read_file' }])
  readonly listResources = vi.fn(() => [])
  readonly getServerResources = vi.fn(async () => [])
  readonly readResource = vi.fn(async () => ({ contents: [] }))
  readonly listPrompts = vi.fn(() => [])
  readonly getServerPrompts = vi.fn(async () => [])
  readonly getPrompt = vi.fn(async () => ({ messages: [] }))
  readonly getServerTools = vi.fn(async (serverId: string) => [
    { namespacedName: `mcp__${serverId}__read_file` },
  ])
  readonly getExecutableTool = vi.fn(async (namespacedToolName: string) => ({
    server: {
      id: 'server-1',
      name: 'Server',
      trustState: 'trusted',
      transport: 'stdio',
      requireApproval: false,
    },
    tool: { namespacedName: namespacedToolName, toolName: 'read_file' },
    connection: {},
  }))
  readonly executeTool = vi.fn(
    async (_namespacedToolName: string, args: Record<string, unknown>) => ({
      server: {
        id: 'server-1',
        name: 'Server',
        trustState: 'trusted',
        transport: 'stdio',
        requireApproval: false,
      },
      tool: { namespacedName: 'mcp__server__read_file', toolName: 'read_file' },
      result: { content: [{ type: 'text', text: 'ok' }], structuredContent: args, isError: false },
    })
  )

  private snapshotHandler: ((snapshot: unknown) => void) | null = null
  private unsubscribe = vi.fn()

  readonly onSnapshotChange = vi.fn((handler: (snapshot: unknown) => void) => {
    this.snapshotHandler = handler
    return this.unsubscribe
  })

  emitSnapshot(snapshot = this.getSnapshot()): void {
    this.snapshotHandler?.(snapshot)
  }

  getUnsubscribeMock() {
    return this.unsubscribe
  }
}

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/zura-mcp-test'),
    isPackaged: false,
  },
  BrowserWindow: {
    getAllWindows: indexMocks.getAllWindows,
  },
  shell: {
    openPath: indexMocks.openPath,
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      indexMocks.handlers.set(channel, handler)
    }),
    removeHandler: indexMocks.removeHandler,
  },
}))

vi.mock('./mcpStorage', () => ({
  getMcpStoreFilePath: indexMocks.getMcpStoreFilePath,
  saveMcpServers: indexMocks.saveMcpServers,
}))

vi.mock('./mcpManager', () => ({
  McpManager: class MockedMcpManager extends MockMcpManager {
    constructor() {
      super()
      indexMocks.managerInstances.push(this)
    }
  },
}))

vi.mock('./rendererPayload', () => ({
  prepareRendererMcpServerInput: vi.fn(
    async (serverConfig: unknown, options: { serverId: string }) => ({
      ...(typeof serverConfig === 'object' && serverConfig !== null && !Array.isArray(serverConfig)
        ? serverConfig
        : {}),
      id: options.serverId,
    })
  ),
  clearMcpServerSecrets: vi.fn(async () => undefined),
}))

vi.mock('./mcpAddRequests', () => ({
  getPendingMcpAddRequest: vi.fn((requestId: string) => ({
    requestId,
    status: 'pending',
    mode: 'catalogue',
    serverName: 'Gmail',
    sourceLabel: 'npm package',
    reason: 'Add Gmail.',
    transport: 'stdio',
    requiredSecrets: [],
    authMode: 'none',
    riskNotes: [],
    canAdd: true,
  })),
  cancelPendingMcpAddRequest: vi.fn((requestId: string) => ({
    requestId,
    status: 'cancelled',
    mode: 'catalogue',
    serverName: 'Gmail',
    sourceLabel: 'npm package',
    reason: 'Add Gmail.',
    transport: 'stdio',
    requiredSecrets: [],
    authMode: 'none',
    riskNotes: [],
    canAdd: true,
  })),
  approvePendingMcpAddRequest: vi.fn(
    async (
      requestId: string,
      options: {
        addServer: (payload: unknown) => Promise<unknown>
        connectServer: (serverId: string) => Promise<unknown>
      }
    ) => {
      const server = await options.addServer({ id: 'server-2', name: 'Gmail' })
      const runtimeState = await options.connectServer('server-2')
      return { requestId, status: 'connected', server, runtimeState, requiredSecrets: [] }
    }
  ),
}))

vi.mock('./mcpApprovalManager', () => ({
  McpApprovalManager: class {
    readonly listPendingApprovals = vi.fn(() => [])
    readonly onPendingApprovalsChange = vi.fn(() => vi.fn())
    readonly requestApproval = vi.fn(async () => ({
      requestId: 'approval-1',
      approved: true,
      resolvedAt: Date.now(),
      outcome: 'approved',
    }))
    readonly resolveApproval = vi.fn(async (_requestId: string, approved: boolean) => ({
      requestId: 'approval-1',
      approved,
      resolvedAt: Date.now(),
      outcome: approved ? 'approved' : 'rejected',
    }))
    readonly rejectRequestsForServer = vi.fn()
    readonly dispose = vi.fn()

    constructor() {
      indexMocks.approvalInstances.push({
        requestApproval: this.requestApproval,
        resolveApproval: this.resolveApproval,
      })
    }
  },
}))

describe('electron MCP handler registration', () => {
  beforeEach(() => {
    vi.resetModules()
    indexMocks.handlers.clear()
    indexMocks.removeHandler.mockClear()
    indexMocks.getAllWindows.mockClear()
    indexMocks.openPath.mockClear()
    indexMocks.getMcpStoreFilePath.mockClear()
    indexMocks.saveMcpServers.mockClear()
    indexMocks.managerInstances.length = 0
    indexMocks.approvalInstances.length = 0
    indexMocks.windows = [
      {
        isDestroyed: () => false,
        webContents: { send: vi.fn() },
      },
    ]
  })

  it('registers handlers, delegates to the manager, and broadcasts snapshot updates', async () => {
    const mcpIndex = await import('./index')

    mcpIndex.registerMcpHandlers()

    const manager = getManagerInstance()
    expect(new Set(indexMocks.handlers.keys())).toEqual(
      new Set([
        'mcp:list-servers',
        'mcp:add-server',
        'mcp:update-server',
        'mcp:remove-server',
        'mcp:connect-server',
        'mcp:disconnect-server',
        'mcp:get-state',
        'mcp:start-oauth',
        'mcp:clear-oauth',
        'mcp:get-auth-status',
        'mcp:resolve-add-request',
        'mcp:approve-add-request',
        'mcp:cancel-add-request',
        'mcp:open-config-file',
        'mcp:list-tools',
        'mcp:list-resources',
        'mcp:read-resource',
        'mcp:list-prompts',
        'mcp:get-prompt',
        'mcp:execute-tool',
        'mcp:resolve-approval',
      ])
    )

    await expect(invokeHandler('mcp:list-servers')).resolves.toEqual([
      { id: 'server-1', name: 'Server', enabled: true },
    ])
    await expect(invokeHandler('mcp:connect-server', {}, ' server-1 ')).resolves.toEqual(
      expect.objectContaining({ serverId: 'server-1', status: 'connected' })
    )
    await expect(invokeHandler('mcp:list-tools', {}, 'server-1')).resolves.toEqual([
      { namespacedName: 'mcp__server-1__read_file' },
    ])
    await expect(
      invokeHandler('mcp:execute-tool', {}, 'mcp__server__read_file', { path: 'demo.txt' })
    ).resolves.toEqual(expect.objectContaining({ success: true }))
    await expect(invokeHandler('mcp:get-state')).resolves.toEqual(manager.getSnapshot())
    await expect(invokeHandler('mcp:start-oauth', {}, 'server-1')).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        status: expect.objectContaining({ state: 'signed_in' }),
      })
    )
    await expect(invokeHandler('mcp:get-auth-status', {}, 'server-1')).resolves.toEqual(
      expect.objectContaining({ label: 'No auth' })
    )
    await expect(invokeHandler('mcp:clear-oauth', {}, 'server-1')).resolves.toEqual(
      expect.objectContaining({ state: 'reauth_required' })
    )
    await expect(invokeHandler('mcp:resolve-add-request', {}, 'add-1')).resolves.toEqual(
      expect.objectContaining({ requestId: 'add-1', serverName: 'Gmail' })
    )
    await expect(invokeHandler('mcp:approve-add-request', {}, 'add-1')).resolves.toEqual(
      expect.objectContaining({ requestId: 'add-1', status: 'connected' })
    )
    await expect(invokeHandler('mcp:cancel-add-request', {}, 'add-2')).resolves.toEqual(
      expect.objectContaining({ requestId: 'add-2', status: 'cancelled' })
    )
    await expect(invokeHandler('mcp:open-config-file')).resolves.toEqual({
      ok: true,
      path: '/tmp/zura-mcp-test/mcp-servers.json',
      error: undefined,
    })

    expect(manager.initialize).toHaveBeenCalledTimes(10)
    expect(manager.listServers).toHaveBeenCalledTimes(2)
    expect(manager.connectServer).toHaveBeenCalledWith('server-1')
    expect(manager.getServerTools).toHaveBeenCalledWith('server-1')
    expect(manager.startOAuth).toHaveBeenCalledWith('server-1')
    expect(manager.getAuthStatus).toHaveBeenCalledWith('server-1')
    expect(manager.clearOAuth).toHaveBeenCalledWith('server-1')
    expect(manager.connectServer).toHaveBeenCalledWith('server-2')
    expect(manager.getSnapshot).toHaveBeenCalled()
    expect(indexMocks.saveMcpServers).toHaveBeenCalledWith([
      { id: 'server-1', name: 'Server', enabled: true },
    ])
    expect(indexMocks.openPath).toHaveBeenCalledWith('/tmp/zura-mcp-test/mcp-servers.json')

    const snapshot = manager.getSnapshot()
    manager.emitSnapshot(snapshot)
    expect(indexMocks.windows[0]?.webContents.send).toHaveBeenCalledWith(
      'mcp:state-changed',
      snapshot
    )
  })

  it('supports lifecycle helpers and unregisters handlers cleanly', async () => {
    const mcpIndex = await import('./index')

    const initializedManager = await mcpIndex.initializeMcpManager({
      autoConnect: true,
      clientInfo: { name: 'ZuraAI', version: '1.0.0' },
    })
    expect(getManagerInstance()).toBe(initializedManager)
    expect(getManagerInstance().initialize).toHaveBeenCalledWith({
      autoConnect: true,
      clientInfo: { name: 'ZuraAI', version: '1.0.0' },
    })

    mcpIndex.registerMcpHandlers()
    const manager = getManagerInstance()

    mcpIndex.unregisterMcpHandlers()
    expect(manager.getUnsubscribeMock()).toHaveBeenCalledTimes(1)
    expect(indexMocks.removeHandler).toHaveBeenCalledWith('mcp:list-servers')
    expect(indexMocks.removeHandler).toHaveBeenCalledWith('mcp:list-tools')
    expect(indexMocks.removeHandler).toHaveBeenCalledWith('mcp:start-oauth')
    expect(indexMocks.removeHandler).toHaveBeenCalledWith('mcp:clear-oauth')
    expect(indexMocks.removeHandler).toHaveBeenCalledWith('mcp:get-auth-status')
    expect(indexMocks.removeHandler).toHaveBeenCalledWith('mcp:resolve-add-request')
    expect(indexMocks.removeHandler).toHaveBeenCalledWith('mcp:approve-add-request')
    expect(indexMocks.removeHandler).toHaveBeenCalledWith('mcp:cancel-add-request')
    expect(indexMocks.removeHandler).toHaveBeenCalledWith('mcp:open-config-file')
    expect(indexMocks.removeHandler).toHaveBeenCalledWith('mcp:list-resources')
    expect(indexMocks.removeHandler).toHaveBeenCalledWith('mcp:list-prompts')

    await mcpIndex.shutdownMcpManager()
    expect(manager.dispose).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid MCP server ids at the IPC boundary', async () => {
    const mcpIndex = await import('./index')

    mcpIndex.registerMcpHandlers()

    await expect(invokeHandler('mcp:connect-server', {}, '   ')).rejects.toThrow(
      'Invalid MCP server id'
    )
    await expect(invokeHandler('mcp:start-oauth', {}, '   ')).rejects.toThrow(
      'Invalid MCP server id'
    )
    await expect(invokeHandler('mcp:disconnect-server', {}, '')).rejects.toThrow(
      'Invalid MCP server id'
    )
  })

  it('does not let the renderer execute arbitrary MCP tool names or bypass approval', async () => {
    const mcpIndex = await import('./index')

    mcpIndex.registerMcpHandlers()

    const manager = getManagerInstance()
    const approvals = indexMocks.approvalInstances[0]
    manager.getExecutableTool.mockResolvedValueOnce({
      server: {
        id: 'server-1',
        name: 'Server',
        trustState: 'trusted',
        transport: 'stdio',
        requireApproval: true,
      },
      tool: {
        namespacedName: 'mcp__server__read_file',
        toolName: 'read_file',
      },
      connection: {},
    })
    approvals.requestApproval.mockResolvedValueOnce({
      requestId: 'approval-1',
      approved: false,
      resolvedAt: Date.now(),
      outcome: 'rejected',
    })

    await expect(
      invokeHandler('mcp:execute-tool', {}, 'mcp__server__read_file', { path: 'demo.txt' })
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Approval rejected'),
      })
    )
    expect(manager.executeTool).not.toHaveBeenCalled()

    manager.getExecutableTool.mockRejectedValueOnce(
      new Error('Unknown or unavailable MCP tool: mcp__server__shell_exec')
    )
    await expect(
      invokeHandler('mcp:execute-tool', {}, 'mcp__server__shell_exec', { command: 'rm -rf /' })
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: 'Unknown or unavailable MCP tool: mcp__server__shell_exec',
      })
    )
  })
})

function getManagerInstance(): MockMcpManager {
  const manager = indexMocks.managerInstances[0]
  if (!manager) {
    throw new Error('Expected an MCP manager instance to be created')
  }

  return manager
}

function invokeHandler(channel: string, ...args: any[]) {
  const handler = indexMocks.handlers.get(channel)
  if (!handler) {
    throw new Error(`Expected IPC handler for ${channel}`)
  }

  return handler(...args)
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
