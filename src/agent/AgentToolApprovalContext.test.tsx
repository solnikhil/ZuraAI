import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

import { AgentToolApprovalProvider, useAgentToolApproval } from './AgentToolApprovalContext'

const mocks = vi.hoisted(() => ({ showToast: vi.fn(), trackApproval: vi.fn() }))

vi.mock('@/components/shared', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}))

vi.mock('./agentAnalytics', () => ({
  trackAgentApprovalResolved: mocks.trackApproval,
}))

function ApprovalHarness({ structured = false }: { structured?: boolean }) {
  const { requestApproval, requestApprovalDecision } = useAgentToolApproval()

  return (
    <button
      type="button"
      onClick={async () => {
        const toolCall = {
          id: `shell-${Date.now()}`,
          name: 'system_shell',
          arguments: {
            command: 'Get-ChildItem',
            description: 'List files',
          },
        }
        const context = { runId: 'run-1', taskTitle: 'List workspace files' }
        if (structured) {
          const decision = await requestApprovalDecision(toolCall, context)
          document.body.dataset.approval = decision.outcome
          document.body.dataset.approvalToken = decision.approvalToken
        } else {
          const approved = await requestApproval(toolCall, context)
          document.body.dataset.approval = approved ? 'approved' : 'rejected'
        }
      }}
    >
      request
    </button>
  )
}

describe('AgentToolApprovalProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.agentApproval = undefined
    mocks.showToast.mockClear()
    mocks.trackApproval.mockClear()
    delete document.body.dataset.approval
    delete document.body.dataset.approvalToken
  })

  it('delegates exact arguments to main and returns its one-use approval token directly', async () => {
    const requestApproval = vi.fn(async () => ({
      approved: true,
      outcome: 'approved_policy' as const,
      trusted: true,
      approvalToken: 'main-issued-token',
    }))
    window.agentApproval = { requestApproval }
    render(
      <AgentToolApprovalProvider>
        <ApprovalHarness structured />
      </AgentToolApprovalProvider>
    )

    fireEvent.click(screen.getByText('request'))
    await waitFor(() => {
      expect(document.body.dataset.approval).toBe('approved_policy')
    })
    expect(requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'system_shell',
        toolArguments: { command: 'Get-ChildItem', description: 'List files' },
        runId: 'run-1',
        taskTitle: 'List workspace files',
      })
    )
    expect(document.body.dataset.approvalToken).toBe('main-issued-token')
    expect(mocks.showToast).toHaveBeenCalledWith('Tool call trusted.', 'success')
    expect(mocks.trackApproval).toHaveBeenCalledWith({
      outcome: 'approved_policy',
      source: 'trusted',
      durationMs: expect.any(Number),
    })
  })

  it('returns structured infrastructure outcomes and never labels them as rejection', async () => {
    window.agentApproval = {
      requestApproval: vi.fn(async () => ({
        approved: false,
        outcome: 'unavailable' as const,
      })),
    }
    render(
      <AgentToolApprovalProvider>
        <ApprovalHarness structured />
      </AgentToolApprovalProvider>
    )

    fireEvent.click(screen.getByText('request'))
    await waitFor(() => expect(document.body.dataset.approval).toBe('unavailable'))
    expect(mocks.showToast).toHaveBeenCalledWith('Tool approval is unavailable.', 'error')
    expect(mocks.showToast).not.toHaveBeenCalledWith('Tool call rejected.', expect.anything())
    expect(mocks.trackApproval).toHaveBeenCalledWith({
      outcome: 'unavailable',
      source: 'manual',
      durationMs: expect.any(Number),
    })
  })

  it('fails closed when the native bridge errors or the provider is missing', async () => {
    window.agentApproval = {
      requestApproval: vi.fn(async () => {
        throw new Error('bridge unavailable')
      }),
    }
    const { unmount } = render(
      <AgentToolApprovalProvider>
        <ApprovalHarness />
      </AgentToolApprovalProvider>
    )

    fireEvent.click(screen.getByText('request'))
    await waitFor(() => expect(document.body.dataset.approval).toBe('rejected'))
    expect(mocks.showToast).toHaveBeenCalledWith('Tool approval failed. Try again.', 'error')

    unmount()
    delete document.body.dataset.approval
    window.agentApproval = undefined
    render(<ApprovalHarness structured />)
    fireEvent.click(screen.getByText('request'))
    await waitFor(() => expect(document.body.dataset.approval).toBe('unavailable'))
  })
})
