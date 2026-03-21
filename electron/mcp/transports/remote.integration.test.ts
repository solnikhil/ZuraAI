// @vitest-environment node

import { createServer, type IncomingMessage, type ServerResponse } from 'http'

import { WebSocketServer } from 'ws'
import { afterEach, describe, expect, it } from 'vitest'

import type { McpResolvedServerConfig } from '../../../src/mcp/types'
import { McpConnection } from '../mcpConnection'
import { SseMcpTransport } from './sse'
import { WebSocketMcpTransport } from './websocket'

describe('remote MCP transport integration', () => {
  const cleanupTasks: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop()
      if (cleanup) {
        await cleanup()
      }
    }
  })

  it('supports end-to-end MCP flows over SSE transport', async () => {
    const server = await createMockSseMcpServer()
    cleanupTasks.push(server.close)

    const connection = new McpConnection({
      server: createResolvedServerConfig({
        transport: 'sse',
        url: server.streamUrl,
      }),
      transport: new SseMcpTransport({
        url: server.streamUrl,
        featureEnabled: true,
      }),
    })

    const runtimeState = await connection.connect()

    expect(runtimeState.status).toBe('connected')
    expect(runtimeState.resources).toEqual([{ uri: 'file:///tmp/demo.txt', title: 'Demo File' }])
    expect(runtimeState.prompts).toEqual([{ name: 'summarize_demo', title: 'Summarize Demo' }])
    await expect(connection.callTool('read_file', { path: '/tmp/demo.txt' })).resolves.toMatchObject({
      isError: false,
      structuredContent: { path: '/tmp/demo.txt' },
    })
    await expect(connection.readResource('file:///tmp/demo.txt')).resolves.toEqual({
      contents: [{ uri: 'file:///tmp/demo.txt', text: 'Resource file:///tmp/demo.txt' }],
    })
    await expect(connection.getPrompt('summarize_demo', { topic: 'demo' })).resolves.toEqual({
      description: 'Prompt preview',
      messages: [{ role: 'user', content: 'Prompt summarize_demo for {"topic":"demo"}' }],
    })

    await connection.disconnect()
  })

  it('supports end-to-end MCP flows over WebSocket transport', async () => {
    const server = await createMockWebSocketMcpServer()
    cleanupTasks.push(server.close)

    const connection = new McpConnection({
      server: createResolvedServerConfig({
        transport: 'websocket',
        url: server.url,
      }),
      transport: new WebSocketMcpTransport({
        url: server.url,
        featureEnabled: true,
      }),
    })

    const runtimeState = await connection.connect()

    expect(runtimeState.status).toBe('connected')
    expect(runtimeState.tools).toHaveLength(1)
    await expect(connection.callTool('read_file', { path: '/tmp/demo.txt' })).resolves.toMatchObject({
      isError: false,
      structuredContent: { path: '/tmp/demo.txt' },
    })
    await expect(connection.readResource('file:///tmp/demo.txt')).resolves.toEqual({
      contents: [{ uri: 'file:///tmp/demo.txt', text: 'Resource file:///tmp/demo.txt' }],
    })
    await expect(connection.getPrompt('summarize_demo', { topic: 'demo' })).resolves.toEqual({
      description: 'Prompt preview',
      messages: [{ role: 'user', content: 'Prompt summarize_demo for {"topic":"demo"}' }],
    })

    await connection.disconnect()
  })
})

function createResolvedServerConfig(overrides: Partial<McpResolvedServerConfig>): McpResolvedServerConfig {
  return {
    id: 'server-1',
    name: 'Remote Mock Server',
    enabled: true,
    trustState: 'trusted',
    transport: 'stdio',
    command: process.execPath,
    args: [],
    cwd: process.cwd(),
    url: undefined,
    env: {},
    headers: {},
    autoConnect: false,
    startupTimeoutMs: 1000,
    toolTimeoutMs: 1000,
    reconnectAttempts: 0,
    reconnectDelayMs: 250,
    requireApproval: false,
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

async function createMockSseMcpServer(): Promise<{ streamUrl: string; close: () => Promise<void> }> {
  let streamResponse: ServerResponse<IncomingMessage> | null = null

  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/mcp') {
      streamResponse = response
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      })
      response.write(`event: endpoint\ndata: ${getServerUrl(server)}/mcp/messages\n\n`)
      return
    }

    if (request.method === 'POST' && request.url === '/mcp/messages') {
      const body = await readRequestBody(request)
      const message = JSON.parse(body) as { id?: string | number; method?: string; params?: any }
      sendSseJsonRpc(streamResponse, message.id, buildMockMcpResult(message.method ?? '', message.params))
      response.writeHead(202)
      response.end()
      return
    }

    response.writeHead(404)
    response.end()
  })

  await listen(server)

  return {
    streamUrl: `${getServerUrl(server)}/mcp`,
    close: () => closeServer(server),
  }
}

async function createMockWebSocketMcpServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer()
  const websocketServer = new WebSocketServer({ server })

  websocketServer.on('connection', (socket) => {
    socket.on('message', (rawData) => {
      const message = JSON.parse(rawData.toString('utf8')) as { id?: string | number; method?: string; params?: any }
      if (message.method === 'notifications/initialized') {
        return
      }

      socket.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: buildMockMcpResult(message.method ?? '', message.params),
        })
      )
    })
  })

  await listen(server)

  return {
    url: getServerUrl(server).replace('http://', 'ws://'),
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        websocketServer.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      })
      await closeServer(server)
    },
  }
}

function buildMockMcpResult(method: string, params: any): unknown {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: 'Remote Mock Server', version: '1.0.0' },
      }
    case 'tools/list':
      return {
        tools: [
          {
            name: 'read_file',
            inputSchema: {
              type: 'object',
              properties: { path: { type: 'string' } },
              required: ['path'],
            },
          },
        ],
      }
    case 'resources/list':
      return {
        resources: [{ uri: 'file:///tmp/demo.txt', title: 'Demo File' }],
      }
    case 'resources/read':
      return {
        contents: [{ uri: params?.uri ?? '', text: `Resource ${params?.uri ?? ''}` }],
      }
    case 'prompts/list':
      return {
        prompts: [{ name: 'summarize_demo', title: 'Summarize Demo' }],
      }
    case 'prompts/get':
      return {
        description: 'Prompt preview',
        messages: [
          {
            role: 'user',
            content: `Prompt ${params?.name ?? ''} for ${JSON.stringify(params?.arguments ?? {})}`,
          },
        ],
      }
    case 'tools/call':
      return {
        content: [{ type: 'text', text: `Mock file contents for ${params?.arguments?.path ?? ''}` }],
        structuredContent: { path: params?.arguments?.path ?? '' },
        isError: false,
      }
    default:
      return {}
  }
}

function sendSseJsonRpc(
  response: ServerResponse<IncomingMessage> | null,
  id: string | number | undefined,
  result: unknown
): void {
  if (!response || id == null) {
    return
  }

  response.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, result })}\n\n`)
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      buffer += chunk
    })
    request.on('end', () => resolve(buffer))
    request.on('error', reject)
  })
}

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error?: Error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function getServerUrl(server: ReturnType<typeof createServer>): string {
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP server address')
  }

  return `http://127.0.0.1:${address.port}`
}
