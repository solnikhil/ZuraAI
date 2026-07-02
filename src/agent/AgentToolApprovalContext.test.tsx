import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

import { AgentToolApprovalProvider, useAgentToolApproval } from './AgentToolApprovalContext'

vi.mock('@/components/shared', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

function ApprovalHarness() {
  const { requestApproval } = useAgentToolApproval()

  return (
    <button
      type="button"
      onClick={async () => {
        const approved = await requestApproval({
          id: `shell-${Date.now()}`,
          name: 'system_shell',
          arguments: {
            command: 'Get-ChildItem',
            description: 'List files',
          },
        })
        document.body.dataset.approval = approved ? 'approved' : 'rejected'
      }}
    >
      request
    </button>
  )
}

describe('AgentToolApprovalProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    delete document.body.dataset.approval
  })

  it('trusts an exact tool call so matching future requests do not prompt', async () => {
    render(
      <AgentToolApprovalProvider>
        <ApprovalHarness />
      </AgentToolApprovalProvider>
    )

    fireEvent.click(screen.getByText('request'))
    expect(await screen.findByText('Approve Agent Mode action')).toBeInTheDocument()
    expect(screen.getByText('Approve once')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Always allow exact repeat'))
    await waitFor(() => {
      expect(document.body.dataset.approval).toBe('approved')
    })

    delete document.body.dataset.approval
    fireEvent.click(screen.getByText('request'))
    await waitFor(() => {
      expect(document.body.dataset.approval).toBe('approved')
    })
    expect(screen.queryByText('Approve Agent Mode action')).not.toBeInTheDocument()
  })
})
