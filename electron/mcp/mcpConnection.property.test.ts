// @vitest-environment node

import { describe, expect, it } from 'vitest'

import type { McpJsonRpcMessage, McpResolvedServerConfig } from '../../src/mcp/types'
import { McpConnection } from './mcpConnection'
import type { McpTransport, McpTransportLifecycleState } from './transports/base'

describe('McpConnection property checks', () => {
  it('maintains valid lifecycle state after repeated connect/disconnect cycles', async () => {
    for (const cycleCount of [1, 2, 3]) {
      const transport = new DeterministicTransport()
      const connection = new McpConnection({
        server: createResolvedServerConfig('stdio', 0),
        transport,
      })

      for (let index = 0; index < cycleCount; index += 1) {
        await connection.connect()
        expect(connection.getRuntimeState().status).toBe('connected')
        expect(connection.getRuntimeState().tools).toHaveLength(1)
        await connection.disconnect()
        expect(connection.getRuntimeState().status).toBe('disconnected')
      }

      expect(connection.getRuntimeState().status).toBe('disconnected')
    }
  })

  it('only attempts remote reconnects when the transport is remote and reconnects are enabled', async () => {
    const stdioTransport = new DeterministicTransport()
    const stdioConnection = new McpConnection({
      server: createResolvedServerConfig('stdio', 2),
      transport: stdioTransport,
    })
    await stdioConnection.connect()
    stdioTransport.emitClose()
    await waitForTick(50)
    expect(stdioTransport.connectCalls).toBe(1)

    const remoteTransport = new DeterministicTransport()
    const remoteConnection = new McpConnection({
      server: createResolvedServerConfig('sse', 2),
      transport: remoteTransport,
    })
    await remoteConnection.connect()
    remoteTransport.emitClose()
    await waitForTick(350)
    expect(remoteTransport.connectCalls).toBeGreaterThan(1)
  })

  it('does not reconnect after a manual disconnect during reconnect backoff', async () => {
    const remoteTransport = new DeterministicTransport()
    const remoteConnection = new McpConnection({
      server: createResolvedServerConfig('sse', 2, 60),
      transport: remoteTransport,
    })

    await remoteConnection.connect()
    remoteTransport.emitClose()
    await remoteConnection.disconnect()
    await waitForTick(150)

    expect(remoteTransport.connectCalls).toBe(1)
    expect(remoteConnection.getRuntimeState().status).toBe('disconnected')
  })
})

class DeterministicTransport implements McpTransport {
  readonly type = 'stdio' as const

  private state: McpTransportLifecycleState = 'idle'
  private readonly messageHandlers = new Set<(message: McpJsonRpcMessage) => void>()
  private readonly closeHandlers = new Set<() => void>()
  private readonly errorHandlers = new Set<(error: Error) => void>()
  private readonly stateHandlers = new Set<(state: McpTransportLifecycleState) => void>()
  private lastError: Error | null = null
  connectCalls = 0

  async connect(): Promise<void> {
    this.connectCalls += 1
    this.setState('connected')
  }

  async disconnect(): Promise<void> {
    this.setState('disconnected')
  }

  isConnected(): boolean {
    return this.state === 'connected'
  }

  getState(): McpTransportLifecycleState {
    return this.state
  }

  async send(message: McpJsonRpcMessage): Promise<void> {
    if (!('method' in message)) {
      return
    }

    if (message.method === 'notifications/initialized') {
      return
    }

    if (!('id' in message) || message.id == null) {
      return
    }

    const result = buildResult(message.method, (message as { params?: Record<string, unknown> }).params)
    queueMicrotask(() => {
      for (const handler of this.messageHandlers) {
        handler({ jsonrpc: '2.0', id: message.id, result })
      }
    })
  }

  onMessage(handler: (message: McpJsonRpcMessage) => void): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  onError(handler: (error: Error) => void): () => void {
    this.errorHandlers.add(handler)
    return () => this.errorHandlers.delete(handler)
  }

  onClose(handler: () => void): () => void {
    this.closeHandlers.add(handler)
    return () => this.closeHandlers.delete(handler)
  }

  onStateChange(handler: (state: McpTransportLifecycleState) => void): () => void {
    this.stateHandlers.add(handler)
    return () => this.stateHandlers.delete(handler)
  }

  getLastError(): Error | null {
    return this.lastError
  }

  emitClose(): void {
    this.setState('disconnected')
    for (const handler of this.closeHandlers) {
      handler()
    }
  }

  private setState(nextState: McpTransportLifecycleState): void {
    this.state = nextState
    for (const handler of this.stateHandlers) {
      handler(nextState)
    }
  }
}

function createResolvedServerConfig(
  transport: McpResolvedServerConfig['transport'],
  reconnectAttempts: number,
  reconnectDelayMs = 1
): McpResolvedServerConfig {
  return {
    id: `server-${transport}`,
    name: `Server ${transport}`,
    enabled: true,
    trustState: 'trusted',
    transport,
    command: 'node',
    args: [],
    env: {},
    headers: {},
    autoConnect: false,
    startupTimeoutMs: 100,
    toolTimeoutMs: 100,
    reconnectAttempts,
    reconnectDelayMs,
    requireApproval: false,
    toolAllowlist: [],
    toolBlocklist: [],
    lastKnownTools: [],
    lastKnownResources: [],
    lastKnownPrompts: [],
    lastConnectionError: null,
    lastConnectionTime: null,
    createdAt: '2026-03-21T00:00:00.000Z',
    updatedAt: '2026-03-21T00:00:00.000Z',
    url: transport === 'stdio' ? undefined : 'https://example.com/mcp',
    cwd: process.cwd(),
  }
}

function buildResult(method?: string, params?: Record<string, unknown>): unknown {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: 'Mock', version: '1.0.0' },
      }
    case 'tools/list':
      return { tools: [{ name: 'read_file', inputSchema: { type: 'object' } }] }
    case 'resources/list':
      return { resources: [] }
    case 'prompts/list':
      return { prompts: [] }
    case 'tools/call':
      return { content: [], structuredContent: params?.arguments ?? {}, isError: false }
    default:
      return {}
  }
}

function waitForTick(delayMs = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}
