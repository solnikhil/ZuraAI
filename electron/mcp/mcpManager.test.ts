// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

vi.mock('../secureStorage', () => ({
  getSecureValueAsync: vi.fn(async () => ''),
  setSecureValueAsync: vi.fn(async () => true),
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => process.cwd()),
  },
}))

import type {
  McpResolvedServerConfig,
  McpServerConfig,
  McpServerRuntimeState,
} from '../../src/mcp/types'
import { McpManager, type McpManagedConnection } from './mcpManager'

describe('McpManager', () => {
  it('registers configured servers and auto-connects enabled auto-connect entries', async () => {
    const createdConnections = new Map<string, FakeMcpConnection>()

    const manager = new McpManager({
      loadServers: async () => [
        createServerConfig({ id: 'auto-server', autoConnect: true, enabled: true }),
        createServerConfig({ id: 'manual-server', autoConnect: false, enabled: true }),
      ],
      saveServers: async () => undefined,
      resolveServerSecrets: async (server) => createResolvedServerConfig(server),
      connectionFactory: (resolvedServer) => {
        const connection = new FakeMcpConnection(resolvedServer.id)
        createdConnections.set(resolvedServer.id, connection)
        return connection
      },
    })

    const snapshot = await manager.initialize({ autoConnect: true })

    expect(snapshot.servers).toHaveLength(2)
    expect(snapshot.runtimeStates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ serverId: 'auto-server', status: 'connected' }),
        expect.objectContaining({ serverId: 'manual-server', status: 'disconnected' }),
      ])
    )
    expect(manager.listTools()).toEqual([
      expect.objectContaining({
        serverId: 'auto-server',
        namespacedName: 'mcp__server__read_file',
      }),
    ])
    expect(createdConnections.get('auto-server')?.connectCalls).toBe(1)
    expect(createdConnections.has('manual-server')).toBe(false)
  })

  it('supports connect/disconnect and keeps disconnected or errored servers out of active tools', async () => {
    const createdConnections = new Map<string, FakeMcpConnection>()
    const manager = new McpManager({
      loadServers: async () => [createServerConfig({ id: 'server-1', enabled: true })],
      saveServers: async () => undefined,
      resolveServerSecrets: async (server) => createResolvedServerConfig(server),
      connectionFactory: (resolvedServer) => {
        const connection = new FakeMcpConnection(resolvedServer.id)
        createdConnections.set(resolvedServer.id, connection)
        return connection
      },
    })

    await manager.initialize({ autoConnect: false })
    expect(manager.listTools()).toEqual([])

    await manager.connectServer('server-1')
    expect(manager.listTools()).toHaveLength(1)

    const connection = createdConnections.get('server-1')
    expect(connection).toBeDefined()
    connection?.emitState({
      status: 'error',
      error: 'boom',
      lastConnectionError: 'boom',
    })

    expect(manager.listTools()).toEqual([])

    await manager.disconnectServer('server-1')
    expect(manager.listTools()).toEqual([])
  })

  it('requires trusted servers before surfacing or executing MCP tools', async () => {
    const manager = new McpManager({
      loadServers: async () => [
        createServerConfig({ id: 'server-1', enabled: true, trustState: 'untrusted' }),
      ],
      saveServers: async () => undefined,
      resolveServerSecrets: async (server) => createResolvedServerConfig(server),
      connectionFactory: (resolvedServer) => new FakeMcpConnection(resolvedServer.id),
    })

    await manager.initialize({ autoConnect: false })
    await manager.connectServer('server-1')

    expect(manager.listTools()).toEqual([])
    await expect(
      manager.executeTool('mcp__server__read_file', { path: '/tmp/demo.txt' })
    ).rejects.toThrow('Unknown or unavailable MCP tool')
  })

  it('executes a connected trusted MCP tool through the managed connection', async () => {
    const manager = new McpManager({
      loadServers: async () => [
        createServerConfig({ id: 'server-1', enabled: true, trustState: 'trusted' }),
      ],
      saveServers: async () => undefined,
      resolveServerSecrets: async (server) => createResolvedServerConfig(server),
      connectionFactory: (resolvedServer) => new FakeMcpConnection(resolvedServer.id),
    })

    await manager.initialize({ autoConnect: false })
    await manager.connectServer('server-1')

    await expect(
      manager.executeTool('mcp__server__read_file', { path: '/tmp/demo.txt' })
    ).resolves.toMatchObject({
      server: { id: 'server-1' },
      tool: { toolName: 'read_file' },
      result: {
        isError: false,
        structuredContent: { path: '/tmp/demo.txt' },
      },
    })
  })

  it('emits runtime snapshots when server state changes and supports server CRUD', async () => {
    const snapshots: string[] = []
    const manager = new McpManager({
      loadServers: async () => [],
      saveServers: async () => undefined,
      resolveServerSecrets: async (server) => createResolvedServerConfig(server),
      connectionFactory: (resolvedServer) => new FakeMcpConnection(resolvedServer.id),
    })

    manager.onSnapshotChange((snapshot) => {
      snapshots.push(
        snapshot.runtimeStates.map((state) => `${state.serverId}:${state.status}`).join(',')
      )
    })

    await manager.initialize({ autoConnect: false })
    const created = await manager.addServer({
      name: 'Filesystem',
      transport: 'stdio',
      command: 'node',
    })
    expect(created.name).toBe('Filesystem')

    const updated = await manager.updateServer(created.id, { enabled: true, autoConnect: true })
    expect(updated.enabled).toBe(true)

    const removed = await manager.removeServer(created.id)
    expect(removed).toBe(true)
    expect(manager.listServers()).toEqual([])
    expect(snapshots.length).toBeGreaterThanOrEqual(3)
  })

  it('does not retain oversized MCP resource payloads in cache', async () => {
    const connection = new FakeMcpConnection('server-1')
    const readResourceSpy = vi.spyOn(connection, 'readResource').mockResolvedValue({
      contents: [{ uri: 'file:///tmp/demo.txt', text: 'x'.repeat(600 * 1024) }],
    })

    const manager = new McpManager({
      loadServers: async () => [
        createServerConfig({ id: 'server-1', enabled: true, trustState: 'trusted' }),
      ],
      saveServers: async () => undefined,
      resolveServerSecrets: async (server) => createResolvedServerConfig(server),
      connectionFactory: () => connection,
    })

    await manager.initialize({ autoConnect: false })
    await manager.connectServer('server-1')

    await manager.readResource('server-1', 'file:///tmp/demo.txt')
    await manager.readResource('server-1', 'file:///tmp/demo.txt')

    expect(readResourceSpy).toHaveBeenCalledTimes(2)
  })

  it('marks OAuth servers as needing sign-in when bearer preparation fails', async () => {
    const savedServerBatches: McpServerConfig[][] = []
    const manager = new McpManager({
      loadServers: async () => [
        createServerConfig({
          id: 'oauth-server',
          transport: 'sse',
          command: undefined,
          url: 'https://mcp.example.com/sse',
          auth: {
            mode: 'oauth2Pkce',
            state: 'signed_in',
            oauth: {
              accessTokenKey: 'mcp.server.oauth-server.oauth.accessToken',
              refreshTokenKey: 'mcp.server.oauth-server.oauth.refreshToken',
            },
          },
        }),
      ],
      saveServers: async (servers) => {
        savedServerBatches.push(servers)
      },
      resolveServerSecrets: async (server) => createResolvedServerConfig(server),
      connectionFactory: (resolvedServer) => new FakeMcpConnection(resolvedServer.id),
    })

    await manager.initialize({ autoConnect: false })

    await expect(manager.connectServer('oauth-server')).rejects.toThrow('needs sign-in')
    expect(manager.getAuthStatus('oauth-server')).toEqual(
      expect.objectContaining({
        state: 'reauth_required',
        requiresSignIn: true,
      })
    )
    expect(savedServerBatches.at(-1)?.[0]?.auth).toEqual(
      expect.objectContaining({
        mode: 'oauth2Pkce',
        state: 'reauth_required',
      })
    )
  })
})

