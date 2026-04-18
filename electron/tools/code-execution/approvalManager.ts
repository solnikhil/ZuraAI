import { randomUUID } from 'crypto'

export interface PendingCodeApproval {
  id: string
  code: string
  language: string
  requestedAt: number
  expiresAt: number
}

export interface CodeApprovalDecision {
  requestId: string
  approved: boolean
  resolvedAt: number
  outcome: 'approved' | 'rejected' | 'timed_out' | 'cancelled'
}

type PendingApprovalsHandler = (requests: PendingCodeApproval[]) => void

interface PendingRecord {
  request: PendingCodeApproval
  resolve: (decision: CodeApprovalDecision) => void
  timeoutId: ReturnType<typeof setTimeout>
}

interface RequestApprovalOptions {
  code: string
  language: string
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 60_000

export class CodeExecutionApprovalManager {
  private readonly defaultTimeoutMs: number
  private readonly pending = new Map<string, PendingRecord>()
  private readonly handlers = new Set<PendingApprovalsHandler>()

  constructor(options?: { defaultTimeoutMs?: number }) {
    const raw = options?.defaultTimeoutMs
    this.defaultTimeoutMs = typeof raw === 'number' && Number.isFinite(raw) && raw > 0
      ? Math.round(raw)
      : DEFAULT_TIMEOUT_MS
  }

  listPending(): PendingCodeApproval[] {
    return [...this.pending.values()]
      .map((r) => ({ ...r.request }))
      .sort((a, b) => a.requestedAt - b.requestedAt)
  }

  onPendingApprovalsChange(handler: PendingApprovalsHandler): () => void {
    this.handlers.add(handler)
    return () => { this.handlers.delete(handler) }
  }

  requestApproval(options: RequestApprovalOptions): Promise<CodeApprovalDecision> {
    const timeoutMs = typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? Math.round(options.timeoutMs)
      : this.defaultTimeoutMs
    const requestedAt = Date.now()
    const request: PendingCodeApproval = {
      id: randomUUID(),
      code: options.code,
      language: options.language,
      requestedAt,
      expiresAt: requestedAt + timeoutMs,
    }

    return new Promise<CodeApprovalDecision>((resolve) => {
      const timeoutId = setTimeout(() => {
        this.finishRequest(request.id, 'timed_out')
      }, timeoutMs)

      this.pending.set(request.id, { request, resolve, timeoutId })
      this.emit()
    })
  }

  resolveApproval(requestId: string, approved: boolean): CodeApprovalDecision {
    return this.finishRequest(requestId, approved ? 'approved' : 'rejected')
  }

  dispose(): void {
    for (const id of [...this.pending.keys()]) {
      this.finishRequest(id, 'cancelled')
    }
  }

  private finishRequest(requestId: string, outcome: CodeApprovalDecision['outcome']): CodeApprovalDecision {
    const record = this.pending.get(requestId)
    if (!record) {
      return {
        requestId,
        approved: false,
        resolvedAt: Date.now(),
        outcome: 'timed_out',
      }
    }

    clearTimeout(record.timeoutId)
    this.pending.delete(requestId)

    const decision: CodeApprovalDecision = {
      requestId,
      approved: outcome === 'approved',
      resolvedAt: Date.now(),
      outcome,
    }

    record.resolve(decision)
    this.emit()
    return decision
  }

  private emit(): void {
    const list = this.listPending()
    for (const handler of this.handlers) {
      handler(list)
    }
  }
}
