import {
  BaseApprovalManager,
  type BaseApprovalDecision,
} from '../../utils/baseApprovalManager'
import type { ComputerActionType } from './types'

export interface PendingComputerAction {
  id: string
  action: ComputerActionType
  args: Record<string, unknown>
  screenshot?: string
  requestedAt: number
  expiresAt: number
}

export interface ComputerUseApprovalDecision extends BaseApprovalDecision {}

interface ComputerUseApprovalOptions {
  action: ComputerActionType
  args: Record<string, unknown>
  screenshot?: string
}

export class ComputerUseApprovalManager extends BaseApprovalManager<
  PendingComputerAction,
  ComputerUseApprovalDecision,
  ComputerUseApprovalOptions
> {
  protected buildRequest(
    id: string,
    requestedAt: number,
    expiresAt: number,
    options: ComputerUseApprovalOptions
  ): PendingComputerAction {
    return {
      id,
      action: options.action,
      args: options.args,
      screenshot: options.screenshot,
      requestedAt,
      expiresAt,
    }
  }
}
