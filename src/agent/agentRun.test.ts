import { describe, expect, it, vi } from 'vitest'

import {
  buildAgentCapabilities,
  completeAgentToolStep,
  createAgentRun,
  finishAgentRun,
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
    expect(run.phase).toBe('discover')
    expect(run.verification).toBe('not-required')
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
    expect(awaitingApproval.phase).toBe('act')

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

  it('persists only privacy-safe tool metadata in the run ledger', () => {
    const toolCall = {
      id: 'call-sensitive',
      name: 'file_write',
      arguments: {
        path: 'C:\\Users\\Example\\private.txt',
        content: 'never persist this secret',
      },
    }

    const started = upsertAgentToolStep(createAgentRun('agent'), toolCall, {
      status: 'running',
    })
    const completed = completeAgentToolStep(started, {
      toolCall,
      result: {
        success: true,
        data: { content: 'nor this returned secret' },
        executionTime: 15,
      },
    })
    const serialized = JSON.stringify(completed.steps.at(-1))

    expect(completed.steps.at(-1)?.arguments).toEqual({
      argumentKeys: ['content', 'path'],
    })
    expect(completed.steps.at(-1)?.result).toEqual({
      success: true,
      executionTime: 15,
    })
    expect(serialized).not.toContain('private.txt')
    expect(serialized).not.toContain('secret')
  })

  it('stores a task-specific plan step on new agent runs', () => {
    const run = createAgentRun(
      'agent',
      'Sort my desktop without touching shortcuts',
      'controller-run-1'
    )

    expect(run.id).toBe('controller-run-1')

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
        postconditions: [
          { kind: 'file-exists', path: 'b' },
          { kind: 'file-absent', path: 'a' },
        ],
      },
      { status: 'running', startedAt: 10 }
    )
    expect(started.verification).toBe('pending')
    expect(started.phase).toBe('verify')

    const completed = upsertAgentVerificationStep(
      started,
      {
        category: 'file',
        reason: 'File changes were made and need a read-only filesystem check.',
        preferredTools: ['file_search', 'file_read'],
        mutatingToolNames: ['file_move'],
        postconditions: [
          { kind: 'file-exists', path: 'b' },
          { kind: 'file-absent', path: 'a' },
        ],
      },
      {
        status: 'completed',
        verificationOutcome: 'verified',
        completedAt: 25,
        durationMs: 15,
      }
    )

    expect(completed.steps.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'verify',
        status: 'completed',
        summary: 'File changes were made and need a read-only filesystem check.',
        arguments: expect.objectContaining({
          preferredTools: ['file_search', 'file_read'],
          mutatingToolNames: ['file_move'],
          postconditions: [
            { kind: 'file-exists', path: 'b' },
            { kind: 'file-absent', path: 'a' },
          ],
        }),
      })
    )
    expect(completed.steps.filter((step) => step.kind === 'verify')).toHaveLength(1)
    expect(completed.verification).toBe('verified')
  })

  it.each(['pending', 'contradicted'] as const)(
    'does not let completed mask %s verification',
    (verification) => {
      const finished = finishAgentRun({ ...createAgentRun('agent'), verification }, 'completed')

      expect(finished).toEqual(
        expect.objectContaining({ status: 'failed', phase: 'report', verification })
      )
    }
  )

  it('reports inconclusive evidence as completed but explicitly unverified', () => {
    const finished = finishAgentRun(
      { ...createAgentRun('agent'), verification: 'inconclusive' },
      'completed'
    )

    expect(finished).toEqual(
      expect.objectContaining({
        status: 'completed_unverified',
        phase: 'report',
        verification: 'inconclusive',
      })
    )
  })

  it.each(['not-required', 'verified'] as const)(
    'allows completed when verification is %s',
    (verification) => {
      const finished = finishAgentRun({ ...createAgentRun('agent'), verification }, 'completed')

      expect(finished).toEqual(expect.objectContaining({ status: 'completed', verification }))
    }
  )

  it('records a typed failed verification outcome', () => {
    const failed = upsertAgentVerificationStep(
      createAgentRun('agent'),
      {
        category: 'file',
        reason: 'The destination did not contain the moved file.',
        preferredTools: ['file_search'],
        mutatingToolNames: ['file_move'],
        postconditions: [{ kind: 'file-exists', path: 'destination.txt' }],
      },
      { status: 'failed', verificationOutcome: 'contradicted' }
    )

    expect(failed.verification).toBe('contradicted')
    expect(failed.steps.at(-1)?.verificationOutcome).toBe('contradicted')
  })

  it('does not persist expected file content or UI values in verification arguments', () => {
    const run = upsertAgentVerificationStep(
      createAgentRun('agent'),
      {
        category: 'file',
        reason: 'Verify sensitive changes.',
        preferredTools: ['file_read', 'ui_get_app_state'],
        mutatingToolNames: ['file_write', 'ui_set_value'],
        postconditions: [
          { kind: 'file-content', path: 'secret.txt', expectedContent: 'private-content' },
          { kind: 'ui-value', elementId: 'uie-secret', expectedValue: 'private-value' },
        ],
      },
      { status: 'running' }
    )

    expect(run.steps.at(-1)?.arguments?.postconditions).toEqual([
      { kind: 'file-content', path: 'secret.txt', expectedLength: 15 },
      { kind: 'ui-value', elementId: 'uie-secret', expectedLength: 13 },
    ])
    expect(JSON.stringify(run.steps.at(-1)?.arguments)).not.toContain('private-')
  })
})
