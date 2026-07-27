export const DEFAULT_AGENT_RUN_LIMITS = Object.freeze({
  maxToolCalls: 120,
  maxMutations: 50,
  maxDurationMs: 30 * 60_000,
})

export interface AgentRunLimits {
  maxToolCalls: number
  maxMutations: number
  maxDurationMs: number
}

export const DEFAULT_AGENT_RUN_REGISTRY_LIMITS = Object.freeze({
  maxActiveRuns: 32,
  maxActiveRunsPerSender: 4,
  maxRetainedTerminalRuns: 256,
  terminalRetentionMs: 15 * 60_000,
})

export interface AgentRunRegistryLimits {
  maxActiveRuns: number
  maxActiveRunsPerSender: number
  maxRetainedTerminalRuns: number
  terminalRetentionMs: number
}

export type AgentRunStopReason =
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'budget_exhausted'
  | 'renderer_destroyed'
  | 'shutdown'

export interface AgentRunRuntimeSnapshot {
  runId: string
  senderWebContentsId: number
  status: 'running' | 'completed' | 'cancelled' | 'failed'
  startedAt: number
  finishedAt?: number
  stopReason?: AgentRunStopReason
  budgetReason?: 'tool_calls' | 'mutations' | 'elapsed_time'
  toolCalls: number
  mutations: number
  activeToolCalls: number
  limits: AgentRunLimits
}

export type BeginAgentToolResult =
  | { ok: true; signal: AbortSignal; snapshot: AgentRunRuntimeSnapshot }
  | {
      ok: false
      reason:
        | 'cancelled'
        | 'tool_budget'
        | 'mutation_budget'
        | 'time_budget'
        | 'global_capacity'
        | 'sender_capacity'
    }

interface AgentRunRuntimeState extends AgentRunRuntimeSnapshot {
  controller: AbortController
  deadlineTimer?: ReturnType<typeof setTimeout>
  terminalExpiryTimer?: ReturnType<typeof setTimeout>
}

const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const MAX_TIMER_DELAY_MS = 2_147_483_647

function copySnapshot(state: AgentRunRuntimeState): AgentRunRuntimeSnapshot {
  const {
    controller: _controller,
    deadlineTimer: _deadlineTimer,
    terminalExpiryTimer: _terminalExpiryTimer,
    ...snapshot
  } = state
  return { ...snapshot, limits: { ...snapshot.limits } }
}

/**
 * Main-owned accounting and cancellation authority for interactive Agent runs.
 * Runs are sender-bound and created lazily on their first privileged tool call.
 */
export class AgentRunRegistry {
  private readonly runs = new Map<string, AgentRunRuntimeState>()
  private readonly registryLimits: AgentRunRegistryLimits

  constructor(
    private readonly limits: AgentRunLimits = DEFAULT_AGENT_RUN_LIMITS,
    private readonly now: () => number = Date.now,
    registryLimits: Partial<AgentRunRegistryLimits> = {}
  ) {
    this.registryLimits = { ...DEFAULT_AGENT_RUN_REGISTRY_LIMITS, ...registryLimits }
    this.assertConfiguration()
  }

  beginTool(
    runId: string,
    senderWebContentsId: number,
    options: { mutating: boolean }
  ): BeginAgentToolResult {
    this.assertIdentity(runId, senderWebContentsId)
    this.pruneExpiredTerminalRuns()
    const existing = this.runs.get(runId)
    if (existing && existing.senderWebContentsId !== senderWebContentsId) {
      throw new Error('Agent run is owned by another renderer.')
    }

    let state = existing
    if (!state) {
      const capacityReason = this.getCapacityFailure(senderWebContentsId)
      if (capacityReason) return { ok: false, reason: capacityReason }
      state = this.createRunningState(runId, senderWebContentsId)
    }

    if (state.status !== 'running' || state.controller.signal.aborted) {
      return { ok: false, reason: this.getStoppedBeginReason(state) }
    }
    if (this.now() - state.startedAt >= state.limits.maxDurationMs) {
      this.stopState(state, 'budget_exhausted', 'elapsed_time')
      return { ok: false, reason: 'time_budget' }
    }
    if (state.toolCalls >= state.limits.maxToolCalls) {
      this.stopState(state, 'budget_exhausted', 'tool_calls')
      return { ok: false, reason: 'tool_budget' }
    }
    if (options.mutating && state.mutations >= state.limits.maxMutations) {
      this.stopState(state, 'budget_exhausted', 'mutations')
      return { ok: false, reason: 'mutation_budget' }
    }

    state.toolCalls += 1
    if (options.mutating) state.mutations += 1
    state.activeToolCalls += 1
    return { ok: true, signal: state.controller.signal, snapshot: copySnapshot(state) }
  }

