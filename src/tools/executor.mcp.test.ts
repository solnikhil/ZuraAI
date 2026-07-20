import { beforeEach, describe, expect, it, vi } from 'vitest'

import { executeTool } from './executor'

const testWindow = window as Window &
  typeof globalThis & { mcp: { executeTool: ReturnType<typeof vi.fn> } }

describe('executeTool MCP routing', () => {
  beforeEach(() => {
    testWindow.mcp = {
      executeTool: vi.fn(async () => ({
        success: true,
        data: { structuredContent: { ok: true } },
        metadata: {
          origin: 'mcp',
          serverId: 'server-1',
          serverName: 'Filesystem',
          namespacedToolName: 'mcp__filesystem__read_file',
          originalToolName: 'read_file',
          trusted: true,
          approvalState: 'approved',
          durationMs: 12,
          outcome: 'success',
        },
      })),
    } as any
  })

  it('routes namespaced MCP tools through the dedicated preload bridge', async () => {
    const result = await executeTool('mcp__filesystem__read_file', { path: '/tmp/demo.txt' })

    expect(testWindow.mcp.executeTool).toHaveBeenCalledWith('mcp__filesystem__read_file', {
      path: '/tmp/demo.txt',
    })
    expect(result.success).toBe(true)
    expect(result.metadata).toMatchObject({
      origin: 'mcp',
      serverName: 'Filesystem',
    })
  })

  it('forwards a main-issued Agent Mode approval token to the MCP bridge', async () => {
    await executeTool(
      'mcp__filesystem__read_file',
      { path: '/tmp/demo.txt' },
      { approvalToken: 'one-use-token' }
    )

    expect(testWindow.mcp.executeTool).toHaveBeenCalledWith(
      'mcp__filesystem__read_file',
      { path: '/tmp/demo.txt' },
      { approvalToken: 'one-use-token' }
    )
  })
})
