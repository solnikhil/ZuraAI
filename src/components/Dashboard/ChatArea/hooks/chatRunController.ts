export type ChatRunKind = 'send' | 'regenerate'

export type ChatRunPhase =
  | 'idle'
  | 'preparing'
  | 'streaming'
  | 'awaiting_tool'
  | 'executing_tools'
  | 'finalizing'
  | 'cancelling'
  | 'completed'
  | 'cancelled'
  | 'failed'

export type ChatRunOutcome = 'completed' | 'cancelled' | 'failed'

const ACTIVE_PHASES = new Set<ChatRunPhase>([
  'preparing',
  'streaming',
  'awaiting_tool',
  'executing_tools',
])

const ALLOWED_TRANSITIONS: Record<ChatRunPhase, ReadonlySet<ChatRunPhase>> = {
  idle: new Set(['preparing']),
  preparing: new Set(['streaming', 'finalizing', 'cancelling', 'failed']),
  streaming: new Set(['awaiting_tool', 'executing_tools', 'finalizing', 'cancelling', 'failed']),
  awaiting_tool: new Set(['executing_tools', 'streaming', 'finalizing', 'cancelling', 'failed']),
  executing_tools: new Set(['streaming', 'awaiting_tool', 'finalizing', 'cancelling', 'failed']),
  finalizing: new Set(['completed', 'cancelled', 'failed']),
  cancelling: new Set(['finalizing', 'cancelled', 'failed']),
  completed: new Set(),
  cancelled: new Set(),
  failed: new Set(),
}

export interface ChatRunSnapshot {
  id: string
  kind: ChatRunKind
  phase: ChatRunPhase
  outcome?: ChatRunOutcome
  finalized: boolean
  startedAt: number
}

export class ChatRunController {
  readonly id: string
  readonly kind: ChatRunKind
  readonly startedAt: number
  readonly abortController: AbortController

  private currentPhase: ChatRunPhase = 'idle'
  private outcome: ChatRunOutcome | undefined
  private finalized = false

  constructor(kind: ChatRunKind, options: { id?: string; startedAt?: number } = {}) {
    this.id = options.id ?? crypto.randomUUID()
    this.kind = kind
    this.startedAt = options.startedAt ?? performance.now()
    this.abortController = new AbortController()
    this.transition('preparing')
  }

  get phase(): ChatRunPhase {
    return this.currentPhase
  }

  get signal(): AbortSignal {
    return this.abortController.signal
  }

  get isFinalized(): boolean {
    return this.finalized
  }

  get snapshot(): ChatRunSnapshot {
    return {
      id: this.id,
      kind: this.kind,
      phase: this.currentPhase,
      outcome: this.outcome,
      finalized: this.finalized,
      startedAt: this.startedAt,
    }
  }

  transition(next: ChatRunPhase): void {
    if (next === this.currentPhase) return
    if (this.finalized || !ALLOWED_TRANSITIONS[this.currentPhase].has(next)) {
      throw new Error(`Invalid chat run transition: ${this.currentPhase} -> ${next}`)
    }
    this.currentPhase = next
  }

  complete(finalizer: () => void): boolean {
    return this.finalize('completed', finalizer)
  }

  fail(finalizer: () => void): boolean {
    return this.finalize('failed', finalizer)
  }

  cancel(finalizer: () => void): boolean {
    if (this.finalized) return false
    if (ACTIVE_PHASES.has(this.currentPhase)) this.transition('cancelling')
    this.abortController.abort()
    return this.finalize('cancelled', finalizer)
  }

  private finalize(outcome: ChatRunOutcome, finalizer: () => void): boolean {
    if (this.finalized) return false
    this.finalized = true
    this.outcome = outcome

    if (this.currentPhase !== 'finalizing') {
      const canFinalize = ALLOWED_TRANSITIONS[this.currentPhase].has('finalizing')
      if (canFinalize) this.currentPhase = 'finalizing'
    }

    try {
      finalizer()
      this.currentPhase = outcome
    } catch (error) {
      this.outcome = 'failed'
      this.currentPhase = 'failed'
      throw error
    }
    return true
  }
}

export function isChatRunAbort(error: unknown, run: ChatRunController): boolean {
  return (
    run.signal.aborted ||
    (error instanceof Error && (error.name === 'AbortError' || error.name === 'CanceledError'))
  )
}
