import {
  BaseApprovalManager,
  type BaseApprovalDecision,
} from '../../utils/baseApprovalManager'

export interface PendingTerminalApproval {
  id: string
  command: string
  cwd: string
  description: string
  requestedAt: number
  expiresAt: number
}

export interface TerminalApprovalDecision extends BaseApprovalDecision {}

interface TerminalApprovalOptions {
  command: string
  cwd: string
  description: string
}

export class TerminalApprovalManager extends BaseApprovalManager<
  PendingTerminalApproval,
  TerminalApprovalDecision,
  TerminalApprovalOptions
> {
  /** Alias for backward compatibility with existing call sites. */
  onPendingApprovalsChange(handler: (requests: PendingTerminalApproval[]) => void): () => void {
    return this.onPendingChange(handler)
  }

  protected buildRequest(
    id: string,
    requestedAt: number,
    expiresAt: number,
    options: TerminalApprovalOptions
  ): PendingTerminalApproval {
    return {
      id,
      command: options.command,
      cwd: options.cwd,
      description: options.description,
      requestedAt,
      expiresAt,
    }
  }
}
