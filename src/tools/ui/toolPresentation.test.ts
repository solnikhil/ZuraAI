import { describe, expect, it } from 'vitest'

import { normalizeToolPresentation } from './toolPresentation'

const mcpMetadata = {
  origin: 'mcp' as const,
  serverId: 'filesystem',
  serverName: 'Filesystem',
  namespacedToolName: 'mcp__filesystem__read_file',
  originalToolName: 'read_file',
  trusted: true,
  approvalState: 'approved' as const,
  durationMs: 42,
  outcome: 'success' as const,
}

describe('normalizeToolPresentation', () => {
  it('normalizes MCP labels, status, audit metadata, and structured output', () => {
    const viewModel = normalizeToolPresentation({
      toolName: 'mcp__filesystem__read_file',
      result: { files: [{ name: 'readme.md', description: 'Documentation' }] },
      metadata: mcpMetadata,
    })

    expect(viewModel).toMatchObject({
      isMcp: true,
      toolLabel: 'Read File',
      serverLabel: 'Filesystem',
      combinedLabel: 'Read File on Filesystem',
      subtitleLabel: 'Filesystem MCP',
      status: { label: 'Completed', tone: 'success' },
      approvalLabel: 'Approved',
      trustedLabel: 'Trusted',
      durationMs: 42,
      outputItems: [{ key: 'readme.md', value: 'Documentation' }],
    })
    expect(viewModel.auditLine).toContain('Filesystem MCP')
    expect(viewModel.auditLine).toContain('Approved')
  })

  it('distinguishes rejected approvals and disconnects', () => {
    expect(
      normalizeToolPresentation({
        toolName: 'mcp__filesystem__read_file',
        error: 'Approval rejected by user',
        metadata: { ...mcpMetadata, approvalState: 'rejected', outcome: 'rejected' },
      }).status
    ).toMatchObject({ label: 'Rejected', tone: 'warning' })

    expect(
      normalizeToolPresentation({
        toolName: 'mcp__filesystem__read_file',
        error: 'MCP transport disconnected before response',
        metadata: { ...mcpMetadata, outcome: 'cancelled' },
      }).status
    ).toMatchObject({ label: 'Disconnected', tone: 'warning' })
  })
})
