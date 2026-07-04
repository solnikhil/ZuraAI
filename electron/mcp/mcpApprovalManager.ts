import { BaseApprovalManager, type ApprovalOutcome } from '../utils/baseApprovalManager'

import type {
  McpApprovalDecision,
  McpApprovalOutcome,
  McpApprovalRequest,
  McpTransportType,
} from '../../src/mcp/types'

type PendingApprovalsHandler = (requests: McpApprovalRequest[]) => void

export interface RequestApprovalOptions {
  serverId: string
  serverName: string
  serverTransport: McpTransportType
  toolName: string
  namespacedToolName: string
  arguments: Record<string, unknown>
}

export interface McpApprovalManagerOptions {
  defaultTimeoutMs?: number
}

export class McpApprovalManager extends BaseApprovalManager<
  McpApprovalRequest,
  McpApprovalDecision,
  RequestApprovalOptions
> {
  constructor(options: McpApprovalManagerOptions = {}) {
    super(options)
  }

  /** Alias for backward compatibility. */
  listPendingApprovals(): McpApprovalRequest[] {
    return this.listPending()
  }

  /** Alias for backward compatibility. */
  onPendingApprovalsChange(handler: PendingApprovalsHandler): () => void {
    return this.onPendingChange(handler)
  }

  rejectRequestsForServer(
    serverId: string,
    outcome: Extract<McpApprovalOutcome, 'cancelled' | 'rejected'> = 'cancelled'
  ): void {
    for (const [requestId, record] of this.iteratePending()) {
      if (record.request.serverId === serverId) {
        this.finishRequest(requestId, outcome)
      }
    }
  }

  protected buildRequest(
    id: string,
    requestedAt: number,
    expiresAt: number,
    options: RequestApprovalOptions
  ): McpApprovalRequest {
    return {
      id,
      serverId: options.serverId,
      serverName: options.serverName,
      serverTransport: options.serverTransport,
      toolName: options.toolName,
      namespacedToolName: options.namespacedToolName,
      arguments: cloneArguments(options.arguments),
      requestedAt,
      expiresAt,
    }
  }

  protected buildDecision(requestId: string, outcome: ApprovalOutcome): McpApprovalDecision {
    return {
      requestId,
      approved: outcome === 'approved',
      resolvedAt: Date.now(),
      outcome,
    }
  }

  protected buildMissingDecision(
    requestId: string,
    _outcome: ApprovalOutcome
  ): McpApprovalDecision {
    throw new Error(`Unknown MCP approval request: ${requestId}`)
  }

  protected override cloneRequest(request: McpApprovalRequest): McpApprovalRequest {
    return {
      ...request,
      arguments: cloneArguments(request.arguments),
    }
  }
}

function cloneArguments(argumentsValue: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(argumentsValue)) as Record<string, unknown>
}
