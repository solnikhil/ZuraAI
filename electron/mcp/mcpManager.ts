import { randomUUID } from 'crypto'

import type {
  McpNamespacedTool,
  McpResolvedServerConfig,
  McpRuntimeSnapshot,
  McpServerConfig,
  McpServerRuntimeState,
} from '../../src/mcp/types'
import { createMcpNamespacedToolIdentity } from '../../src/mcp/types'

import { McpConnection, type McpConnectionOptions } from './mcpConnection'
import {
  loadMcpServers,
  normalizeMcpServerConfig,
  resolveMcpServerSecrets,
  saveMcpServers,
} from './mcpStorage'

type SnapshotHandler = (snapshot: McpRuntimeSnapshot) => void

export interface McpManagedConnection {
  getRuntimeState(): McpServerRuntimeState
  getLastConnectionError(): string | null
  getLastSuccessTimestamp(): string | null
  onRuntimeStateChange(handler: (state: McpServerRuntimeState) => void): () => void
  connect(): Promise<McpServerRuntimeState>
  disconnect(): Promise<void>
  callTool(toolName: string, args: Record<string, unknown>): Promise<{ content: unknown[]; structuredContent?: unknown; isError: boolean }>
}

export interface McpManagerDependencies {
  loadServers?: () => Promise<McpServerConfig[]>
  saveServers?: (servers: McpServerConfig[]) => Promise<void>
  resolveServerSecrets?: (server: McpServerConfig) => Promise<McpResolvedServerConfig>
  connectionFactory?: (
    resolvedServer: McpResolvedServerConfig,
    options: Pick<McpConnectionOptions, 'clientInfo'>
  ) => McpManagedConnection
}

export interface McpManagerInitializeOptions {
  autoConnect?: boolean
  clientInfo?: McpConnectionOptions['clientInfo']
}

export class McpManager {
  private readonly loadServers
  private readonly saveServers
  private readonly resolveServerSecrets
  private readonly connectionFactory

  private readonly servers = new Map<string, McpServerConfig>()
  private readonly connections = new Map<string, McpManagedConnection>()
  private readonly connectionUnsubscribers = new Map<string, () => void>()
  private readonly runtimeStates = new Map<string, McpServerRuntimeState>()
  private readonly snapshotHandlers = new Set<SnapshotHandler>()

  private initialized = false
  private initializationPromise: Promise<McpRuntimeSnapshot> | null = null
  private clientInfo: McpConnectionOptions['clientInfo']

  constructor(dependencies: McpManagerDependencies = {}) {
    this.loadServers = dependencies.loadServers ?? loadMcpServers
    this.saveServers = dependencies.saveServers ?? saveMcpServers
    this.resolveServerSecrets = dependencies.resolveServerSecrets ?? resolveMcpServerSecrets
    this.connectionFactory =
      dependencies.connectionFactory ??
      ((resolvedServer, options) =>
        new McpConnection({
          server: resolvedServer,
          clientInfo: options.clientInfo,
        }))
    this.clientInfo = undefined
  }

  async initialize(options: McpManagerInitializeOptions = {}): Promise<McpRuntimeSnapshot> {
    if (this.initialized) {
      return this.getSnapshot()
    }

    if (this.initializationPromise) {
      return this.initializationPromise
    }

    this.initializationPromise = this.doInitialize(options).finally(() => {
      this.initializationPromise = null
    })

    return this.initializationPromise
  }

  async dispose(): Promise<void> {
    const serverIds = [...this.connections.keys()]
    await Promise.allSettled(serverIds.map((serverId) => this.disconnectServer(serverId)))
    this.initialized = false
  }

  onSnapshotChange(handler: SnapshotHandler): () => void {
    this.snapshotHandlers.add(handler)
    return () => {
      this.snapshotHandlers.delete(handler)
    }
  }

  listServers(): McpServerConfig[] {
    return [...this.servers.values()].map((server) => cloneServer(server))
  }

  getRuntimeStates(): McpServerRuntimeState[] {
    return [...this.servers.keys()].map((serverId) => this.getRuntimeStateForServer(serverId))
  }

  listTools(): McpNamespacedTool[] {
    return [...this.servers.values()].flatMap((server) => {
      const runtimeState = this.runtimeStates.get(server.id)
      if (
        !runtimeState ||
        runtimeState.status !== 'connected' ||
        server.enabled !== true ||
        server.trustState !== 'trusted'
      ) {
        return []
      }

      return runtimeState.tools.map((manifest) => ({
        ...createMcpNamespacedToolIdentity(server.id, server.name, manifest.name),
        manifest: {
          ...manifest,
          inputSchema: { ...manifest.inputSchema },
          annotations: manifest.annotations ? { ...manifest.annotations } : undefined,
        },
      }))
    })
  }

