import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ track: vi.fn() }))

vi.mock('@/analytics/track', () => ({ trackAnalytics: mocks.track }))

import {
  startAgentRunTelemetry,
  trackAgentApprovalResolved,
  trackAgentRunFinished,
  trackAgentRunStarted,
  trackAgentVerificationResolved,
} from './agentAnalytics'

describe('privacy-safe Agent analytics', () => {
  beforeEach(() => mocks.track.mockClear())

  it('emits lifecycle diagnostics without run ids, prompt text, paths, titles, or payloads', () => {
    trackAgentRunStarted()
    trackAgentRunFinished({
      outcome: 'failed',
      verificationOutcome: 'unverified',
      durationMs: 123.4,
      stopReason: 'budget_exhausted',
      budgetReason: 'tool_calls',
    })

    expect(mocks.track).toHaveBeenNthCalledWith(1, 'agent_run_started')
    expect(mocks.track).toHaveBeenNthCalledWith(2, 'agent_run_finished', {
      runOutcome: 'failed',
      verificationOutcome: 'unverified',
      durationMs: 123,
      stopReason: 'budget_exhausted',
      budgetReason: 'tool_calls',
    })
    expect(JSON.stringify(mocks.track.mock.calls)).not.toMatch(
      /runId|prompt|path|title|hwnd|screenshot|payload|argument|secret/i
    )
  })

  it('emits only categorical approval and verification outcomes plus bounded timing', () => {
    trackAgentApprovalResolved({
      outcome: 'timed_out',
      source: 'manual',
      durationMs: Number.NaN,
    })
    trackAgentVerificationResolved({
      outcome: 'contradicted',
      recoveryUsed: true,
      durationMs: 42.8,
    })

    expect(mocks.track).toHaveBeenNthCalledWith(1, 'agent_approval_resolved', {
      approvalOutcome: 'timed_out',
      approvalSource: 'manual',
      durationMs: 0,
    })
    expect(mocks.track).toHaveBeenNthCalledWith(2, 'agent_verification_resolved', {
      verificationOutcome: 'contradicted',
      recoveryUsed: true,
      durationMs: 43,
    })
  })

  it('emits exactly one terminal event for a run lifecycle', () => {
    const session = startAgentRunTelemetry(100)

    expect(
      session.finish({
        outcome: 'failed',
        verificationOutcome: 'unverified',
        stopReason: 'budget_exhausted',
        budgetReason: 'mutations',
        finishedAt: 250,
      })
    ).toBe(true)
    expect(
      session.finish({
        outcome: 'completed',
        verificationOutcome: 'verified',
        stopReason: 'completed',
        finishedAt: 300,
      })
    ).toBe(false)

    expect(mocks.track.mock.calls.map((call) => call[0])).toEqual([
      'agent_run_started',
      'agent_run_finished',
    ])
  })
})