class FakeMcpConnection implements McpManagedConnection {
  private readonly handlers = new Set<(state: McpServerRuntimeState) => void>()
  private state: McpServerRuntimeState

  connectCalls = 0
  disconnectCalls = 0
  callToolCalls: Array<{ toolName: string; args: Record<string, unknown> }> = []

  constructor(serverId: string) {
    this.state = {
      serverId,
      status: 'disconnected',
      tools: [],
      capabilities: {
        tools: false,
        resources: false,
        prompts: false,
      },
      resources: [],
      prompts: [],
      lastConnectionError: null,
      lastConnectionTime: null,
      lastUpdatedAt: new Date().toISOString(),
    }
  }

  getRuntimeState(): McpServerRuntimeState {
    return cloneRuntimeState(this.state)
  }

  getLastConnectionError(): string | null {
    return this.state.lastConnectionError ?? null
  }

  getLastSuccessTimestamp(): string | null {
    return this.state.lastConnectionTime ?? null
  }

  onRuntimeStateChange(handler: (state: McpServerRuntimeState) => void): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  async connect(): Promise<McpServerRuntimeState> {
    this.connectCalls += 1
    this.state = {
      ...this.state,
      status: 'connected',
      capabilities: {
        tools: true,
        resources: true,
        prompts: true,
      },
      tools: [
        {
          name: 'read_file',
          inputSchema: { type: 'object' },
        },
      ],
      resources: [
        {
          uri: 'file:///tmp/demo.txt',
          title: 'Demo File',
        },
      ],
      prompts: [
        {
          name: 'summarize_demo',
          title: 'Summarize Demo',
        },
      ],
      lastConnectionError: null,
      lastConnectionTime: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    }
    this.emit()
    return this.getRuntimeState()
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1
    this.state = {
      ...this.state,
      status: 'disconnected',
      lastUpdatedAt: new Date().toISOString(),
    }
    this.emit()
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ content: unknown[]; structuredContent?: unknown; isError: boolean }> {
    this.callToolCalls.push({ toolName, args })
    return {
      content: [
        {
          type: 'text',
          text: `called ${toolName}`,
        },
      ],
      structuredContent: args,
      isError: false,
    }
  }