  completeTool(runId: string, senderWebContentsId: number): void {
    this.assertIdentity(runId, senderWebContentsId)
    const state = this.getOwned(runId, senderWebContentsId)
    if (state) {
      state.activeToolCalls = Math.max(0, state.activeToolCalls - 1)
      if (state.status !== 'running') this.scheduleTerminalExpiry(state)
    }
  }

  finish(
    runId: string,
    senderWebContentsId: number,
    outcome: 'completed' | 'cancelled' | 'failed'
  ): boolean {
    this.assertIdentity(runId, senderWebContentsId)
    const existing = this.runs.get(runId)
    if (existing && existing.senderWebContentsId !== senderWebContentsId) {
      throw new Error('Agent run is owned by another renderer.')
    }
    const state = existing ?? this.createRunningState(runId, senderWebContentsId)
    if (state.status !== 'running') return false
    this.stopState(state, outcome)
    return true
  }

  cancel(runId: string, senderWebContentsId: number): boolean {
    return this.finish(runId, senderWebContentsId, 'cancelled')
  }

  get(runId: string, senderWebContentsId: number): AgentRunRuntimeSnapshot | null {
    this.assertIdentity(runId, senderWebContentsId)
    this.pruneExpiredTerminalRuns()
    const state = this.runs.get(runId)
    if (state && state.senderWebContentsId !== senderWebContentsId) {
      throw new Error('Agent run is owned by another renderer.')
    }
    return state ? copySnapshot(state) : null
  }

  cancelSender(senderWebContentsId: number): number {
    let cancelled = 0
    for (const state of this.runs.values()) {
      if (state.senderWebContentsId !== senderWebContentsId || state.status !== 'running') continue
      this.stopState(state, 'renderer_destroyed')
      cancelled += 1
    }
    return cancelled
  }

  dispose(): void {
    for (const state of this.runs.values()) {
      if (state.status === 'running') this.stopState(state, 'shutdown')
      this.clearStateTimers(state)
    }
    this.runs.clear()
  }

  private createRunningState(runId: string, senderWebContentsId: number): AgentRunRuntimeState {
    const created: AgentRunRuntimeState = {
      runId,
      senderWebContentsId,
      status: 'running',
      startedAt: this.now(),
      toolCalls: 0,
      mutations: 0,
      activeToolCalls: 0,
      limits: { ...this.limits },
      controller: new AbortController(),
    }
    this.runs.set(runId, created)
    created.deadlineTimer = this.createTimer(() => {
      if (this.runs.get(runId) !== created || created.status !== 'running') return
      this.stopState(created, 'budget_exhausted', 'elapsed_time')
    }, created.limits.maxDurationMs)
    return created
  }

  private getCapacityFailure(
    senderWebContentsId: number
  ): 'global_capacity' | 'sender_capacity' | null {
    const occupied = [...this.runs.values()].filter(
      (state) => state.status === 'running' || state.activeToolCalls > 0
    )
    if (occupied.length >= this.registryLimits.maxActiveRuns) return 'global_capacity'
    if (
      occupied.filter((state) => state.senderWebContentsId === senderWebContentsId).length >=
      this.registryLimits.maxActiveRunsPerSender
    ) {
      return 'sender_capacity'
    }
    return null
  }

  private pruneExpiredTerminalRuns(): void {
    if (this.runs.size === 0) return
    const expiryThreshold = this.now() - this.registryLimits.terminalRetentionMs
    for (const state of this.runs.values()) {
      if (
        state.status !== 'running' &&
        state.activeToolCalls === 0 &&
        (state.finishedAt ?? Number.POSITIVE_INFINITY) <= expiryThreshold
      ) {
        this.deleteState(state)
      }
    }
    this.pruneRetainedTerminalRuns()
  }

