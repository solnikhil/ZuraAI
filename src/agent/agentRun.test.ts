import { describe, expect, it, vi } from 'vitest'

import {
  buildAgentCapabilities,
  completeAgentToolStep,
  createAgentRun,
  upsertAgentVerificationStep,
  upsertAgentToolStep,
} from './agentRun'

describe('agentRun helpers', () => {
  it('marks Computer Use unavailable outside Windows', () => {
    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
      userAgent: 'Mozilla/5.0 Macintosh',
    })

    expect(buildAgentCapabilities('agent').computer).toBe('unavailable')

    vi.unstubAllGlobals()
  })

  it('creates and completes tool steps', () => {
    const run = createAgentRun('agent')
    expect(run.capabilities).not.toHaveProperty('agentDesktop')
    const toolCall = {
      id: 'call-1',
      name: 'web_search',
      arguments: { query: 'zura ai' },
    }

    const awaitingApproval = upsertAgentToolStep(run, toolCall, {
      status: 'awaiting-approval',
      approvalState: 'pending',
    })

    expect(awaitingApproval.steps.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'web',
        status: 'awaiting-approval',
        approvalState: 'pending',
      })
    )

    const completed = completeAgentToolStep(awaitingApproval, {
      toolCall,
      result: {
        success: true,
        data: { results: [] },
        executionTime: 123,
      },
    })

    expect(completed.steps.at(-1)).toEqual(
      expect.objectContaining({
        status: 'completed',
        durationMs: 123,
      })
    )
  })

  it('stores a task-specific plan step on new agent runs', () => {
    const run = createAgentRun('agent', 'Sort my desktop without touching shortcuts')

    expect(run.steps[0]).toEqual(
      expect.objectContaining({
        kind: 'plan',
        status: 'completed',
        title: 'Plan agent task',
        summary: 'Goal: Sort my desktop without touching shortcuts',
        arguments: expect.objectContaining({
          goal: 'Sort my desktop without touching shortcuts',
          intendedToolPath: expect.stringContaining('native tools first'),
          verificationMethod: expect.stringContaining('After any mutating action'),
        }),
      })
    )
  })

  it('records verification steps without changing tool step shape', () => {
    const run = createAgentRun('agent')
    const started = upsertAgentVerificationStep(
      run,
      {
        category: 'file',
        reason: 'File changes were made and need a read-only filesystem check.',
        preferredTools: ['file_search', 'file_read'],
        mutatingToolNames: ['file_move'],
      },
      { status: 'running', startedAt: 10 }
    )

    const completed = upsertAgentVerificationStep(
      started,
      {
        category: 'file',
        reason: 'File changes were made and need a read-only filesystem check.',
        preferredTools: ['file_search', 'file_read'],
        mutatingToolNames: ['file_move'],
      },
      { status: 'completed', completedAt: 25, durationMs: 15 }
    )

    expect(completed.steps.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'verify',
        status: 'completed',
        summary: 'File changes were made and need a read-only filesystem check.',
        arguments: expect.objectContaining({
          preferredTools: ['file_search', 'file_read'],
          mutatingToolNames: ['file_move'],
        }),
      })
    )
    expect(completed.steps.filter((step) => step.kind === 'verify')).toHaveLength(1)
  })
})