  async listResources() {
    return this.state.resources
  }

  async readResource(uri: string) {
    return {
      contents: [
        {
          uri,
          text: `resource ${uri}`,
        },
      ],
    }
  }

  async listPrompts() {
    return this.state.prompts
  }

  async getPrompt(name: string, args: Record<string, unknown>) {
    return {
      messages: [
        {
          role: 'user',
          content: `${name}:${JSON.stringify(args)}`,
        },
      ],
    }
  }

  emitState(partial: Partial<McpServerRuntimeState>): void {
    this.state = {
      ...this.state,
      ...partial,
      tools: partial.tools ?? this.state.tools,
      capabilities: partial.capabilities ?? this.state.capabilities,
      lastUpdatedAt: new Date().toISOString(),
    }
    this.emit()
  }

  private emit(): void {
    const runtimeState = this.getRuntimeState()
    for (const handler of this.handlers) {
      handler(runtimeState)
    }
  }
}

function createServerConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: 'server-1',
    name: 'Server',
    enabled: true,
    trustState: 'trusted',
    transport: 'stdio',
    command: 'node',
    args: [],
    cwd: process.cwd(),
    url: undefined,
    env: [],
    headers: [],
    autoConnect: false,
    startupTimeoutMs: 500,
    toolTimeoutMs: 500,
    reconnectAttempts: 0,
    reconnectDelayMs: 1000,
    requireApproval: true,
    lastKnownTools: [],
    lastKnownResources: [],
    lastKnownPrompts: [],
    lastConnectionError: null,
    lastConnectionTime: null,
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
    ...overrides,
  }
}

function createResolvedServerConfig(server: McpServerConfig): McpResolvedServerConfig {
  return {
    ...server,
    args: server.args ?? [],
    env: {},
    headers: {},
  }
}

function cloneRuntimeState(runtimeState: McpServerRuntimeState): McpServerRuntimeState {
  return {
    ...runtimeState,
    tools: runtimeState.tools.map((tool) => ({
      ...tool,
      inputSchema: { ...tool.inputSchema },
      annotations: tool.annotations ? { ...tool.annotations } : undefined,
    })),
    resources: (runtimeState.resources ?? []).map((resource) => ({
      ...resource,
      annotations: resource.annotations ? { ...resource.annotations } : undefined,
    })),
    prompts: (runtimeState.prompts ?? []).map((prompt) => ({
      ...prompt,
      arguments: prompt.arguments
        ? prompt.arguments.map((argument) => ({ ...argument }))
        : undefined,
    })),
    capabilities: { ...runtimeState.capabilities },
    connectionInfo: runtimeState.connectionInfo ? { ...runtimeState.connectionInfo } : undefined,
  }
}