  getSnapshot(): McpRuntimeSnapshot {
    return {
      servers: this.listServers(),
      runtimeStates: this.getRuntimeStates(),
      tools: this.listTools(),
      pendingApprovals: [],
    }
  }

  async addServer(rawServer: unknown): Promise<McpServerConfig> {
    await this.ensureInitialized()

    const now = new Date().toISOString()
    const normalized = normalizeMcpServerConfig(
      {
        ...(isRecord(rawServer) ? rawServer : {}),
        id: getOptionalTrimmedString(isRecord(rawServer) ? rawServer.id : undefined) ?? randomUUID(),
        createdAt: now,
        updatedAt: now,
      },
      this.servers.size,
      now
    )

    if (!normalized) {
      throw new Error('Invalid MCP server config')
    }

    if (this.servers.has(normalized.id)) {
      throw new Error(`MCP server already exists: ${normalized.id}`)
    }

    this.servers.set(normalized.id, normalized)
    this.runtimeStates.set(normalized.id, createInitialRuntimeState(normalized))
    await this.persistServers()
    this.emitSnapshot()
    return cloneServer(normalized)
  }

  async updateServer(serverId: string, updates: unknown): Promise<McpServerConfig> {
    await this.ensureInitialized()

    const normalizedServerId = normalizeServerId(serverId)
    const existingServer = this.getServerOrThrow(normalizedServerId)
    const isConnected = this.connections.has(normalizedServerId)

    if (isConnected) {
      await this.disconnectServer(normalizedServerId)
    }

    const now = new Date().toISOString()
    const normalized = normalizeMcpServerConfig(
      {
        ...existingServer,
        ...(isRecord(updates) ? updates : {}),
        id: normalizedServerId,
        createdAt: existingServer.createdAt,
        updatedAt: now,
      },
      0,
      now
    )

    if (!normalized) {
      throw new Error('Invalid MCP server config')
    }

    this.servers.set(normalizedServerId, normalized)
    this.runtimeStates.set(normalizedServerId, mergeRuntimeStateWithServer(normalized, this.runtimeStates.get(normalizedServerId)))
    await this.persistServers()
    this.emitSnapshot()
    return cloneServer(normalized)
  }

  async removeServer(serverId: string): Promise<boolean> {
    await this.ensureInitialized()

    const normalizedServerId = normalizeServerId(serverId)
    if (!this.servers.has(normalizedServerId)) {
      return false
    }

    if (this.connections.has(normalizedServerId)) {
      await this.disconnectServer(normalizedServerId)
    }

    this.unregisterConnection(normalizedServerId)
    this.runtimeStates.delete(normalizedServerId)
    this.servers.delete(normalizedServerId)
    await this.persistServers()
    this.emitSnapshot()
    return true
  }

  async connectServer(serverId: string): Promise<McpServerRuntimeState> {
    await this.ensureInitialized()

    const normalizedServerId = normalizeServerId(serverId)
    const server = this.getServerOrThrow(normalizedServerId)
    let connection = this.connections.get(normalizedServerId)

    if (!connection) {
      const resolvedServer = await this.resolveServerSecrets(server)
      connection = this.connectionFactory(resolvedServer, { clientInfo: this.clientInfo })
      this.registerConnection(normalizedServerId, connection)
    }

    try {
      const runtimeState = await connection.connect()
      await this.syncRuntimeMetadata(normalizedServerId, runtimeState)
      this.emitSnapshot()
      return cloneRuntimeState(runtimeState)
    } catch (error) {
      const runtimeState = this.runtimeStates.get(normalizedServerId)
      if (runtimeState) {
        await this.syncRuntimeMetadata(normalizedServerId, runtimeState)
        this.emitSnapshot()
      }
      throw error
    }
  }

  async disconnectServer(serverId: string): Promise<McpServerRuntimeState> {
    await this.ensureInitialized()

    const normalizedServerId = normalizeServerId(serverId)
    const connection = this.connections.get(normalizedServerId)
    const server = this.getServerOrThrow(normalizedServerId)

    if (!connection) {
      const disconnectedState = createInitialRuntimeState(server)
      this.runtimeStates.set(normalizedServerId, disconnectedState)
      this.emitSnapshot()
      return disconnectedState
    }

    await connection.disconnect()
    const runtimeState = mergeRuntimeStateWithServer(server, connection.getRuntimeState())
    this.unregisterConnection(normalizedServerId)
    this.runtimeStates.set(normalizedServerId, runtimeState)
    await this.syncRuntimeMetadata(normalizedServerId, runtimeState)
    this.emitSnapshot()
    return cloneRuntimeState(runtimeState)
  }

