import { describe, expect, it } from 'vitest'
import type { AgentVerificationStrategy } from '../../../../../agent/reliability'
import { createAgentToolLoopState, transitionAgentToolLoop } from './agentToolLoop'

const strategy: AgentVerificationStrategy = {
  category: 'file',
  reason: 'verify write',
  preferredTools: ['file_read'],
  mutatingToolNames: ['file_write'],
  postconditions: [],
}

describe('agentToolLoop', () => {
  it('starts verification exactly once for a checkpoint', () => {
    const initial = createAgentToolLoopState({
      totalSearchCount: 1,
      initialSearchQueries: ['first'],
      initialVerificationStrategy: strategy,
    })

    const started = transitionAgentToolLoop(initial, { type: 'follow-up-round-started' })
    const repeated = transitionAgentToolLoop(started.state, {
      type: 'follow-up-round-started',
    })

    expect(started.effects).toEqual([{ type: 'verification-started', strategy }])
    expect(repeated.effects).toEqual([])
  })

  it('allows one recovery before failing an inconclusive checkpoint', () => {
    const initial = transitionAgentToolLoop(
      createAgentToolLoopState({
        totalSearchCount: 0,
        initialSearchQueries: [],
        initialVerificationStrategy: strategy,
      }),
      { type: 'follow-up-round-started' }
    ).state

    const recovery = transitionAgentToolLoop(initial, {
      type: 'follow-up-ended-without-tool-call',
    })
    const failed = transitionAgentToolLoop(recovery.state, {
      type: 'follow-up-ended-without-tool-call',
    })

    expect(recovery.state.status).toBe('verification-recovery')
    expect(recovery.state.researchRound).toBe(2)
    expect(failed.state.status).toBe('verification-failed')
    expect(failed.effects).toEqual([
      { type: 'verification-completed', strategy, outcome: 'inconclusive' },
    ])
  })

  it('preserves contradicted evidence when recovery is also inconclusive', () => {
    const initial = createAgentToolLoopState({
      totalSearchCount: 0,
      initialSearchQueries: [],
      initialVerificationStrategy: strategy,
    })
    const recovery = transitionAgentToolLoop(initial, {
      type: 'follow-up-tool-results-received',
      executedWebSearchCount: 0,
      executedWebSearchQueries: [],
      nextMutationStrategy: null,
      continuedUiWorkflow: false,
      verificationOutcome: 'contradicted',
      verificationEnabled: true,
    })
    const failed = transitionAgentToolLoop(recovery.state, {
      type: 'follow-up-ended-without-tool-call',
    })

    expect(recovery.state.status).toBe('verification-recovery')
    expect(failed.state.verificationCheckpoint.outcome).toBe('contradicted')
    expect(failed.effects).toEqual([
      { type: 'verification-completed', strategy, outcome: 'contradicted' },
    ])
  })

  it('records research progress and completes verified checkpoints', () => {
    const initial = createAgentToolLoopState({
      totalSearchCount: 2,
      initialSearchQueries: ['one'],
      initialVerificationStrategy: strategy,
    })

    const result = transitionAgentToolLoop(initial, {
      type: 'follow-up-tool-results-received',
      executedWebSearchCount: 1,
      executedWebSearchQueries: ['two'],
      nextMutationStrategy: null,
      continuedUiWorkflow: false,
      verificationOutcome: 'verified',
      verificationEnabled: true,
    })

    expect(result.state).toMatchObject({
      status: 'running',
      researchRound: 2,
      totalSearchCount: 3,
      searchQueryHistory: ['one', 'two'],
      pendingVerificationStrategy: null,
      verificationStepStarted: false,
    })
    expect(result.effects).toEqual([
      { type: 'verification-completed', strategy, outcome: 'verified' },
    ])
  })

  it('moves a continued UI workflow to a fresh checkpoint', () => {
    const nextStrategy = { ...strategy, category: 'visual' as const }
    const initial = createAgentToolLoopState({
      totalSearchCount: 0,
      initialSearchQueries: [],
      initialVerificationStrategy: strategy,
    })

    const result = transitionAgentToolLoop(initial, {
      type: 'follow-up-tool-results-received',
      executedWebSearchCount: 0,
      executedWebSearchQueries: [],
      nextMutationStrategy: nextStrategy,
      continuedUiWorkflow: true,
      verificationOutcome: 'inconclusive',
      verificationEnabled: true,
    })

    expect(result.state).toMatchObject({
      status: 'running',
      pendingVerificationStrategy: nextStrategy,
      verificationCheckpoint: { phase: 'initial' },
    })
    expect(result.effects).toEqual([])
  })

  it('discovers a verification checkpoint after an ordinary tool round', () => {
    const initial = createAgentToolLoopState({
      totalSearchCount: 0,
      initialSearchQueries: [],
      initialVerificationStrategy: null,
    })

    const result = transitionAgentToolLoop(initial, {
      type: 'follow-up-tool-results-received',
      executedWebSearchCount: 0,
      executedWebSearchQueries: [],
      nextMutationStrategy: strategy,
      continuedUiWorkflow: false,
      verificationOutcome: false,
      verificationEnabled: true,
    })

    expect(result.state.pendingVerificationStrategy).toBe(strategy)
    expect(result.state.verificationCheckpoint.phase).toBe('initial')
  })
})
