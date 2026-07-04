// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const secureStorageMocks = vi.hoisted(() => ({
  setSecureValueAsync: vi.fn(async () => true),
}))

vi.mock('../secureStorage', () => ({
  setSecureValueAsync: secureStorageMocks.setSecureValueAsync,
}))

import type { McpServerConfig } from '../../src/mcp/types'
import { clearMcpServerSecrets, prepareRendererMcpServerInput } from './rendererPayload'

describe('prepareRendererMcpServerInput', () => {
  beforeEach(() => {
    secureStorageMocks.setSecureValueAsync.mockClear()
  })

  it('stores new secret env vars and auth tokens in secure storage', async () => {
    const prepared = await prepareRendererMcpServerInput(
      {
        name: 'Remote Docs',
        transport: 'sse',
        url: 'https://example.com/mcp',
        env: [
          {
            name: 'API_KEY',
            valueSource: 'secret',
            secretValue: 'env-secret',
          },
        ],
        headers: [
          {
            name: 'Authorization',
            valueSource: 'secret',
            secretValue: 'Bearer token-123',
            secretStorageKind: 'token',
          },
        ],
      },
      { serverId: 'server-1' }
    )

    expect(secureStorageMocks.setSecureValueAsync).toHaveBeenCalledWith(
      'mcp.server.server-1.env.API_KEY',
      'env-secret'
    )
    expect(secureStorageMocks.setSecureValueAsync).toHaveBeenCalledWith(
      'mcp.server.server-1.token',
      'Bearer token-123'
    )
    expect(prepared).toMatchObject({
      id: 'server-1',
      env: [
        {
          name: 'API_KEY',
          valueSource: 'secret',
          secretKey: 'mcp.server.server-1.env.API_KEY',
        },
      ],
      headers: [
        {
          name: 'Authorization',
          valueSource: 'secret',
          secretKey: 'mcp.server.server-1.token',
        },
      ],
    })
  })

  it('clears secrets that are removed from an existing server update', async () => {
    const existingServer = createServerConfig({
      env: [
        { name: 'API_KEY', valueSource: 'secret', secretKey: 'mcp.server.server-1.env.API_KEY' },
      ],
      headers: [
        {
          name: 'Authorization',
          valueSource: 'secret',
          secretKey: 'mcp.server.server-1.token',
        },
      ],
    })

    const prepared = await prepareRendererMcpServerInput(
      {
        name: 'Remote Docs',
        transport: 'sse',
        url: 'https://example.com/mcp',
        env: [],
        headers: [],
      },
      { serverId: 'server-1', existingServer }
    )

    expect(prepared).toMatchObject({ env: [], headers: [] })
    expect(secureStorageMocks.setSecureValueAsync).toHaveBeenCalledWith(
      'mcp.server.server-1.env.API_KEY',
      ''
    )
    expect(secureStorageMocks.setSecureValueAsync).toHaveBeenCalledWith(
      'mcp.server.server-1.token',
      ''
    )
  })

  it('respects input values for new servers and regenerates foreign secret keys', async () => {
    const prepared = await prepareRendererMcpServerInput(
      {
        name: 'Remote Docs',
        enabled: true,
        trustState: 'trusted',
        transport: 'sse',
        url: 'https://example.com/mcp',
        autoConnect: true,
        requireApproval: false,
        lastKnownTools: [{ name: 'shell_exec', inputSchema: { type: 'object' } }],
        headers: [
          {
            name: 'Authorization',
            valueSource: 'secret',
            secretValue: 'Bearer token-123',
            secretKey: 'mcp.server.other-server.token',
            secretStorageKind: 'token',
          },
        ],
      },
      { serverId: 'server-1' }
    )

    expect(prepared).toMatchObject({
      id: 'server-1',
      name: 'Remote Docs',
      enabled: true,
      trustState: 'trusted',
      transport: 'sse',
      url: 'https://example.com/mcp',
      autoConnect: true,
      requireApproval: false,
      headers: [
        {
          name: 'Authorization',
          valueSource: 'secret',
          secretKey: 'mcp.server.server-1.token',
        },
      ],
    })
    expect(prepared).not.toHaveProperty('lastKnownTools')
  })

  it('clears every stored secret for a deleted server', async () => {
    const server = createServerConfig({
      env: [
        { name: 'API_KEY', valueSource: 'secret', secretKey: 'mcp.server.server-1.env.API_KEY' },
      ],
      headers: [
        {
          name: 'X-Api-Key',
          valueSource: 'secret',
          secretKey: 'mcp.server.server-1.header.X-Api-Key',
        },
      ],
    })

    await clearMcpServerSecrets(server)

    expect(secureStorageMocks.setSecureValueAsync).toHaveBeenCalledWith(
      'mcp.server.server-1.env.API_KEY',
      ''
    )
    expect(secureStorageMocks.setSecureValueAsync).toHaveBeenCalledWith(
      'mcp.server.server-1.header.X-Api-Key',
      ''
    )
  })
})

function createServerConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: 'server-1',
    name: 'Server',
    enabled: true,
    trustState: 'trusted',
    transport: 'stdio',
    command: 'node',
    args: [],
    cwd: process.cwd(),
    url: undefined,
    env: [],
    headers: [],
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