  private pruneRetainedTerminalRuns(): void {
    const finished = [...this.runs.values()]
      .filter((state) => state.status !== 'running' && state.activeToolCalls === 0)
      .sort((left, right) => (left.finishedAt ?? 0) - (right.finishedAt ?? 0))
    while (finished.length > this.registryLimits.maxRetainedTerminalRuns) {
      const state = finished.shift()
      if (state) this.deleteState(state)
    }
  }

  private getOwned(runId: string, senderWebContentsId: number): AgentRunRuntimeState | null {
    const state = this.runs.get(runId)
    if (!state) return null
    if (state.senderWebContentsId !== senderWebContentsId) {
      throw new Error('Agent run is owned by another renderer.')
    }
    return state
  }

  private stopState(
    state: AgentRunRuntimeState,
    reason: AgentRunStopReason,
    budgetReason?: AgentRunRuntimeSnapshot['budgetReason']
  ): void {
    if (state.status !== 'running') return
    state.stopReason = reason
    state.budgetReason = budgetReason
    state.status =
      reason === 'completed' ? 'completed' : reason === 'failed' ? 'failed' : 'cancelled'
    state.finishedAt = this.now()
    state.controller.abort(reason)
    if (state.deadlineTimer) clearTimeout(state.deadlineTimer)
    state.deadlineTimer = undefined
    this.scheduleTerminalExpiry(state)
    this.pruneRetainedTerminalRuns()
  }

  private scheduleTerminalExpiry(state: AgentRunRuntimeState): void {
    if (state.activeToolCalls > 0 || state.terminalExpiryTimer) return
    const elapsed = this.now() - (state.finishedAt ?? this.now())
    const delay = Math.max(0, this.registryLimits.terminalRetentionMs - elapsed)
    state.terminalExpiryTimer = this.createTimer(() => {
      state.terminalExpiryTimer = undefined
      if (this.runs.get(state.runId) !== state || state.status === 'running') return
      if (state.activeToolCalls > 0) return
      this.deleteState(state)
    }, delay)
  }

  private deleteState(state: AgentRunRuntimeState): void {
    if (this.runs.get(state.runId) !== state) return
    this.clearStateTimers(state)
    this.runs.delete(state.runId)
  }

  private clearStateTimers(state: AgentRunRuntimeState): void {
    if (state.deadlineTimer) clearTimeout(state.deadlineTimer)
    if (state.terminalExpiryTimer) clearTimeout(state.terminalExpiryTimer)
    state.deadlineTimer = undefined
    state.terminalExpiryTimer = undefined
  }

  private createTimer(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(callback, Math.min(delayMs, MAX_TIMER_DELAY_MS))
    timer.unref?.()
    return timer
  }

  private getStoppedBeginReason(
    state: AgentRunRuntimeState
  ):
    | 'cancelled'
    | 'tool_budget'
    | 'mutation_budget'
    | 'time_budget'
    | 'global_capacity'
    | 'sender_capacity' {
    if (state.stopReason !== 'budget_exhausted') return 'cancelled'
    if (state.budgetReason === 'elapsed_time') return 'time_budget'
    if (state.budgetReason === 'tool_calls') return 'tool_budget'
    if (state.budgetReason === 'mutations') return 'mutation_budget'
    return 'cancelled'
  }

  private assertConfiguration(): void {
    const values = [...Object.values(this.limits), ...Object.values(this.registryLimits)]
    if (values.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
      throw new Error('Agent run limits must be positive safe integers.')
    }
  }

  private assertIdentity(runId: string, senderWebContentsId: number): void {
    if (!RUN_ID_PATTERN.test(runId)) throw new Error('Invalid Agent run id.')
    if (!Number.isSafeInteger(senderWebContentsId) || senderWebContentsId <= 0) {
      throw new Error('Invalid Agent run owner.')
    }
  }
}

export const agentRunRegistry = new AgentRunRegistry()
