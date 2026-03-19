// @vitest-environment node

import { fileURLToPath } from 'url'

import { describe, expect, it } from 'vitest'

import type { McpResolvedServerConfig } from '../../src/mcp/types'
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
