// @vitest-environment node

import { fileURLToPath } from 'url'

import { describe, expect, it } from 'vitest'

import type { McpResolvedServerConfig } from '../../src/mcp/types'
import type { McpTransport } from './transports/base'
import { McpConnection, createMcpTransportForServer } from './mcpConnection'

const MOCK_STDIO_SERVER_PATH = fileURLToPath(new URL('./testUtils/mockStdioServer.cjs', import.meta.url))

describe('McpConnection', () => {
  it('completes initialize handshake and caches discovered tools', async () => {
    const connection = new McpConnection({
      server: createResolvedServerConfig({
        command: process.execPath,
        args: [MOCK_STDIO_SERVER_PATH],
      }),
      clientInfo: {
        name: 'ZuraAI Test',
        version: '1.0.0',
      },
    })

    const runtimeState = await connection.connect()

    expect(runtimeState.status).toBe('connected')
    expect(runtimeState.capabilities).toEqual({
      tools: true,
      resources: false,
      prompts: false,
    })
    expect(runtimeState.connectionInfo).toEqual({
      protocolVersion: '2025-06-18',
      serverName: 'Mock MCP Server',
      serverVersion: '1.0.0',
    })
    expect(runtimeState.tools).toEqual([
      {
        name: 'read_file',
        description: 'Read a file from disk',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
      },
    ])
    expect(connection.getLastConnectionError()).toBeNull()
    expect(connection.getLastSuccessTimestamp()).toMatch(/T/)

    await connection.disconnect()
  })

  it('stores the last connection error when initialize times out', async () => {
    const connection = new McpConnection({
      server: createResolvedServerConfig({
        command: process.execPath,
        args: [MOCK_STDIO_SERVER_PATH],
        env: {
          MCP_MOCK_INITIALIZE_DELAY_MS: '100',
        },
        startupTimeoutMs: 20,
      }),
      initializeTimeoutMs: 20,
    })

    await expect(connection.connect()).rejects.toThrow('MCP request timed out: initialize')

    expect(connection.getRuntimeState().status).toBe('error')
    expect(connection.getLastConnectionError()).toContain('MCP request timed out: initialize')
  })

  it('executes tools/call and normalizes the result payload', async () => {
    const transport = createMockTransport()
    const connection = new McpConnection({
      server: createResolvedServerConfig({
        command: process.execPath,
        args: [MOCK_STDIO_SERVER_PATH],
      }),
      transport,
    })

    await connection.connect()

    await expect(connection.callTool('read_file', { path: '/tmp/demo.txt' })).resolves.toEqual({
      content: [
        {
          type: 'text',
          text: 'Mock file contents for /tmp/demo.txt',
        },
      ],
      structuredContent: {
        path: '/tmp/demo.txt',
        size: 32,
      },
      isError: false,
    })

    await connection.disconnect()
  })

  it('discovers resources and prompts and can fetch them on demand', async () => {
    const transport = createMockTransport()
    const connection = new McpConnection({
      server: createResolvedServerConfig({
        command: process.execPath,
        args: [MOCK_STDIO_SERVER_PATH],
      }),
      transport,
    })

    const runtimeState = await connection.connect()

    expect(runtimeState.resources).toEqual([
      {
        uri: 'file:///tmp/demo.txt',
        title: 'Demo File',
      },
    ])
    expect(runtimeState.prompts).toEqual([
      {
        name: 'summarize_demo',
        title: 'Summarize Demo',
      },
    ])

    await expect(connection.readResource('file:///tmp/demo.txt')).resolves.toEqual({
      contents: [
        {
          uri: 'file:///tmp/demo.txt',
          text: 'Resource contents for file:///tmp/demo.txt',
        },
      ],
    })

    await expect(connection.getPrompt('summarize_demo', { topic: 'demo' })).resolves.toEqual({
      description: 'Prompt preview',
      messages: [
        {
          role: 'user',
          content: 'Prompt summarize_demo for {"topic":"demo"}',
        },
      ],
    })

    await connection.disconnect()
  })

  it('creates transport instances from resolved server config', () => {
    const transport = createMcpTransportForServer(
      createResolvedServerConfig({
        command: process.execPath,
        args: [MOCK_STDIO_SERVER_PATH],
      })
    )

    expect(transport.type).toBe('stdio')
  })
})

