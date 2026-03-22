// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { McpApprovalManager } from './mcpApprovalManager'

describe('McpApprovalManager', () => {
  it('tracks pending approvals and resolves them from the renderer path', async () => {
    const manager = new McpApprovalManager({ defaultTimeoutMs: 1000 })

    const decisionPromise = manager.requestApproval({
      serverId: 'server-1',
      serverName: 'Filesystem',
      serverTransport: 'stdio',
      toolName: 'read_file',
      namespacedToolName: 'mcp__filesystem__read_file',
      arguments: { path: '/tmp/demo.txt' },
    })

    expect(manager.listPendingApprovals()).toHaveLength(1)

    const pending = manager.listPendingApprovals()[0]
    expect(pending).toMatchObject({
      serverId: 'server-1',
      toolName: 'read_file',
    })

    const decision = manager.resolveApproval(pending.id, true)
    expect(decision).toMatchObject({ approved: true, outcome: 'approved' })
    await expect(decisionPromise).resolves.toMatchObject({ approved: true, outcome: 'approved' })
    expect(manager.listPendingApprovals()).toEqual([])
  })

  it('auto-rejects timed out approvals', async () => {
    vi.useFakeTimers()
    const manager = new McpApprovalManager({ defaultTimeoutMs: 25 })

    const decisionPromise = manager.requestApproval({
      serverId: 'server-1',
      serverName: 'Filesystem',
      serverTransport: 'stdio',
      toolName: 'read_file',
      namespacedToolName: 'mcp__filesystem__read_file',
      arguments: { path: '/tmp/demo.txt' },
    })

    await vi.advanceTimersByTimeAsync(30)

    await expect(decisionPromise).resolves.toMatchObject({
      approved: false,
      outcome: 'timed_out',
    })
    expect(manager.listPendingApprovals()).toEqual([])
    vi.useRealTimers()
  })
})
