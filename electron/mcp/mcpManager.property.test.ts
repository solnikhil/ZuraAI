// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => process.cwd()),
  },
}))

import type { McpResolvedServerConfig, McpServerConfig, McpServerRuntimeState } from '../../src/mcp/types'
import { McpManager, type McpManagedConnection } from './mcpManager'

describe('McpManager property checks', () => {
  it('surfaces only enabled, trusted, connected, policy-allowed tools across server combinations', async () => {
    const combinations: McpServerConfig[] = [
      createServer({ id: 'enabled-trusted', enabled: true, trustState: 'trusted' }),
      createServer({ id: 'disabled-trusted', enabled: false, trustState: 'trusted' }),
      createServer({ id: 'enabled-untrusted', enabled: true, trustState: 'untrusted' }),
      createServer({
        id: 'allowlisted',
        enabled: true,
        trustState: 'trusted',
        toolAllowlist: ['read_file'],
      }),
      createServer({
        id: 'blocklisted',
        enabled: true,
        trustState: 'trusted',
        toolBlocklist: ['read_file'],
      }),
    ]

    const manager = new McpManager({
      loadServers: async () => combinations,
      saveServers: async () => undefined,
      resolveServerSecrets: async (server) => createResolved(server),
      connectionFactory: (server) => new PolicyAwareConnection(server.id),
    })

    await manager.initialize({ autoConnect: false })
    await Promise.all(combinations.map((server) => manager.connectServer(server.id)))

    expect(manager.listTools().map((tool) => tool.namespacedName).sort()).toEqual([
      'mcp__allowlisted__read_file',
      'mcp__blocklisted__delete_file',
      'mcp__enabled_trusted__delete_file',
      'mcp__enabled_trusted__read_file',
    ])
  })

  it('auto-connects exactly the servers that are both enabled and opted in', async () => {
    const servers = [
      createServer({ id: 'auto-1', enabled: true, autoConnect: true }),
      createServer({ id: 'auto-2', enabled: true, autoConnect: true }),
      createServer({ id: 'disabled-auto', enabled: false, autoConnect: true }),
      createServer({ id: 'manual', enabled: true, autoConnect: false }),
    ]

    const connections = new Map<string, PolicyAwareConnection>()
    const manager = new McpManager({
      loadServers: async () => servers,
      saveServers: async () => undefined,
      resolveServerSecrets: async (server) => createResolved(server),
      connectionFactory: (server) => {
        const connection = new PolicyAwareConnection(server.id)
        connections.set(server.id, connection)
        return connection
      },
    })

    await manager.initialize({ autoConnect: true })

    expect(connections.get('auto-1')?.connectCalls).toBe(1)
    expect(connections.get('auto-2')?.connectCalls).toBe(1)
    expect(connections.has('disabled-auto')).toBe(false)
    expect(connections.has('manual')).toBe(false)
  })

  it('makes colliding namespaced tool identities deterministic and unique', async () => {
    const servers = [
      createServer({ id: 'server-a', name: 'Filesystem', enabled: true, trustState: 'trusted' }),
      createServer({ id: 'server-b', name: 'Filesystem', enabled: true, trustState: 'trusted' }),
    ]

    const manager = new McpManager({
      loadServers: async () => servers,
      saveServers: async () => undefined,
      resolveServerSecrets: async (server) => createResolved(server),
      connectionFactory: (server) => new PolicyAwareConnection(server.id),
    })

    await manager.initialize({ autoConnect: false })
    await Promise.all(servers.map((server) => manager.connectServer(server.id)))

    const names = manager
      .listTools()
      .filter((tool) => tool.toolName === 'read_file')
      .map((tool) => tool.namespacedName)
      .sort()

    expect(names).toEqual([
      'mcp__filesystem__read_file',
      'mcp__filesystem_server_b__read_file',
    ])
  })
})

class PolicyAwareConnection implements McpManagedConnection {
  private state: McpServerRuntimeState
  private readonly handlers = new Set<(state: McpServerRuntimeState) => void>()
  connectCalls = 0

  constructor(serverId: string) {
    this.state = {
      serverId,
      status: 'disconnected',
      tools: [],
      resources: [],
      prompts: [],
      capabilities: { tools: false, resources: false, prompts: false },
      lastConnectionError: null,
      lastConnectionTime: null,
    }
  }

  getRuntimeState(): McpServerRuntimeState {
    return structuredClone(this.state)
  }

  getLastConnectionError(): string | null {
    return this.state.lastConnectionError ?? null
  }

  getLastSuccessTimestamp(): string | null {
    return this.state.lastConnectionTime ?? null
  }

  onRuntimeStateChange(handler: (state: McpServerRuntimeState) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  async connect(): Promise<McpServerRuntimeState> {
    this.connectCalls += 1
    this.state = {
      ...this.state,
      status: 'connected',
      tools: [
        { name: 'read_file', inputSchema: { type: 'object' } },
        { name: 'delete_file', inputSchema: { type: 'object' } },
      ],
      capabilities: { tools: true, resources: false, prompts: false },
      lastConnectionTime: new Date().toISOString(),
    }
    this.emit()
    return this.getRuntimeState()
  }

  async disconnect(): Promise<void> {
    this.state = { ...this.state, status: 'disconnected' }
    this.emit()
  }

  async listResources() {
    return []
  }

  async readResource() {
    return { contents: [] }
  }

  async listPrompts() {
    return []
  }

  async getPrompt() {
    return { messages: [] }
  }

  async callTool(toolName: string, args: Record<string, unknown>) {
    return { content: [{ type: 'text', text: toolName }], structuredContent: args, isError: false }
  }

  private emit() {
    const snapshot = this.getRuntimeState()
    for (const handler of this.handlers) {
      handler(snapshot)
    }
  }
}

function createServer(overrides: Partial<McpServerConfig>): McpServerConfig {
  return {
    id: 'server',
    name: overrides.id ?? 'Server',
    enabled: true,
    trustState: 'trusted',
    transport: 'stdio',
    command: 'node',
    args: [],
    env: [],
    headers: [],
    autoConnect: false,
    requireApproval: true,
    toolAllowlist: [],
    toolBlocklist: [],
    lastKnownTools: [],
    lastKnownResources: [],
    lastKnownPrompts: [],
    lastConnectionError: null,
    lastConnectionTime: null,
    createdAt: '2026-03-21T00:00:00.000Z',
    updatedAt: '2026-03-21T00:00:00.000Z',
    ...overrides,
  }
}

function createResolved(server: McpServerConfig): McpResolvedServerConfig {
  return {
    ...server,
    env: {},
    headers: {},
  }
}
