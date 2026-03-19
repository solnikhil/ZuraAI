// @vitest-environment node

import { describe, expect, it } from 'vitest'

import type { McpJsonRpcMessage } from '../../../src/mcp/types'
import {
  BaseMcpTransport,
  McpTransportError,
  isMcpJsonRpcErrorObject,
  isMcpJsonRpcMessage,
  isMcpJsonRpcResponse,
  parseMcpMessage,
  serializeMcpMessage,
  serializeMcpMessageLine,
  splitMcpMessageLines,
  toMcpTransportError,
} from './base'

class TestTransport extends BaseMcpTransport {
  connectCalls = 0
  disconnectCalls = 0
  sentMessages: McpJsonRpcMessage[] = []
  failConnectWith: Error | null = null
  failDisconnectWith: Error | null = null
  failSendWith: Error | null = null

  constructor() {
    super('stdio')
  }

  protected override async performConnect(): Promise<void> {
    this.connectCalls += 1
    if (this.failConnectWith) {
      throw this.failConnectWith
    }
  }

  protected override async performDisconnect(): Promise<void> {
    this.disconnectCalls += 1
    if (this.failDisconnectWith) {
      throw this.failDisconnectWith
    }
  }

  protected override async performSend(message: McpJsonRpcMessage): Promise<void> {
    if (this.failSendWith) {
      throw this.failSendWith
    }

    this.sentMessages.push(message)
  }

  emitIncoming(raw: string): void {
    this.handleIncomingRawMessage(raw)
  }

  emitRemoteDisconnect(cause?: unknown): void {
    this.markDisconnectedFromRemote(cause)
  }

  runWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName:
      | 'connect'
      | 'disconnect'
      | 'send'
      | 'receive'
      | 'timeout'
      | 'internal' = 'connect'
  ): Promise<T> {
    return this.withTimeout(operation, {
      timeoutMs,
      operation: operationName,
      message: `Timed out during ${operationName}`,
    })
  }
}

describe('mcp transport foundation helpers', () => {
  it('recognizes valid JSON-RPC request, notification, and responses', () => {
    expect(
      isMcpJsonRpcMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: { cursor: null },
      })
    ).toBe(true)

    expect(
      isMcpJsonRpcMessage({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: { progress: 0.5 },
      })
    ).toBe(true)

    expect(
      isMcpJsonRpcMessage({
        jsonrpc: '2.0',
        id: 'req-1',
        result: { tools: [] },
      })
    ).toBe(true)

    expect(
      isMcpJsonRpcMessage({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid Request' },
      })
    ).toBe(true)
  })

  it('rejects malformed JSON-RPC payloads', () => {
    expect(isMcpJsonRpcMessage(null)).toBe(false)
    expect(isMcpJsonRpcMessage({})).toBe(false)
    expect(isMcpJsonRpcMessage({ jsonrpc: '1.0', method: 'tools/list' })).toBe(false)

    expect(
      isMcpJsonRpcMessage({
        jsonrpc: '2.0',
        method: 'tools/list',
        result: {},
      })
    ).toBe(false)

    expect(
      isMcpJsonRpcMessage({
        jsonrpc: '2.0',
        id: 'abc',
        result: {},
        error: { code: -32000, message: 'nope' },
      })
    ).toBe(false)

    expect(
      isMcpJsonRpcMessage({
        jsonrpc: '2.0',
        id: true,
        method: 'tools/list',
      })
    ).toBe(false)
  })

  it('recognizes valid JSON-RPC error objects', () => {
    expect(isMcpJsonRpcErrorObject({ code: -32603, message: 'Internal error' })).toBe(true)
    expect(isMcpJsonRpcErrorObject({ code: 'bad', message: 'Internal error' })).toBe(false)
    expect(isMcpJsonRpcErrorObject({ code: -32603 })).toBe(false)
  })

  it('identifies response messages', () => {
    const successResponse: McpJsonRpcMessage = {
      jsonrpc: '2.0',
      id: 7,
      result: { ok: true },
    }

    const errorResponse: McpJsonRpcMessage = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: 'Boom' },
    }

    const notification: McpJsonRpcMessage = {
      jsonrpc: '2.0',
      method: 'notifications/message',
      params: { level: 'info' },
    }

    expect(isMcpJsonRpcResponse(successResponse)).toBe(true)
    expect(isMcpJsonRpcResponse(errorResponse)).toBe(true)
    expect(isMcpJsonRpcResponse(notification)).toBe(false)
  })

  it('serializes and parses messages', () => {
    const message: McpJsonRpcMessage = {
      jsonrpc: '2.0',
      id: 'req-2',
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'ZuraAI', version: '0.0.3' },
      },
    }

    const serialized = serializeMcpMessage(message)
    const parsed = parseMcpMessage(serialized)

    expect(parsed).toEqual(message)
    expect(serializeMcpMessageLine(message)).toBe(`${serialized}\n`)
  })

  it('throws when parsing invalid JSON-RPC messages', () => {
    expect(() => parseMcpMessage('{"jsonrpc":"2.0","method":"bad","result":{}}')).toThrow(
      'Received invalid MCP JSON-RPC message'
    )
  })

  it('splits line-delimited messages and preserves remainder', () => {
    const first = '{"jsonrpc":"2.0","id":1,"result":{}}'
    const second = '{"jsonrpc":"2.0","method":"ping"}'
    const chunk = `${first}\r\n${second}\n{"jsonrpc":"2.0"`

    expect(splitMcpMessageLines(chunk)).toEqual({
      messages: [first, second],
      remainder: '{"jsonrpc":"2.0"',
    })
  })

  it('creates normalized transport errors', () => {
    const cause = new Error('socket closed')
    const error = toMcpTransportError('websocket', 'receive', 'Read failed', cause, {
      details: { phase: 'handshake' },
      timeoutMs: 2500,
    })

    expect(error).toBeInstanceOf(McpTransportError)
    expect(error.context).toEqual({
      operation: 'receive',
      transportType: 'websocket',
      cause,
      details: { phase: 'handshake' },
      timeoutMs: 2500,
    })
  })
})

