import {
  BaseApprovalManager,
  type BaseApprovalDecision,
} from '../../utils/baseApprovalManager'

export interface PendingCodeApproval {
  id: string
  code: string
  language: string
  requestedAt: number
  expiresAt: number
}

export interface CodeApprovalDecision extends BaseApprovalDecision {}

interface CodeApprovalOptions {
  code: string
  language: string
}

export class CodeExecutionApprovalManager extends BaseApprovalManager<
  PendingCodeApproval,
  CodeApprovalDecision,
  CodeApprovalOptions
> {
  /** Alias for backward compatibility with existing call sites. */
  onPendingApprovalsChange(handler: (requests: PendingCodeApproval[]) => void): () => void {
    return this.onPendingChange(handler)
  }

  protected buildRequest(
    id: string,
    requestedAt: number,
    expiresAt: number,
    options: CodeApprovalOptions
  ): PendingCodeApproval {
    return {
      id,
      code: options.code,
      language: options.language,
      requestedAt,
      expiresAt,
    }
  }
}
