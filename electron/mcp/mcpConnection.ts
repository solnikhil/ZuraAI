import type {
  McpInitializeResult,
  McpJsonRpcId,
  McpJsonRpcMessage,
  McpListToolsResult,
  McpResolvedServerConfig,
  McpServerCapabilities,
  McpServerRuntimeState,
  McpToolManifest,
} from '../../src/mcp/types'

import type { McpTransport } from './transports/base'
import { SseMcpTransport } from './transports/sse'
import { StdioMcpTransport } from './transports/stdio'
import { WebSocketMcpTransport } from './transports/websocket'

export const DEFAULT_MCP_PROTOCOL_VERSION = '2025-06-18'
export const DEFAULT_MCP_CONNECTION_TIMEOUT_MS = 10000

export interface McpConnectionClientInfo {
  name: string
  version: string
}

export interface McpConnectionOptions {
  server: McpResolvedServerConfig
  transport?: McpTransport
  protocolVersion?: string
  initializeTimeoutMs?: number
  requestTimeoutMs?: number
  clientInfo?: McpConnectionClientInfo
}

export interface McpNormalizedToolCallResult {
  content: unknown[]
  structuredContent?: unknown
  isError: boolean
}

type RuntimeStateHandler = (state: McpServerRuntimeState) => void

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

export class McpConnection {
  private readonly server: McpResolvedServerConfig
  private readonly transport: McpTransport
  private readonly protocolVersion: string
  private readonly initializeTimeoutMs: number
  private readonly requestTimeoutMs: number
  private readonly clientInfo: McpConnectionClientInfo

  private readonly pendingRequests = new Map<McpJsonRpcId, PendingRequest>()
  private readonly runtimeStateHandlers = new Set<RuntimeStateHandler>()

  private requestCounter = 0
  private runtimeState: McpServerRuntimeState
  private lastConnectionError: string | null
  private lastSuccessTimestamp: string | null

  constructor(options: McpConnectionOptions) {
    this.server = options.server
    this.transport = options.transport ?? createMcpTransportForServer(options.server)
    this.protocolVersion = options.protocolVersion?.trim() || DEFAULT_MCP_PROTOCOL_VERSION
    this.initializeTimeoutMs = normalizeTimeout(
      options.initializeTimeoutMs ?? options.server.startupTimeoutMs,
      DEFAULT_MCP_CONNECTION_TIMEOUT_MS
    )
    this.requestTimeoutMs = normalizeTimeout(
      options.requestTimeoutMs ?? options.server.toolTimeoutMs ?? options.server.startupTimeoutMs,
      DEFAULT_MCP_CONNECTION_TIMEOUT_MS
    )
    this.clientInfo = normalizeClientInfo(options.clientInfo)
    this.lastConnectionError = options.server.lastConnectionError ?? null
    this.lastSuccessTimestamp = options.server.lastConnectionTime ?? null
    this.runtimeState = {
      serverId: options.server.id,
      status: 'disconnected',
      error: undefined,
      lastConnectionError: this.lastConnectionError,
      lastConnectionTime: this.lastSuccessTimestamp,
      tools: options.server.lastKnownTools ? [...options.server.lastKnownTools] : [],
      capabilities: {
        tools: false,
        resources: false,
        prompts: false,
      },
      lastUpdatedAt: new Date().toISOString(),
    }

    this.transport.onMessage((message) => {
      this.handleTransportMessage(message)
    })
    this.transport.onError((error) => {
      const message = toErrorMessage(error)
      this.lastConnectionError = message
      this.updateRuntimeState({
        status: 'error',
        error: message,
        lastConnectionError: message,
      })
    })
    this.transport.onClose(() => {
      this.rejectAllPendingRequests(new Error(`MCP connection closed for server "${this.server.name}"`))
      if (this.runtimeState.status !== 'error') {
        this.updateRuntimeState({
          status: 'disconnected',
          error: undefined,
        })
      }
    })
    this.transport.onStateChange((state) => {
      if (state === 'connecting') {
        this.updateRuntimeState({ status: 'connecting', error: undefined })
        return
      }

      if (state === 'disconnected' && this.runtimeState.status !== 'error') {
        this.updateRuntimeState({ status: 'disconnected', error: undefined })
      }
    })
  }

  getServer(): McpResolvedServerConfig {
    return this.server
  }

  getTransport(): McpTransport {
    return this.transport
  }

