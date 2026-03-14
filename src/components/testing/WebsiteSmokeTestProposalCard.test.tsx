import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateStreamingMessage = vi.fn()
const showToast = vi.fn()

vi.mock('@/contexts/ChatHistoryContext', () => ({
  useChatHistory: () => ({
    sessions: [
      {
        id: 'session-1',
        messages: [
          {
            id: 'message-1',
            toolResults: [
              {
                toolCall: { id: 'tool-1', name: 'propose_website_smoke_test', arguments: {} },
                result: { success: true, data: null },
              },
            ],
          },
        ],
      },
    ],
    updateStreamingMessage,
  }),
}))

vi.mock('@/components/shared/Toast', () => ({
  useToast: () => ({ showToast }),
}))

vi.mock('@/tools/executor', () => ({
  executeTool: vi.fn(),
}))

const { executeTool } = await import('@/tools/executor')
const { WebsiteSmokeTestProposalCard } = await import('./WebsiteSmokeTestProposalCard')

describe('WebsiteSmokeTestProposalCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs the proposed smoke test only after approval', async () => {
    vi.mocked(executeTool).mockResolvedValue({
      success: true,
      data: {
        status: 'passed',
        targetUrl: 'https://example.com/',
        goal: 'Check login',
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:00:01.000Z',
        completedSteps: 1,
        totalSteps: 1,
        assertionResults: [],
        artifacts: {},
        summary: 'Passed.',
      },
    })

    render(
      <WebsiteSmokeTestProposalCard
        proposalResult={{
          status: 'awaiting_approval',
          createdAt: '2026-01-01T00:00:00.000Z',
          summary: 'Proposal ready.',
          proposal: {
            url: 'https://example.com/',
            goal: 'Check login',
            steps: [{ type: 'goto', url: 'https://example.com/' }],
            assertions: [{ type: 'textVisible', text: 'Welcome' }],
            options: { headless: true, timeoutMs: 30000, viewport: { width: 1440, height: 900 }, screenshots: 'final-only', trace: 'on-failure' },
          },
        }}
        sessionId="session-1"
        messageId="message-1"
        toolResultIndex={0}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /approve and run/i }))

    await waitFor(() => {
      expect(executeTool).toHaveBeenCalledWith(
        'run_website_smoke_test',
        expect.objectContaining({ url: 'https://example.com/' })
      )
    })

    expect(updateStreamingMessage).toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('Website smoke test completed.', 'success')
  })

  it('shows a deterministic follow-up note inside the proposal card', () => {
    render(
      <WebsiteSmokeTestProposalCard
        proposalResult={{
          status: 'awaiting_approval',
          createdAt: '2026-01-01T00:00:00.000Z',
          summary: 'Proposal ready.',
          proposal: {
            url: 'https://example.com/',
            goal: 'Check login',
            steps: [
              { type: 'goto', url: 'https://example.com/' },
              { type: 'fill', target: { by: 'placeholder', value: 'Username' }, value: 'admin' },
              { type: 'click', target: { by: 'role', value: 'Login' } },
            ],
            assertions: [{ type: 'urlContains', value: 'dashboard' }],
          },
        }}
      />
    )

    expect(screen.getByText(/before i run it/i)).toBeInTheDocument()
    expect(screen.getByText(/reply with the tweak and i will update the proposal/i)).toBeInTheDocument()
    expect(screen.getByText('placeholder:Username')).toBeInTheDocument()
    expect(screen.getByText('role:Login')).toBeInTheDocument()
  })
})
