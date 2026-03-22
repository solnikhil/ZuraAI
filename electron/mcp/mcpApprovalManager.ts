import { randomUUID } from 'crypto'

import type {
  McpApprovalDecision,
  McpApprovalOutcome,
  McpApprovalRequest,
  McpTransportType,
} from '../../src/mcp/types'

type PendingApprovalsHandler = (requests: McpApprovalRequest[]) => void

interface PendingApprovalRecord {
  request: McpApprovalRequest
  resolve: (decision: McpApprovalDecision) => void
  timeoutId: ReturnType<typeof setTimeout>
}

export interface RequestApprovalOptions {
  serverId: string
  serverName: string
  serverTransport: McpTransportType
  toolName: string
  namespacedToolName: string
  arguments: Record<string, unknown>
  timeoutMs?: number
}

export interface McpApprovalManagerOptions {
  defaultTimeoutMs?: number
}

const DEFAULT_APPROVAL_TIMEOUT_MS = 60_000

export class McpApprovalManager {
  private readonly defaultTimeoutMs: number
  private readonly pendingApprovals = new Map<string, PendingApprovalRecord>()
  private readonly handlers = new Set<PendingApprovalsHandler>()

  constructor(options: McpApprovalManagerOptions = {}) {
    this.defaultTimeoutMs = normalizeTimeout(options.defaultTimeoutMs, DEFAULT_APPROVAL_TIMEOUT_MS)
  }

  listPendingApprovals(): McpApprovalRequest[] {
    return [...this.pendingApprovals.values()]
      .map((record) => cloneApprovalRequest(record.request))
      .sort((left, right) => left.requestedAt - right.requestedAt)
  }

  onPendingApprovalsChange(handler: PendingApprovalsHandler): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  requestApproval(options: RequestApprovalOptions): Promise<McpApprovalDecision> {
    const timeoutMs = normalizeTimeout(options.timeoutMs, this.defaultTimeoutMs)
    const requestedAt = Date.now()
    const request: McpApprovalRequest = {
      id: randomUUID(),
      serverId: options.serverId,
      serverName: options.serverName,
      serverTransport: options.serverTransport,
      toolName: options.toolName,
      namespacedToolName: options.namespacedToolName,
      arguments: cloneArguments(options.arguments),
      requestedAt,
      expiresAt: requestedAt + timeoutMs,
    }

    return new Promise<McpApprovalDecision>((resolve) => {
      const timeoutId = setTimeout(() => {
        this.finishRequest(request.id, 'timed_out')
      }, timeoutMs)

      this.pendingApprovals.set(request.id, {
        request,
        resolve,
        timeoutId,
      })
      this.emitPendingApprovals()
    })
  }

  resolveApproval(requestId: string, approved: boolean): McpApprovalDecision {
    return this.finishRequest(requestId, approved ? 'approved' : 'rejected')
  }

  rejectRequestsForServer(serverId: string, outcome: Extract<McpApprovalOutcome, 'cancelled' | 'rejected'> = 'cancelled'): void {
    for (const [requestId, record] of this.pendingApprovals) {
      if (record.request.serverId === serverId) {
        this.finishRequest(requestId, outcome)
      }
    }
  }

  dispose(): void {
    for (const requestId of [...this.pendingApprovals.keys()]) {
      this.finishRequest(requestId, 'cancelled')
    }
  }

  private finishRequest(requestId: string, outcome: McpApprovalOutcome): McpApprovalDecision {
    const record = this.pendingApprovals.get(requestId)
    if (!record) {
      throw new Error(`Unknown MCP approval request: ${requestId}`)
    }

    clearTimeout(record.timeoutId)
    this.pendingApprovals.delete(requestId)

    const decision: McpApprovalDecision = {
      requestId,
      approved: outcome === 'approved',
      resolvedAt: Date.now(),
      outcome,
    }

    record.resolve(decision)
    this.emitPendingApprovals()
    return decision
  }

  private emitPendingApprovals(): void {
    const requests = this.listPendingApprovals()
    for (const handler of this.handlers) {
      handler(requests)
    }
  }
}

function normalizeTimeout(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(1, Math.round(value))
}

function cloneApprovalRequest(request: McpApprovalRequest): McpApprovalRequest {
  return {
    ...request,
    arguments: cloneArguments(request.arguments),
  }
}

function cloneArguments(argumentsValue: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(argumentsValue)) as Record<string, unknown>
}