  getRuntimeState(): McpServerRuntimeState {
    return {
      ...this.runtimeState,
      tools: [...this.runtimeState.tools],
      capabilities: { ...this.runtimeState.capabilities },
      connectionInfo: this.runtimeState.connectionInfo ? { ...this.runtimeState.connectionInfo } : undefined,
    }
  }

  getLastConnectionError(): string | null {
    return this.lastConnectionError
  }

  getLastSuccessTimestamp(): string | null {
    return this.lastSuccessTimestamp
  }

  onRuntimeStateChange(handler: RuntimeStateHandler): () => void {
    this.runtimeStateHandlers.add(handler)
    return () => {
      this.runtimeStateHandlers.delete(handler)
    }
  }

  async connect(): Promise<McpServerRuntimeState> {
    this.updateRuntimeState({
      status: 'connecting',
      error: undefined,
    })

    try {
      await this.transport.connect()

      const initializeResult = parseInitializeResult(
        await this.request('initialize', {
          protocolVersion: this.protocolVersion,
          capabilities: {},
          clientInfo: this.clientInfo,
        }, this.initializeTimeoutMs)
      )

      const capabilities = parseServerCapabilities(initializeResult.capabilities)
      const connectionInfo = {
        protocolVersion: initializeResult.protocolVersion,
        serverName: nonEmptyString(initializeResult.serverInfo?.name),
        serverVersion: nonEmptyString(initializeResult.serverInfo?.version),
      }

      await this.transport.send({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      })

      const tools = capabilities.tools ? await this.listTools() : []
      const successTimestamp = new Date().toISOString()
      this.lastConnectionError = null
      this.lastSuccessTimestamp = successTimestamp

      this.updateRuntimeState({
        status: 'connected',
        error: undefined,
        lastConnectionError: null,
        lastConnectionTime: successTimestamp,
        capabilities,
        connectionInfo,
        tools,
      })

      return this.getRuntimeState()
    } catch (error) {
      const message = toErrorMessage(error)
      this.lastConnectionError = message
      this.updateRuntimeState({
        status: 'error',
        error: message,
        lastConnectionError: message,
      })

      if (this.transport.getState() !== 'disconnected' && this.transport.getState() !== 'idle') {
        await this.transport.disconnect().catch(() => undefined)
      }

      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.rejectAllPendingRequests(new Error(`MCP connection closed for server "${this.server.name}"`))
    await this.transport.disconnect()
    this.updateRuntimeState({
      status: 'disconnected',
      error: undefined,
    })
  }

  async listTools(): Promise<McpToolManifest[]> {
    const result = parseListToolsResult(await this.request('tools/list', undefined, this.requestTimeoutMs))
    const tools = result.tools ?? []
    this.updateRuntimeState({ tools })
    return [...tools]
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<McpNormalizedToolCallResult> {
    return parseToolCallResult(
      await this.request(
        'tools/call',
        {
          name: toolName,
          arguments: args,
        },
        this.requestTimeoutMs
      )
    )
  }

  async request(method: string, params?: unknown, timeoutMs = this.requestTimeoutMs): Promise<unknown> {
    if (!this.transport.isConnected()) {
      throw new Error(`MCP server "${this.server.name}" is not connected`)
    }

    const id = this.nextRequestId()

    return new Promise<unknown>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`MCP request timed out: ${method}`))
      }, timeoutMs)

      this.pendingRequests.set(id, { resolve, reject, timeoutId })

      this.transport
        .send({
          jsonrpc: '2.0',
          id,
          method,
          params,
        })
        .catch((error) => {
          this.clearPendingRequest(id)
          reject(error instanceof Error ? error : new Error(String(error)))
        })
    })
  }

  private handleTransportMessage(message: McpJsonRpcMessage): void {
    if (!('id' in message) || 'method' in message || message.id == null) {
      return
    }

    const pendingRequest = this.pendingRequests.get(message.id)
    if (!pendingRequest) {
      return
    }

    clearTimeout(pendingRequest.timeoutId)
    this.pendingRequests.delete(message.id)

    if ('error' in message) {
      pendingRequest.reject(
        new Error(`MCP request failed (${message.error.code}): ${message.error.message}`)
      )
      return
    }

    if (!('result' in message)) {
      pendingRequest.reject(new Error('MCP response was missing a result payload'))
      return
    }

    pendingRequest.resolve(message.result)
  }

  private rejectAllPendingRequests(error: Error): void {
    for (const [id, pendingRequest] of this.pendingRequests) {
      clearTimeout(pendingRequest.timeoutId)
      pendingRequest.reject(error)
      this.pendingRequests.delete(id)
    }
  }

  private clearPendingRequest(id: McpJsonRpcId): void {
    const pendingRequest = this.pendingRequests.get(id)
    if (!pendingRequest) {
      return
    }

    clearTimeout(pendingRequest.timeoutId)
    this.pendingRequests.delete(id)
  }

  private nextRequestId(): string {
    this.requestCounter += 1
    return `mcp-${this.server.id}-${this.requestCounter}`
  }

  private updateRuntimeState(partial: Partial<McpServerRuntimeState>): void {
    this.runtimeState = {
      ...this.runtimeState,
      ...partial,
      tools: partial.tools ? [...partial.tools] : [...this.runtimeState.tools],
      capabilities: partial.capabilities
        ? { ...partial.capabilities }
        : { ...this.runtimeState.capabilities },
      connectionInfo: partial.connectionInfo
        ? { ...partial.connectionInfo }
        : this.runtimeState.connectionInfo
          ? { ...this.runtimeState.connectionInfo }
          : undefined,
      lastUpdatedAt: new Date().toISOString(),
    }

    for (const handler of this.runtimeStateHandlers) {
      handler(this.getRuntimeState())
    }
  }
}

