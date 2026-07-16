import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

import { AgentToolApprovalProvider, useAgentToolApproval } from './AgentToolApprovalContext'
import { consumeToolApprovalToken } from '@/tools/toolApprovalTokens'

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

  it('delegates exact arguments to main and retains its one-use approval token', async () => {
    const requestApproval = vi.fn(async () => ({
      approved: true,
      trusted: true,
      approvalToken: 'main-issued-token',
    }))
    window.agentApproval = { requestApproval }
    render(
      <AgentToolApprovalProvider>
        <ApprovalHarness />
      </AgentToolApprovalProvider>
    )

    fireEvent.click(screen.getByText('request'))
    await waitFor(() => {
      expect(document.body.dataset.approval).toBe('approved')
    })
    expect(requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'system_shell',
        toolArguments: { command: 'Get-ChildItem', description: 'List files' },
      })
    )
    const request = requestApproval.mock.calls[0][0]
    const toolCallId = request.id.replace(/^agent-approval-/, '').replace(/-\d+$/, '')
    expect(consumeToolApprovalToken(toolCallId)).toBe('main-issued-token')
  })
})
