import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { McpApprovalDialog } from './McpApprovalDialog'

const mockResolveApproval = vi.fn(async () => undefined)
const mockShowToast = vi.fn()

vi.mock('@/mcp/McpContext', () => ({
  useMcp: () => ({
    pendingApprovals: [
      {
        id: 'approval-1',
        serverId: 'server-1',
        serverName: 'Filesystem',
        serverTransport: 'stdio',
        toolName: 'read_file',
        namespacedToolName: 'mcp__filesystem__read_file',
        arguments: { path: '/tmp/demo.txt' },
        requestedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      },
    ],
    resolveApproval: mockResolveApproval,
  }),
}))

vi.mock('@/components/shared', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

describe('McpApprovalDialog', () => {
  it('shows the pending approval and resolves it when approved', async () => {
    render(<McpApprovalDialog />)

    expect(screen.getByText('Approve MCP tool execution')).toBeTruthy()
    expect(screen.getByText(/Filesystem wants to run/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => {
      expect(mockResolveApproval).toHaveBeenCalledWith('approval-1', true)
    })
  })
})