export function createMcpTransportForServer(server: McpResolvedServerConfig): McpTransport {
  if (server.transport === 'stdio') {
    if (!server.command) {
      throw new Error(`MCP stdio server "${server.name}" is missing a command`)
    }

    return new StdioMcpTransport({
      command: server.command,
      args: server.args ?? [],
      cwd: server.cwd,
      env: server.env,
      startupTimeoutMs: server.startupTimeoutMs,
    })
  }

  if (!server.url) {
    throw new Error(`MCP ${server.transport} server "${server.name}" is missing a URL`)
  }

  const reconnectPolicy = {
    enabled: false,
    maxAttempts: server.reconnectAttempts ?? 0,
    initialDelayMs: server.reconnectDelayMs ?? 1000,
  }

  if (server.transport === 'sse') {
    return new SseMcpTransport({
      url: server.url,
      headers: server.headers,
      reconnectPolicy,
    })
  }

  return new WebSocketMcpTransport({
    url: server.url,
    headers: server.headers,
    reconnectPolicy,
  })
}

function normalizeClientInfo(clientInfo: McpConnectionClientInfo | undefined): McpConnectionClientInfo {
  return {
    name: clientInfo?.name?.trim() || 'ZuraAI',
    version: clientInfo?.version?.trim() || 'unknown',
  }
}

function normalizeTimeout(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(1, Math.round(value))
}

function parseInitializeResult(result: unknown): McpInitializeResult {
  if (!isRecord(result) || typeof result.protocolVersion !== 'string' || !result.protocolVersion.trim()) {
    throw new Error('MCP initialize response is invalid')
  }

  return result as McpInitializeResult
}

function parseListToolsResult(result: unknown): McpListToolsResult {
  if (!isRecord(result)) {
    throw new Error('MCP tools/list response is invalid')
  }

  if (result.tools != null && !Array.isArray(result.tools)) {
    throw new Error('MCP tools/list response is invalid')
  }

  const tools = Array.isArray(result.tools)
    ? result.tools.filter(isMcpToolManifest)
    : []

  return {
    ...result,
    tools,
  }
}

function parseServerCapabilities(capabilities: McpInitializeResult['capabilities']): McpServerCapabilities {
  return {
    tools: isRecord(capabilities?.tools),
    resources: isRecord(capabilities?.resources),
    prompts: isRecord(capabilities?.prompts),
  }
}

function parseToolCallResult(result: unknown): McpNormalizedToolCallResult {
  if (!isRecord(result)) {
    throw new Error('MCP tools/call response is invalid')
  }

  return {
    content: Array.isArray(result.content) ? [...result.content] : [],
    structuredContent: Object.prototype.hasOwnProperty.call(result, 'structuredContent')
      ? result.structuredContent
      : undefined,
    isError: result.isError === true,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMcpToolManifest(value: unknown): value is McpToolManifest {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    isRecord(value.inputSchema)
  )
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