function createResolvedServerConfig(
  overrides: Partial<McpResolvedServerConfig>
): McpResolvedServerConfig {
  return {
    id: 'server-1',
    name: 'Mock Server',
    enabled: true,
    trustState: 'trusted',
    transport: 'stdio',
    command: process.execPath,
    args: [MOCK_STDIO_SERVER_PATH],
    cwd: process.cwd(),
    url: undefined,
    env: {},
    headers: {},
    autoConnect: false,
    startupTimeoutMs: 500,
    toolTimeoutMs: 500,
    reconnectAttempts: 0,
    reconnectDelayMs: 1000,
    requireApproval: true,
    lastKnownTools: [],
    lastConnectionError: null,
    lastConnectionTime: null,
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
    ...overrides,
  }
}

function createMockTransport(): McpTransport {
  let connected = false
  let messageHandler: ((message: any) => void) | undefined
  let stateHandler: ((state: any) => void) | undefined

  return {
    type: 'stdio',
    async connect() {
      connected = true
      stateHandler?.('connecting')
      stateHandler?.('connected')
    },
    async disconnect() {
      connected = false
      stateHandler?.('disconnected')
    },
    isConnected() {
      return connected
    },
    getState() {
      return connected ? 'connected' : 'disconnected'
    },
    async send(message) {
      if (!('id' in message) || !('method' in message)) {
        return
      }

      if (message.method === 'initialize') {
        queueMicrotask(() => {
          messageHandler?.({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: { tools: {}, resources: {}, prompts: {} },
              serverInfo: { name: 'Mock MCP Server', version: '1.0.0' },
            },
          })
        })
        return
      }

      if (message.method === 'tools/list') {
        queueMicrotask(() => {
          messageHandler?.({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              tools: [
                {
                  name: 'read_file',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      path: { type: 'string' },
                    },
                    required: ['path'],
                  },
                },
              ],
            },
          })
        })
        return
      }

      if (message.method === 'resources/list') {
        queueMicrotask(() => {
          messageHandler?.({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              resources: [
                {
                  uri: 'file:///tmp/demo.txt',
                  title: 'Demo File',
                },
              ],
            },
          })
        })
        return
      }

      if (message.method === 'resources/read') {
        const uri = (message.params as { uri?: string })?.uri ?? ''
        queueMicrotask(() => {
          messageHandler?.({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              contents: [
                {
                  uri,
                  text: `Resource contents for ${uri}`,
                },
              ],
            },
          })
        })
        return
      }

      if (message.method === 'prompts/list') {
        queueMicrotask(() => {
          messageHandler?.({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              prompts: [
                {
                  name: 'summarize_demo',
                  title: 'Summarize Demo',
                },
              ],
            },
          })
        })
        return
      }

      if (message.method === 'prompts/get') {
        const name = (message.params as { name?: string })?.name ?? ''
        const args = (message.params as { arguments?: Record<string, unknown> })?.arguments ?? {}
        queueMicrotask(() => {
          messageHandler?.({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              description: 'Prompt preview',
              messages: [
                {
                  role: 'user',
                  content: `Prompt ${name} for ${JSON.stringify(args)}`,
                },
              ],
            },
          })
        })
        return
      }

      if (message.method === 'tools/call') {
        const path = (message.params as { arguments?: { path?: string } })?.arguments?.path ?? ''
        queueMicrotask(() => {
          messageHandler?.({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Mock file contents for ${path}`,
                },
              ],
              structuredContent: {
                path,
                size: 32,
              },
              isError: false,
            },
          })
        })
      }
    },
    onMessage(handler) {
      messageHandler = handler
      return () => {
        messageHandler = undefined
      }
    },
    onError() {
      return () => undefined
    },
    onClose() {
      return () => undefined
    },
    onStateChange(handler) {
      stateHandler = handler
      return () => {
        stateHandler = undefined
      }
    },
    getLastError() {
      return null
    },
  }
}
