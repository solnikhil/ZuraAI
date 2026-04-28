import { randomUUID } from 'crypto'

export type ApprovalOutcome = 'approved' | 'rejected' | 'timed_out' | 'cancelled'

export interface BaseApprovalDecision {
  requestId: string
  approved: boolean
  resolvedAt: number
  outcome: ApprovalOutcome
}

interface PendingRecord<TRequest, TDecision> {
  request: TRequest
  resolve: (decision: TDecision) => void
  timeoutId: ReturnType<typeof setTimeout>
}

const DEFAULT_TIMEOUT_MS = 60_000

/**
 * Generic approval manager that tracks pending approval requests,
 * auto-rejects on timeout, and notifies subscribers of changes.
 *
 * Subclasses define the request shape and how to build a request from options.
 */
export abstract class BaseApprovalManager<
  TRequest extends { id: string; requestedAt: number; expiresAt: number },
  TDecision extends BaseApprovalDecision,
  TOptions,
> {
  private readonly defaultTimeoutMs: number
  private readonly pending = new Map<string, PendingRecord<TRequest, TDecision>>()
  private readonly handlers = new Set<(requests: TRequest[]) => void>()

  constructor(options?: { defaultTimeoutMs?: number }) {
    const raw = options?.defaultTimeoutMs
    this.defaultTimeoutMs =
      typeof raw === 'number' && Number.isFinite(raw) && raw > 0
        ? Math.round(raw)
        : DEFAULT_TIMEOUT_MS
  }

  listPending(): TRequest[] {
    return [...this.pending.values()]
      .map((r) => this.cloneRequest(r.request))
      .sort((a, b) => a.requestedAt - b.requestedAt)
  }

  onPendingChange(handler: (requests: TRequest[]) => void): () => void {
    this.handlers.add(handler)
    return () => { this.handlers.delete(handler) }
  }

  requestApproval(options: TOptions & { timeoutMs?: number }): Promise<TDecision> {
    const timeoutMs =
      typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? Math.round(options.timeoutMs)
        : this.defaultTimeoutMs
    const requestedAt = Date.now()
    const request = this.buildRequest(randomUUID(), requestedAt, requestedAt + timeoutMs, options)

    return new Promise<TDecision>((resolve) => {
      const timeoutId = setTimeout(() => {
        this.finishRequest(request.id, 'timed_out')
      }, timeoutMs)

      this.pending.set(request.id, { request, resolve, timeoutId })
      this.emit()
    })
  }

  resolveApproval(requestId: string, approved: boolean): TDecision {
    return this.finishRequest(requestId, approved ? 'approved' : 'rejected')
  }

  dispose(): void {
    for (const id of [...this.pending.keys()]) {
      this.finishRequest(id, 'cancelled')
    }
  }

  protected finishRequest(requestId: string, outcome: ApprovalOutcome): TDecision {
    const record = this.pending.get(requestId)
    if (!record) {
      return this.buildMissingDecision(requestId, outcome)
    }

    clearTimeout(record.timeoutId)
    this.pending.delete(requestId)

    const decision = this.buildDecision(requestId, outcome)
    record.resolve(decision)
    this.emit()
    return decision
  }

  protected getPendingRecord(requestId: string): PendingRecord<TRequest, TDecision> | undefined {
    return this.pending.get(requestId)
  }

  protected iteratePending(): IterableIterator<[string, PendingRecord<TRequest, TDecision>]> {
    return this.pending.entries()
  }

  /** Build a domain-specific request from the approval options. */
  protected abstract buildRequest(
    id: string,
    requestedAt: number,
    expiresAt: number,
    options: TOptions
  ): TRequest

  /** Build a decision object for a resolved/timed-out/cancelled request. */
  protected buildDecision(requestId: string, outcome: ApprovalOutcome): TDecision {
    return {
      requestId,
      approved: outcome === 'approved',
      resolvedAt: Date.now(),
      outcome,
    } as TDecision
  }

  /** Build a decision for a requestId that was not found in pending. */
  protected buildMissingDecision(requestId: string, _outcome: ApprovalOutcome): TDecision {
    return {
      requestId,
      approved: false,
      resolvedAt: Date.now(),
      outcome: 'timed_out' as ApprovalOutcome,
    } as TDecision
  }

  /** Clone a request for external consumption (prevent mutation). */
  protected cloneRequest(request: TRequest): TRequest {
    return { ...request }
  }

  private emit(): void {
    const list = this.listPending()
    for (const handler of this.handlers) {
      handler(list)
    }
  }
}
