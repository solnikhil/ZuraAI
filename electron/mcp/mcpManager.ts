import { randomUUID } from 'crypto'

import type {
  McpNamespacedTool,
  McpAuthStatus,
  McpPromptManifest,
  McpPromptResult,
  McpResolvedServerConfig,
  McpResourceManifest,
  McpResourceReadResult,
  McpRuntimePrompt,
  McpRuntimeResource,
  McpRuntimeSnapshot,
  McpServerConfig,
  McpServerRuntimeState,
} from '../../src/mcp/types'
import { createMcpNamespacedToolIdentity } from '../../src/mcp/types'

import { McpConnection, type McpConnectionOptions } from './mcpConnection'
import {
  ensureUniqueNamespacedTools,
  getUserVisibleExposure,
  isServerContentVisible,
  isToolAllowedForServer,
} from './mcpManagerPolicies'
import {
  buildPersistedServerRuntimeMetadata,
  clonePromptManifest,
  clonePromptResult,
  cloneReadResourceResult,
  cloneResourceManifest,
  cloneRuntimeState,
  cloneServer,
  createInitialRuntimeState,
  hasPersistedRuntimeMetadataChanged,
  mergeRuntimeStateWithServer,
} from './mcpManagerState'
import {
  createPromptCacheKey,
  createResourceCacheKey,
  getOptionalTrimmedString,
  isRecord,
  normalizeServerId,
} from './mcpManagerUtils'
import {
  loadMcpServers,
  normalizeMcpServerConfig,
  resolveMcpServerSecrets,
  saveMcpServers,
} from './mcpStorage'
import {
  applyOAuthAuthorizationHeader,
  clearMcpOAuth,
  getMcpAuthStatus,
  startMcpOAuthFlow,
} from './mcpOAuth'

type SnapshotHandler = (snapshot: McpRuntimeSnapshot) => void
type BoundedCacheEntry<T> = {
  value: T
  sizeBytes: number
}

const MAX_MCP_CONTENT_CACHE_ENTRIES = 50
const MAX_MCP_CONTENT_CACHE_ENTRY_BYTES = 512 * 1024

