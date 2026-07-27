import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentRun } from '@/chat/types'
import { AgentRunTimeline } from './AgentRunTimeline'

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run-1',
    mode: 'agent',
    status: 'running',
    verification: 'pending',
    startedAt: Date.now() - 2_000,
    capabilities: {
      web: 'approval-required',
      code: 'approval-required',
      mcp: 'approval-required',
      computer: 'approval-required',
    },
    steps: [
      {
        id: 'step-1',
        kind: 'computer',
        status: 'awaiting-approval',
        title: 'Select target window',
        summary: 'Waiting to control the requested app',
        approvalState: 'pending',
      },
    ],
    ...overrides,
  }
}

describe('AgentRunTimeline', () => {
  beforeEach(() => {
    window.agentRun = undefined
  })

  it('shows active phase, approval, persistent Stop, and desktop emergency guidance', () => {
    const onStop = vi.fn()
    render(<AgentRunTimeline run={makeRun()} isActive onStop={onStop} />)

    const timeline = screen.getByRole('region', { name: 'Agent run timeline' })
    expect(within(timeline).getByText('Approval needed')).toBeInTheDocument()
    expect(within(timeline).getAllByText(/Select target window/)).toHaveLength(2)
    expect(within(timeline).getByText('Waiting for approval')).toBeInTheDocument()
    expect(
      within(timeline).getByText(
        (_, element) =>
          element?.tagName === 'SPAN' &&
          element.textContent === 'Press Esc twice quickly for desktop emergency stop.'
      )
    ).toBeInTheDocument()

    fireEvent.click(within(timeline).getByRole('button', { name: 'Stop agent run' }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('collapses a completed verified run to a durable one-line summary', () => {
    render(
      <AgentRunTimeline
        run={makeRun({
          status: 'completed',
          verification: 'verified',
          completedAt: Date.now(),
          steps: [
            {
              id: 'verify-1',
              kind: 'verify',
              status: 'completed',
              title: 'Verify changes',
              summary: 'Read back the updated state',
              approvalState: 'not-required',
            },
          ],
        })}
      />
    )

    expect(screen.getByText('Verified')).toBeInTheDocument()
    expect(
      screen.queryByText('Fresh evidence confirmed the result.', { selector: 'dd' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Current action')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('Current action')).toBeInTheDocument()
    expect(screen.getAllByText('Read back the updated state')).toHaveLength(2)
  })

  it('never presents a failed verification as success', () => {
    render(
      <AgentRunTimeline
        run={makeRun({
          status: 'completed',
          verification: 'inconclusive',
          completedAt: Date.now(),
          steps: [
            {
              id: 'verify-failed',
              kind: 'verify',
              status: 'failed',
              title: 'Verify changes',
              summary: 'The expected state was not observed',
              approvalState: 'not-required',
            },
          ],
        })}
      />
    )

    expect(screen.getByText('Unverified')).toBeInTheDocument()
    expect(screen.queryByText('Verified')).not.toBeInTheDocument()
  })

  it('keeps a run active while a verified checkpoint is still reporting', () => {
    render(
      <AgentRunTimeline
        run={makeRun({
          verification: 'verified',
          steps: [
            {
              id: 'reporting',
              kind: 'answer',
              status: 'running',
              title: 'Report result',
              summary: 'Preparing the final answer',
            },
          ],
        })}
        isActive
        onStop={vi.fn()}
      />
    )

    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Checkpoint verified')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop agent run' })).toBeInTheDocument()
  })

  it('polls and presents main-owned tool, mutation, and time budgets', async () => {
    window.agentRun = {
      cancel: vi.fn(async () => true),
      getRuntime: vi.fn(async () => ({
        runId: 'run-1',
        status: 'running' as const,
        startedAt: Date.now() - 1_000,
        toolCalls: 3,
        mutations: 1,
        activeToolCalls: 1,
        limits: {
          maxToolCalls: 20,
          maxMutations: 6,
          maxDurationMs: 60_000,
        },
      })),
    }

    render(<AgentRunTimeline run={makeRun()} isActive onStop={vi.fn()} />)

    expect(await screen.findByText('17 of 20 remaining - 1 active')).toBeInTheDocument()
    expect(screen.getByText('5 of 6 remaining')).toBeInTheDocument()
    expect(screen.getByText('Time budget')).toBeInTheDocument()
    expect(window.agentRun.getRuntime).toHaveBeenCalledWith('run-1')
  })
})
