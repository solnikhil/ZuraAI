import { randomUUID } from 'crypto'
import type { ComputerActionType } from './types'

export interface PendingComputerAction {
  id: string
  action: ComputerActionType
  args: Record<string, unknown>
  screenshot?: string // base64 of current screen for approval preview
  requestedAt: number
  expiresAt: number
}

export interface ComputerUseApprovalDecision {
  requestId: string
  approved: boolean
  resolvedAt: number
  outcome: 'approved' | 'rejected' | 'timed_out' | 'cancelled'
}

type PendingHandler = (requests: PendingComputerAction[]) => void

interface PendingRecord {
  request: PendingComputerAction
  resolve: (decision: ComputerUseApprovalDecision) => void
  timeoutId: ReturnType<typeof setTimeout>
}

interface RequestApprovalOptions {
  action: ComputerActionType
  args: Record<string, unknown>
  screenshot?: string
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 60_000

export class ComputerUseApprovalManager {
  private readonly defaultTimeoutMs: number
  private readonly pending = new Map<string, PendingRecord>()
  private readonly handlers = new Set<PendingHandler>()

  constructor(options?: { defaultTimeoutMs?: number }) {
    const raw = options?.defaultTimeoutMs
    this.defaultTimeoutMs = typeof raw === 'number' && Number.isFinite(raw) && raw > 0
      ? Math.round(raw)
      : DEFAULT_TIMEOUT_MS
  }

  listPending(): PendingComputerAction[] {
    return [...this.pending.values()]
      .map((r) => ({ ...r.request }))
      .sort((a, b) => a.requestedAt - b.requestedAt)
  }

  onPendingChange(handler: PendingHandler): () => void {
    this.handlers.add(handler)
    return () => { this.handlers.delete(handler) }
  }

  requestApproval(options: RequestApprovalOptions): Promise<ComputerUseApprovalDecision> {
    const timeoutMs = typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? Math.round(options.timeoutMs)
      : this.defaultTimeoutMs
    const requestedAt = Date.now()
    const request: PendingComputerAction = {
      id: randomUUID(),
      action: options.action,
      args: options.args,
      screenshot: options.screenshot,
      requestedAt,
      expiresAt: requestedAt + timeoutMs,
    }

    return new Promise<ComputerUseApprovalDecision>((resolve) => {
      const timeoutId = setTimeout(() => {
        this.finishRequest(request.id, 'timed_out')
      }, timeoutMs)

      this.pending.set(request.id, { request, resolve, timeoutId })
      this.emit()
    })
  }

  resolveApproval(requestId: string, approved: boolean): ComputerUseApprovalDecision {
    return this.finishRequest(requestId, approved ? 'approved' : 'rejected')
  }

  dispose(): void {
    for (const id of [...this.pending.keys()]) {
      this.finishRequest(id, 'cancelled')
    }
  }

  private finishRequest(requestId: string, outcome: ComputerUseApprovalDecision['outcome']): ComputerUseApprovalDecision {
    const record = this.pending.get(requestId)
    if (!record) {
      return { requestId, approved: false, resolvedAt: Date.now(), outcome: 'timed_out' }
    }

    clearTimeout(record.timeoutId)
    this.pending.delete(requestId)

    const decision: ComputerUseApprovalDecision = {
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
