import {
  advanceAgentVerificationCheckpoint,
  createAgentVerificationCheckpoint,
  type AgentVerificationCheckpointState,
  type AgentVerificationOutcome,
  type AgentVerificationStrategy,
} from '../../../../../agent/reliability'

interface AgentToolLoopBaseState {
  researchRound: number
  totalSearchCount: number
  searchQueryHistory: string[]
  verificationStepStarted: boolean
}

export interface AgentToolLoopRunningState extends AgentToolLoopBaseState {
  status: 'running'
  pendingVerificationStrategy: AgentVerificationStrategy | null
  verificationCheckpoint: AgentVerificationCheckpointState
}

export interface AgentToolLoopRecoveryState extends AgentToolLoopBaseState {
  status: 'verification-recovery'
  pendingVerificationStrategy: AgentVerificationStrategy
  verificationCheckpoint: AgentVerificationCheckpointState & { phase: 'recovery' }
}

export interface AgentToolLoopFailedState extends AgentToolLoopBaseState {
  status: 'verification-failed'
  pendingVerificationStrategy: null
  verificationCheckpoint: AgentVerificationCheckpointState & { phase: 'failed' }
}

export type AgentToolLoopState =
  | AgentToolLoopRunningState
  | AgentToolLoopRecoveryState
  | AgentToolLoopFailedState

export type AgentToolLoopEvent =
  | { type: 'follow-up-round-started' }
  | { type: 'follow-up-ended-without-tool-call' }
  | {
      type: 'follow-up-tool-results-received'
      executedWebSearchCount: number
      executedWebSearchQueries: string[]
      nextMutationStrategy: AgentVerificationStrategy | null
      continuedUiWorkflow: boolean
      verificationOutcome: AgentVerificationOutcome | false
      verificationEnabled: boolean
    }

export type AgentToolLoopEffect =
  | { type: 'verification-started'; strategy: AgentVerificationStrategy }
  | {
      type: 'verification-completed'
      strategy: AgentVerificationStrategy
      outcome: AgentVerificationOutcome
    }

export interface AgentToolLoopTransition {
  state: AgentToolLoopState
  effects: AgentToolLoopEffect[]
}

export function createAgentToolLoopState(options: {
  totalSearchCount: number
  initialSearchQueries: string[]
  initialVerificationStrategy: AgentVerificationStrategy | null
}): AgentToolLoopState {
  return {
    status: 'running',
    researchRound: 1,
    totalSearchCount: options.totalSearchCount,
    searchQueryHistory: [...options.initialSearchQueries],
    pendingVerificationStrategy: options.initialVerificationStrategy,
    verificationStepStarted: false,
    verificationCheckpoint: createAgentVerificationCheckpoint(),
  }
}

function withCheckpoint(
  state: AgentToolLoopState,
  checkpoint: AgentVerificationCheckpointState,
  pendingVerificationStrategy: AgentVerificationStrategy | null,
  verificationStepStarted: boolean
): AgentToolLoopState {
  const common = {
    researchRound: state.researchRound,
    totalSearchCount: state.totalSearchCount,
    searchQueryHistory: state.searchQueryHistory,
    verificationStepStarted,
  }

  if (checkpoint.phase === 'recovery' && pendingVerificationStrategy) {
    return {
      ...common,
      status: 'verification-recovery',
      pendingVerificationStrategy,
      verificationCheckpoint: { ...checkpoint, phase: 'recovery' },
    }
  }
  if (checkpoint.phase === 'failed') {
    return {
      ...common,
      status: 'verification-failed',
      pendingVerificationStrategy: null,
      verificationCheckpoint: { ...checkpoint, phase: 'failed' },
    }
  }
  return {
    ...common,
    status: 'running',
    pendingVerificationStrategy,
    verificationCheckpoint: checkpoint,
  }
}

/**
 * Pure orchestration reducer for research follow-ups and Agent verification checkpoints.
 * Provider streaming, tool execution, analytics, and React updates remain effect adapters.
 */
export function transitionAgentToolLoop(
  state: AgentToolLoopState,
  event: AgentToolLoopEvent
): AgentToolLoopTransition {
  if (state.status === 'verification-failed') return { state, effects: [] }

  const activeStrategy = state.pendingVerificationStrategy

  if (event.type === 'follow-up-round-started') {
    if (!activeStrategy || state.verificationStepStarted) return { state, effects: [] }
    return {
      state: { ...state, verificationStepStarted: true },
      effects: [{ type: 'verification-started', strategy: activeStrategy }],
    }
  }

  if (event.type === 'follow-up-ended-without-tool-call') {
    if (!activeStrategy) return { state, effects: [] }
    const checkpoint = advanceAgentVerificationCheckpoint(
      state.verificationCheckpoint,
      'inconclusive'
    )
    const advanced = { ...state, researchRound: state.researchRound + 1 }
    if (checkpoint.phase === 'recovery') {
      return {
        state: withCheckpoint(advanced, checkpoint, activeStrategy, true),
        effects: [],
      }
    }
    return {
      state: withCheckpoint(advanced, checkpoint, null, true),
      effects: [
        {
          type: 'verification-completed',
          strategy: activeStrategy,
          outcome: checkpoint.outcome ?? 'inconclusive',
        },
      ],
    }
  }

  const advanced = {
    ...state,
    researchRound: state.researchRound + 1,
    totalSearchCount: state.totalSearchCount + event.executedWebSearchCount,
    searchQueryHistory: [...state.searchQueryHistory, ...event.executedWebSearchQueries],
  }

  if (activeStrategy) {
    if (event.continuedUiWorkflow && event.nextMutationStrategy) {
      return {
        state: withCheckpoint(
          advanced,
          createAgentVerificationCheckpoint(),
          event.nextMutationStrategy,
          state.verificationStepStarted
        ),
        effects: [],
      }
    }

    const checkpoint = advanceAgentVerificationCheckpoint(
      state.verificationCheckpoint,
      event.verificationOutcome || 'inconclusive'
    )
    if (checkpoint.phase === 'verified') {
      return {
        state: withCheckpoint(advanced, createAgentVerificationCheckpoint(), null, false),
        effects: [
          { type: 'verification-completed', strategy: activeStrategy, outcome: 'verified' },
        ],
      }
    }
    if (checkpoint.phase === 'recovery') {
      return {
        state: withCheckpoint(advanced, checkpoint, activeStrategy, true),
        effects: [],
      }
    }
    return {
      state: withCheckpoint(advanced, checkpoint, null, true),
      effects: [
        {
          type: 'verification-completed',
          strategy: activeStrategy,
          outcome: checkpoint.outcome ?? 'inconclusive',
        },
      ],
    }
  }

  const nextStrategy = event.verificationEnabled ? event.nextMutationStrategy : null
  return {
    state: withCheckpoint(
      advanced,
      nextStrategy ? createAgentVerificationCheckpoint() : state.verificationCheckpoint,
      nextStrategy,
      state.verificationStepStarted
    ),
    effects: [],
  }
}