  async getServerTools(serverId: string): Promise<McpNamespacedTool[]> {
    await this.ensureInitialized()

    const normalizedServerId = normalizeServerId(serverId)
    const server = this.getServerOrThrow(normalizedServerId)
    const runtimeState = this.getRuntimeStateForServer(normalizedServerId)

    if (
      runtimeState.status !== 'connected' ||
      server.enabled !== true ||
      server.trustState !== 'trusted'
    ) {
      return []
    }

    return runtimeState.tools.map((manifest) => ({
      ...createMcpNamespacedToolIdentity(server.id, server.name, manifest.name),
      manifest: {
        ...manifest,
        inputSchema: { ...manifest.inputSchema },
        annotations: manifest.annotations ? { ...manifest.annotations } : undefined,
      },
      }))
  }

  async executeTool(namespacedToolName: string, args: Record<string, unknown>): Promise<{
    server: McpServerConfig
    tool: McpNamespacedTool
    result: { content: unknown[]; structuredContent?: unknown; isError: boolean }
  }> {
    const executable = await this.getExecutableTool(namespacedToolName)

    return {
      server: executable.server,
      tool: executable.tool,
      result: await executable.connection.callTool(executable.tool.toolName, args),
    }
  }

  async getExecutableTool(namespacedToolName: string): Promise<{
    server: McpServerConfig
    tool: McpNamespacedTool
    connection: McpManagedConnection
  }> {
    await this.ensureInitialized()

    const tool = this.listTools().find((candidate) => candidate.namespacedName === namespacedToolName)
    if (!tool) {
      throw new Error(`Unknown or unavailable MCP tool: ${namespacedToolName}`)
    }

    const server = this.getServerOrThrow(tool.serverId)
    if (server.enabled !== true) {
      throw new Error(`MCP server "${server.name}" is disabled`)
    }

    if (server.trustState !== 'trusted') {
      throw new Error(`MCP server "${server.name}" is not trusted`)
    }

    const runtimeState = this.getRuntimeStateForServer(server.id)
    if (runtimeState.status !== 'connected') {
      throw new Error(`MCP server "${server.name}" is not connected`)
    }

    const connection = this.connections.get(server.id)
    if (!connection) {
      throw new Error(`No active MCP connection for server "${server.name}"`)
    }

    return {
      server,
      tool,
      connection,
    }
  }

