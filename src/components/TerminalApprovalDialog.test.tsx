import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { TerminalApprovalDialog } from './TerminalApprovalDialog'
import type { PendingTerminalApproval } from '@/electron/types'

const mockResolveApproval = vi.fn(async () => ({
  requestId: 'req-1',
  approved: true,
  resolvedAt: Date.now(),
  outcome: 'approved' as const,
}))
const mockShowToast = vi.fn()

vi.mock('@/components/shared', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

const pending: PendingTerminalApproval = {
  id: 'req-1',
  command: 'Get-ChildItem -Path C:\\temp',
  cwd: 'C:\\temp',
  description: 'List files in temp',
  requestedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
}

function installTerminalBridge() {
  ;(window as unknown as { terminal: unknown }).terminal = {
    resolveApproval: mockResolveApproval,
    onPendingApproval: () => () => {},
  }
}

afterEach(() => {
  vi.clearAllMocks()
  delete (window as unknown as { terminal?: unknown }).terminal
})

describe('TerminalApprovalDialog', () => {
  it('renders the command, cwd, and description', () => {
    installTerminalBridge()
    render(<TerminalApprovalDialog initialPending={[pending]} />)

    expect(screen.getByText('Approve terminal command')).toBeTruthy()
    expect(screen.getByText('List files in temp')).toBeTruthy()
    expect(screen.getByText('Get-ChildItem -Path C:\\temp')).toBeTruthy()
    expect(screen.getByText('C:\\temp')).toBeTruthy()
  })

  it('approves the command via the bridge', async () => {
    installTerminalBridge()
    render(<TerminalApprovalDialog initialPending={[pending]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => {
      expect(mockResolveApproval).toHaveBeenCalledWith('req-1', true)
    })
  })

  it('rejects the command via the bridge', async () => {
    installTerminalBridge()
    render(<TerminalApprovalDialog initialPending={[pending]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))

    await waitFor(() => {
      expect(mockResolveApproval).toHaveBeenCalledWith('req-1', false)
    })
  })

  it('renders nothing when there are no pending approvals', () => {
    installTerminalBridge()
    const { container } = render(<TerminalApprovalDialog initialPending={[]} />)
    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
  })
})
