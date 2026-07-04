// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/zura-mcp-add-request-test'),
    isPackaged: false,
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((value: string) => Buffer.from(value, 'utf8')),
    decryptString: vi.fn((value: Buffer) => value.toString('utf8')),
  },
}))

import { approvePendingMcpAddRequest, createMcpAddRequest } from './mcpAddRequests'
import type { McpServerConfig, McpServerRuntimeState } from '../../src/mcp/types'

describe('mcpAddRequests', () => {
  it('resolves Gmail from the bundled catalogue without exposing secrets', () => {
    const review = createMcpAddRequest({
      mode: 'catalogue',
      query: 'gmail',
      reason: 'User asked to add Gmail MCP.',
    })

    expect(review).toEqual(
      expect.objectContaining({
        mode: 'catalogue',
        serverName: 'Gmail',
        transport: 'stdio',
        status: 'pending',
        canAdd: true,
      })
    )
    expect(review.requiredSecrets.length).toBeGreaterThan(0)
    expect(JSON.stringify(review)).not.toContain('secretValue')
    expect(JSON.stringify(review)).not.toContain('refresh-token-value')
  })

  it('rejects unsupported catalogue requests', () => {
    expect(() =>
      createMcpAddRequest({
        mode: 'catalogue',
        query: 'definitely-not-a-real-mcp-entry',
        reason: 'Try an unsupported entry.',
      })
    ).toThrow('No supported bundled MCP catalogue entry')
  })

  it('rejects custom configs with invalid remote URLs or raw secret values', () => {
    expect(() =>
      createMcpAddRequest({
        mode: 'custom',
        reason: 'Bad URL.',
        custom: {
          name: 'Bad Remote',
          transport: 'sse',
          url: 'not-a-url',
        },
      })
    ).toThrow('Custom remote MCP servers require a valid URL')

    expect(() =>
      createMcpAddRequest({
        mode: 'custom',
        reason: 'Raw secret.',
        custom: {
          name: 'Bad Secret',
          transport: 'stdio',
          command: 'npx',
          apiKey: 'real-secret-value',
        } as Record<string, unknown>,
      })
    ).toThrow('must not include raw secret values')

    expect(() =>
      createMcpAddRequest({
        mode: 'custom',
        reason: 'Secret arg.',
        custom: {
          name: 'Bad Arg',
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@example/mcp', '--token=real-secret-value'],
        },
      })
    ).toThrow('must not include raw secret values in args')
  })

  it('approves a custom request by adding and connecting an untrusted server', async () => {
    const review = createMcpAddRequest({
      mode: 'custom',
      reason: 'Add local demo server.',
      custom: {
        name: 'Demo MCP',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@example/mcp'],
      },
    })
    const addServer = vi.fn(
      async (payload: unknown) =>
        ({
          ...(payload as Record<string, unknown>),
          id: 'server-1',
          name: 'Demo MCP',
          trustState: 'untrusted',
          requireApproval: true,
        }) as McpServerConfig
    )
    const connectServer = vi.fn(
      async (serverId: string) =>
        ({
          serverId,
          status: 'connected',
          tools: [],
          resources: [],
          prompts: [],
          capabilities: { tools: true, resources: false, prompts: false },
        }) as McpServerRuntimeState
    )

    await expect(
      approvePendingMcpAddRequest(review.requestId, {
        addServer,
        connectServer,
        startOAuth: vi.fn(async () => ({ ok: true })),
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'connected',
        server: expect.objectContaining({
          trustState: 'untrusted',
          requireApproval: true,
        }),
      })
    )
    expect(addServer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Demo MCP',
        enabled: true,
        trustState: 'untrusted',
        requireApproval: true,
      })
    )
    expect(connectServer).toHaveBeenCalledWith('server-1')
  })
})