export interface McpManagedConnection {
  getRuntimeState(): McpServerRuntimeState
  getLastConnectionError(): string | null
  getLastSuccessTimestamp(): string | null
  onRuntimeStateChange(handler: (state: McpServerRuntimeState) => void): () => void
  connect(): Promise<McpServerRuntimeState>
  disconnect(): Promise<void>
  listResources(): Promise<McpResourceManifest[]>
  readResource(uri: string): Promise<McpResourceReadResult>
  listPrompts(): Promise<McpPromptManifest[]>
  getPrompt(name: string, args: Record<string, unknown>): Promise<McpPromptResult>
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
  private readonly resourceReadCache = new Map<string, BoundedCacheEntry<McpResourceReadResult>>()
  private readonly promptResultCache = new Map<string, BoundedCacheEntry<McpPromptResult>>()
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
    return ensureUniqueNamespacedTools([...this.servers.values()].flatMap((server) => {
      const runtimeState = this.runtimeStates.get(server.id)
      if (
        !runtimeState ||
        runtimeState.status !== 'connected' ||
        server.enabled !== true ||
        server.trustState !== 'trusted'
      ) {
        return []
      }

      return runtimeState.tools
        .filter((manifest) => isToolAllowedForServer(server, manifest.name))
        .map((manifest) => ({
          ...createMcpNamespacedToolIdentity(server.id, server.name, manifest.name),
          manifest: {
            ...manifest,
            inputSchema: { ...manifest.inputSchema },
            annotations: manifest.annotations ? { ...manifest.annotations } : undefined,
          },
        }))
    }))
  }

  listResources(): McpRuntimeResource[] {
    return [...this.servers.values()].flatMap((server) => {
      const runtimeState = this.runtimeStates.get(server.id)
      if (!isServerContentVisible(server, runtimeState)) {
        return []
      }

      return runtimeState.resources.map((manifest) => ({
        serverId: server.id,
        serverName: server.name,
        manifest: cloneResourceManifest(manifest),
        exposure: getUserVisibleExposure(),
      }))
    })
  }

  listPrompts(): McpRuntimePrompt[] {
    return [...this.servers.values()].flatMap((server) => {
      const runtimeState = this.runtimeStates.get(server.id)
      if (!isServerContentVisible(server, runtimeState)) {
        return []
      }

      return runtimeState.prompts.map((manifest) => ({
        serverId: server.id,
        serverName: server.name,
        manifest: clonePromptManifest(manifest),
        exposure: getUserVisibleExposure(),
      }))
    })
  }

  getSnapshot(): McpRuntimeSnapshot {
    return {
      servers: this.listServers(),
      runtimeStates: this.getRuntimeStates(),
      tools: this.listTools(),
      resources: this.listResources(),
      prompts: this.listPrompts(),
      pendingApprovals: [],
      authStatuses: this.listAuthStatuses(),
    }
  }

  listAuthStatuses(): McpAuthStatus[] {
    return [...this.servers.values()].map((server) => getMcpAuthStatus(server))
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
      const resolvedServer = await this.resolveServerForConnection(server)
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

    return runtimeState.tools
      .filter((manifest) => isToolAllowedForServer(server, manifest.name))
      .map((manifest) => ({
        ...createMcpNamespacedToolIdentity(server.id, server.name, manifest.name),
        manifest: {
          ...manifest,
          inputSchema: { ...manifest.inputSchema },
          annotations: manifest.annotations ? { ...manifest.annotations } : undefined,
        },
      }))
  }

  async getServerResources(serverId: string): Promise<McpRuntimeResource[]> {
    await this.ensureInitialized()

    const normalizedServerId = normalizeServerId(serverId)
    return this.listResources().filter((resource) => resource.serverId === normalizedServerId)
  }

  async getServerPrompts(serverId: string): Promise<McpRuntimePrompt[]> {
    await this.ensureInitialized()

    const normalizedServerId = normalizeServerId(serverId)
    return this.listPrompts().filter((prompt) => prompt.serverId === normalizedServerId)
  }

  async readResource(serverId: string, uri: string): Promise<McpResourceReadResult> {
    const executable = await this.getExecutableResource(serverId, uri)
    const cacheKey = createResourceCacheKey(executable.server.id, uri)
    const cached = this.resourceReadCache.get(cacheKey)
    if (cached) {
      this.resourceReadCache.delete(cacheKey)
      this.resourceReadCache.set(cacheKey, cached)
      return cloneReadResourceResult(cached.value)
    }

    const result = await executable.connection.readResource(uri)
    this.setBoundedCacheEntry(this.resourceReadCache, cacheKey, cloneReadResourceResult(result))
    return cloneReadResourceResult(result)
  }

  async getPrompt(
    serverId: string,
    promptName: string,
    args: Record<string, unknown>
  ): Promise<McpPromptResult> {
    const executable = await this.getExecutablePrompt(serverId, promptName)
    const cacheKey = createPromptCacheKey(executable.server.id, promptName, args)
    const cached = this.promptResultCache.get(cacheKey)
    if (cached) {
      this.promptResultCache.delete(cacheKey)
      this.promptResultCache.set(cacheKey, cached)
      return clonePromptResult(cached.value)
    }

    const result = await executable.connection.getPrompt(promptName, args)
    this.setBoundedCacheEntry(this.promptResultCache, cacheKey, clonePromptResult(result))
    return clonePromptResult(result)
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

  async startOAuth(serverId: string): Promise<{ ok: boolean; status: McpAuthStatus; error?: string }> {
    await this.ensureInitialized()
    const normalizedServerId = normalizeServerId(serverId)
    const server = this.getServerOrThrow(normalizedServerId)
    return startMcpOAuthFlow(server, async (nextServer) => {
      this.servers.set(normalizedServerId, normalizeMcpServerConfig(nextServer, 0) ?? nextServer)
      this.runtimeStates.set(
        normalizedServerId,
        mergeRuntimeStateWithServer(this.getServerOrThrow(normalizedServerId), this.runtimeStates.get(normalizedServerId))
      )
      await this.persistServers()
      this.emitSnapshot()
    })
  }

  async clearOAuth(serverId: string): Promise<McpAuthStatus> {
    await this.ensureInitialized()
    const normalizedServerId = normalizeServerId(serverId)
    const server = this.getServerOrThrow(normalizedServerId)
    const nextServer = await clearMcpOAuth(server)
    this.servers.set(normalizedServerId, normalizeMcpServerConfig(nextServer, 0) ?? nextServer)
    await this.persistServers()
    this.emitSnapshot()
    return getMcpAuthStatus(this.getServerOrThrow(normalizedServerId))
  }

  getAuthStatus(serverId: string): McpAuthStatus {
    const normalizedServerId = normalizeServerId(serverId)
    return getMcpAuthStatus(this.getServerOrThrow(normalizedServerId))
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

  async getExecutableResource(serverId: string, uri: string): Promise<{
    server: McpServerConfig
    manifest: McpResourceManifest
    connection: McpManagedConnection
  }> {
    await this.ensureInitialized()

    const normalizedServerId = normalizeServerId(serverId)
    const server = this.getServerOrThrow(normalizedServerId)
    const runtimeState = this.getRuntimeStateForServer(server.id)
    if (!isServerContentVisible(server, runtimeState)) {
      throw new Error(`MCP server "${server.name}" resources are not available`)
    }

    const manifest = runtimeState.resources.find((resource) => resource.uri === uri)
    if (!manifest) {
      throw new Error(`Unknown MCP resource for server "${server.name}": ${uri}`)
    }

    const connection = this.connections.get(server.id)
    if (!connection) {
      throw new Error(`No active MCP connection for server "${server.name}"`)
    }

    return {
      server,
      manifest,
      connection,
    }
  }

  async getExecutablePrompt(serverId: string, promptName: string): Promise<{
    server: McpServerConfig
    manifest: McpPromptManifest
    connection: McpManagedConnection
  }> {
    await this.ensureInitialized()

    const normalizedServerId = normalizeServerId(serverId)
    const server = this.getServerOrThrow(normalizedServerId)
    const runtimeState = this.getRuntimeStateForServer(server.id)
    if (!isServerContentVisible(server, runtimeState)) {
      throw new Error(`MCP server "${server.name}" prompts are not available`)
    }

    const manifest = runtimeState.prompts.find((prompt) => prompt.name === promptName)
    if (!manifest) {
      throw new Error(`Unknown MCP prompt for server "${server.name}": ${promptName}`)
    }

    const connection = this.connections.get(server.id)
    if (!connection) {
      throw new Error(`No active MCP connection for server "${server.name}"`)
    }

    return {
      server,
      manifest,
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

  private async resolveServerForConnection(server: McpServerConfig): Promise<McpResolvedServerConfig> {
    const resolvedServer = await this.resolveServerSecrets(server)
    if (server.auth?.mode !== 'oauth2Pkce') {
      return resolvedServer
    }

    if (server.transport !== 'sse') {
      return resolvedServer
    }

    let oauthHeaders: Record<string, string>
    try {
      oauthHeaders = await applyOAuthAuthorizationHeader(server)
    } catch (error) {
      await this.markOAuthReauthRequired(
        server.id,
        error instanceof Error ? error.message : String(error)
      )
      throw error
    }
    return {
      ...resolvedServer,
      headers: {
        ...resolvedServer.headers,
        ...oauthHeaders,
      },
    }
  }

  private async markOAuthReauthRequired(serverId: string, message: string): Promise<void> {
    const server = this.servers.get(serverId)
    if (!server || server.auth?.mode !== 'oauth2Pkce') {
      return
    }

    const nextServer: McpServerConfig = {
      ...server,
      auth: {
        ...server.auth,
        state: 'reauth_required',
        lastError: message,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    }
    this.servers.set(serverId, nextServer)
    await this.persistServers()
    this.emitSnapshot()
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
    this.clearContentCachesForServer(serverId)
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

    const nextServer = buildPersistedServerRuntimeMetadata(server, runtimeState)
    if (!hasPersistedRuntimeMetadataChanged(server, nextServer)) {
      return
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

  private clearContentCachesForServer(serverId: string): void {
    const resourcePrefix = `${serverId}::resource::`
    const promptPrefix = `${serverId}::prompt::`

    for (const key of this.resourceReadCache.keys()) {
      if (key.startsWith(resourcePrefix)) {
        this.resourceReadCache.delete(key)
      }
    }

    for (const key of this.promptResultCache.keys()) {
      if (key.startsWith(promptPrefix)) {
        this.promptResultCache.delete(key)
      }
    }
  }

  private setBoundedCacheEntry<T>(
    cache: Map<string, BoundedCacheEntry<T>>,
    key: string,
    value: T
  ): void {
    const sizeBytes = estimateSerializedBytes(value)
    if (sizeBytes > MAX_MCP_CONTENT_CACHE_ENTRY_BYTES) {
      cache.delete(key)
      return
    }

    cache.delete(key)
    cache.set(key, { value, sizeBytes })

    while (cache.size > MAX_MCP_CONTENT_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value
      if (typeof oldestKey !== 'string') break
      cache.delete(oldestKey)
    }
  }
}

function estimateSerializedBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  } catch {
    return MAX_MCP_CONTENT_CACHE_ENTRY_BYTES + 1
  }
}