  private async doInitialize(options: McpManagerInitializeOptions): Promise<McpRuntimeSnapshot> {
    this.clientInfo = options.clientInfo
    const loadedServers = await this.loadServers()

    this.servers.clear()
    this.runtimeStates.clear()

    for (const server of loadedServers) {
      this.servers.set(server.id, cloneServer(server))
      this.runtimeStates.set(server.id, createInitialRuntimeState(server))
    }

    this.initialized = true
    this.emitSnapshot()

    if (options.autoConnect !== false) {
      const autoConnectServerIds = loadedServers
        .filter((server) => server.enabled === true && server.autoConnect === true)
        .map((server) => server.id)

      await Promise.allSettled(autoConnectServerIds.map((serverId) => this.connectServer(serverId)))
    }

    return this.getSnapshot()
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  private getServerOrThrow(serverId: string): McpServerConfig {
    const server = this.servers.get(serverId)
    if (!server) {
      throw new Error(`Unknown MCP server: ${serverId}`)
    }

    return server
  }

  private getRuntimeStateForServer(serverId: string): McpServerRuntimeState {
    const server = this.getServerOrThrow(serverId)
    const runtimeState = this.runtimeStates.get(serverId)
    return cloneRuntimeState(runtimeState ?? createInitialRuntimeState(server))
  }

  private registerConnection(serverId: string, connection: McpManagedConnection): void {
    this.unregisterConnection(serverId)
    this.connections.set(serverId, connection)

    const unsubscribe = connection.onRuntimeStateChange((runtimeState) => {
      void this.handleConnectionRuntimeState(serverId, runtimeState)
    })

    this.connectionUnsubscribers.set(serverId, unsubscribe)
    this.runtimeStates.set(serverId, mergeRuntimeStateWithServer(this.getServerOrThrow(serverId), connection.getRuntimeState()))
  }

  private unregisterConnection(serverId: string): void {
    const unsubscribe = this.connectionUnsubscribers.get(serverId)
    if (unsubscribe) {
      unsubscribe()
      this.connectionUnsubscribers.delete(serverId)
    }

    this.connections.delete(serverId)
  }

  private async handleConnectionRuntimeState(
    serverId: string,
    runtimeState: McpServerRuntimeState
  ): Promise<void> {
    const server = this.servers.get(serverId)
    if (!server) {
      return
    }

    const mergedState = mergeRuntimeStateWithServer(server, runtimeState)
    this.runtimeStates.set(serverId, mergedState)
    await this.syncRuntimeMetadata(serverId, mergedState)
    this.emitSnapshot()
  }

  private async syncRuntimeMetadata(
    serverId: string,
    runtimeState: McpServerRuntimeState
  ): Promise<void> {
    const server = this.servers.get(serverId)
    if (!server) {
      return
    }

    const nextServer: McpServerConfig = {
      ...server,
      lastKnownTools: runtimeState.tools.map((tool) => ({
        ...tool,
        inputSchema: { ...tool.inputSchema },
        annotations: tool.annotations ? { ...tool.annotations } : undefined,
      })),
      lastConnectionError: runtimeState.lastConnectionError ?? null,
      lastConnectionTime: runtimeState.lastConnectionTime ?? null,
    }

    this.servers.set(serverId, nextServer)
    await this.persistServers()
  }

  private async persistServers(): Promise<void> {
    await this.saveServers(this.listServers())
  }

  private emitSnapshot(): void {
    const snapshot = this.getSnapshot()
    for (const handler of this.snapshotHandlers) {
      handler(snapshot)
    }
  }
}

function createInitialRuntimeState(server: McpServerConfig): McpServerRuntimeState {
  return {
    serverId: server.id,
    status: 'disconnected',
    error: undefined,
    lastConnectionError: server.lastConnectionError ?? null,
    lastConnectionTime: server.lastConnectionTime ?? null,
    tools: server.lastKnownTools ? server.lastKnownTools.map((tool) => ({ ...tool, inputSchema: { ...tool.inputSchema } })) : [],
    capabilities: {
      tools: false,
      resources: false,
      prompts: false,
    },
    lastUpdatedAt: new Date().toISOString(),
  }
}

function mergeRuntimeStateWithServer(
  server: McpServerConfig,
  runtimeState: McpServerRuntimeState | undefined
): McpServerRuntimeState {
  return {
    serverId: server.id,
    status: runtimeState?.status ?? 'disconnected',
    error: runtimeState?.error,
    lastConnectionError: runtimeState?.lastConnectionError ?? server.lastConnectionError ?? null,
    lastConnectionTime: runtimeState?.lastConnectionTime ?? server.lastConnectionTime ?? null,
    tools: runtimeState?.tools ? runtimeState.tools.map((tool) => ({ ...tool, inputSchema: { ...tool.inputSchema } })) : server.lastKnownTools ? server.lastKnownTools.map((tool) => ({ ...tool, inputSchema: { ...tool.inputSchema } })) : [],
    capabilities: runtimeState?.capabilities
      ? { ...runtimeState.capabilities }
      : {
          tools: false,
          resources: false,
          prompts: false,
        },
    connectionInfo: runtimeState?.connectionInfo ? { ...runtimeState.connectionInfo } : undefined,
    lastUpdatedAt: new Date().toISOString(),
  }
}

function cloneServer(server: McpServerConfig): McpServerConfig {
  return {
    ...server,
    args: server.args ? [...server.args] : [],
    env: server.env ? server.env.map((entry) => ({ ...entry })) : [],
    headers: server.headers ? server.headers.map((entry) => ({ ...entry })) : [],
    lastKnownTools: server.lastKnownTools
      ? server.lastKnownTools.map((tool) => ({
          ...tool,
          inputSchema: { ...tool.inputSchema },
          annotations: tool.annotations ? { ...tool.annotations } : undefined,
        }))
      : [],
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
    capabilities: { ...runtimeState.capabilities },
    connectionInfo: runtimeState.connectionInfo ? { ...runtimeState.connectionInfo } : undefined,
  }
}

function normalizeServerId(serverId: string): string {
  if (typeof serverId !== 'string' || !serverId.trim()) {
    throw new Error('Invalid MCP server id')
  }

  return serverId.trim()
}

function getOptionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