describe('BaseMcpTransport lifecycle behavior', () => {
  it('connects, sends, and disconnects while reporting state transitions', async () => {
    const transport = new TestTransport()
    const states: string[] = []
    const closes: number[] = []

    transport.onStateChange((state) => states.push(state))
    transport.onClose(() => closes.push(Date.now()))

    await transport.connect()
    expect(transport.isConnected()).toBe(true)
    expect(transport.getState()).toBe('connected')
    expect(transport.connectCalls).toBe(1)

    const message: McpJsonRpcMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    }

    await transport.send(message)
    expect(transport.sentMessages).toEqual([message])

    await transport.disconnect()
    expect(transport.isConnected()).toBe(false)
    expect(transport.getState()).toBe('disconnected')
    expect(transport.disconnectCalls).toBe(1)
    expect(closes).toHaveLength(1)
    expect(states).toEqual(['connecting', 'connected', 'disconnecting', 'disconnected'])
  })

  it('does not reconnect when already connected', async () => {
    const transport = new TestTransport()

    await transport.connect()
    await transport.connect()

    expect(transport.connectCalls).toBe(1)
  })

  it('rejects send when not connected', async () => {
    const transport = new TestTransport()

    await expect(
      transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      })
    ).rejects.toMatchObject({
      name: 'McpTransportError',
      context: {
        operation: 'send',
        transportType: 'stdio',
      },
    })
  })

  it('emits parsed incoming messages to subscribers', async () => {
    const transport = new TestTransport()
    const received: McpJsonRpcMessage[] = []

    transport.onMessage((message) => received.push(message))

    transport.emitIncoming('{"jsonrpc":"2.0","id":"abc","result":{"ok":true}}')

    expect(received).toEqual([
      {
        jsonrpc: '2.0',
        id: 'abc',
        result: { ok: true },
      },
    ])
  })

  it('emits parse errors for invalid incoming payloads', () => {
    const transport = new TestTransport()
    const errors: Error[] = []

    transport.onError((error) => errors.push(error))
    transport.emitIncoming('{"jsonrpc":"2.0","method":"oops","result":{}}')

    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(McpTransportError)
    expect((errors[0] as McpTransportError).context.operation).toBe('receive')
    expect(transport.getLastError()).toBe(errors[0])
  })

  it('transitions to error and emits error when connect fails', async () => {
    const transport = new TestTransport()
    const errors: Error[] = []
    transport.failConnectWith = new Error('spawn failed')
    transport.onError((error) => errors.push(error))

    await expect(transport.connect()).rejects.toBeInstanceOf(McpTransportError)

    expect(transport.getState()).toBe('error')
    expect(errors).toHaveLength(1)
    expect((errors[0] as McpTransportError).context.operation).toBe('connect')
  })

  it('wraps timeout failures with timeout context', async () => {
    const transport = new TestTransport()

    await expect(
      transport.runWithTimeout(
        () => new Promise((resolve) => setTimeout(() => resolve('done'), 25)),
        5,
        'connect'
      )
    ).rejects.toMatchObject({
      name: 'McpTransportError',
      context: {
        operation: 'timeout',
        transportType: 'stdio',
        timeoutMs: 5,
        details: {
          timedOutOperation: 'connect',
        },
      },
    })
  })

  it('emits remote disconnect as close and stores unexpected close error', () => {
    const transport = new TestTransport()
    const errors: Error[] = []
    let closeCount = 0

    transport.onError((error) => errors.push(error))
    transport.onClose(() => {
      closeCount += 1
    })

    transport.emitRemoteDisconnect(new Error('remote closed'))

    expect(closeCount).toBe(1)
    expect(errors).toHaveLength(1)
    expect((errors[0] as McpTransportError).context.operation).toBe('internal')
    expect(transport.getState()).toBe('disconnected')
  })
})
