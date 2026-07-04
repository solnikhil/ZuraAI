// @vitest-environment node

import { fileURLToPath } from 'url'

import { describe, expect, it } from 'vitest'

import type { McpJsonRpcMessage } from '../../../src/mcp/types'
import { StdioMcpTransport } from './stdio'

const MOCK_STDIO_SERVER_PATH = fileURLToPath(
  new URL('../testUtils/mockStdioServer.cjs', import.meta.url)
)

describe('StdioMcpTransport', () => {
  it('spawns a managed MCP stdio process and parses stdout messages', async () => {
    const transport = new StdioMcpTransport({
      command: process.execPath,
      args: [MOCK_STDIO_SERVER_PATH],
      env: {
        MCP_MOCK_STDERR_LINE: 'stderr-line-from-mock',
      },
    })

    const messages: McpJsonRpcMessage[] = []
    transport.onMessage((message) => {
      messages.push(message)
    })

    await transport.connect()
    await transport.send({
      jsonrpc: '2.0',
      id: 'init-1',
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'ZuraAI Test', version: '1.0.0' },
      },
    })

    await waitFor(() => messages.length > 0)

    expect(messages[0]).toMatchObject({
      jsonrpc: '2.0',
      id: 'init-1',
      result: {
        protocolVersion: '2025-06-18',
      },
    })

    expect(transport.getDiagnostics().stderr).toContain('stderr-line-from-mock')

    await transport.disconnect()
    expect(transport.getState()).toBe('disconnected')
  })

  it('records an unexpected process exit as a remote disconnect', async () => {
    const transport = new StdioMcpTransport({
      command: process.execPath,
      args: [MOCK_STDIO_SERVER_PATH],
      env: {
        MCP_MOCK_EXIT_AFTER_INITIALIZE: '1',
      },
    })

    const closeEvents: number[] = []
    const errors: Error[] = []
    transport.onClose(() => {
      closeEvents.push(Date.now())
    })
    transport.onError((error) => {
      errors.push(error)
    })

    await transport.connect()
    await transport.send({
      jsonrpc: '2.0',
      id: 'init-2',
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'ZuraAI Test', version: '1.0.0' },
      },
    })

    await waitFor(() => closeEvents.length === 1)

    expect(transport.getState()).toBe('disconnected')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('Transport closed unexpectedly')
  })

  it('fails cleanly when the stdio command cannot be spawned', async () => {
    const transport = new StdioMcpTransport({
      command: fileURLToPath(new URL('./definitely-missing-mcp-command.exe', import.meta.url)),
    })

    await expect(transport.connect()).rejects.toMatchObject({
      name: 'McpTransportError',
      context: {
        operation: 'connect',
        transportType: 'stdio',
      },
    })
  })
})

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now()

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition')
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
