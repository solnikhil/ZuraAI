import type { ToolCallResult } from '../../contexts/ChatHistoryContext'
import type { ToolExecutionMetadata } from '../types'

export interface McpToolMetricsSummary {
  totalExecutions: number
  successCount: number
  failedCount: number
  rejectedCount: number
  timedOutCount: number
  cancelledCount: number
  approvalApprovedCount: number
  approvalRejectedCount: number
  approvalTimedOutCount: number
  approvalCancelledCount: number
}

export function isMcpToolResult(
  toolResult: ToolCallResult
): toolResult is ToolCallResult & { result: { metadata: Extract<ToolExecutionMetadata, { origin: 'mcp' }> } } {
  return toolResult.result.metadata?.origin === 'mcp'
}

export function summarizeMcpToolResults(toolResults: ToolCallResult[]): McpToolMetricsSummary {
  return toolResults.reduce<McpToolMetricsSummary>(
    (summary, toolResult) => {
      if (!isMcpToolResult(toolResult)) {
        return summary
      }

      summary.totalExecutions += 1

      switch (toolResult.result.metadata.outcome) {
        case 'success':
          summary.successCount += 1
          break
        case 'rejected':
          summary.rejectedCount += 1
          summary.failedCount += 1
          break
        case 'timed_out':
          summary.timedOutCount += 1
          summary.failedCount += 1
          break
        case 'cancelled':
          summary.cancelledCount += 1
          summary.failedCount += 1
          break
        default:
          summary.failedCount += 1
          break
      }

      switch (toolResult.result.metadata.approvalState) {
        case 'approved':
          summary.approvalApprovedCount += 1
          break
        case 'rejected':
          summary.approvalRejectedCount += 1
          break
        case 'timed_out':
          summary.approvalTimedOutCount += 1
          break
        case 'cancelled':
          summary.approvalCancelledCount += 1
          break
        default:
          break
      }

      return summary
    },
    {
      totalExecutions: 0,
      successCount: 0,
      failedCount: 0,
      rejectedCount: 0,
      timedOutCount: 0,
      cancelledCount: 0,
      approvalApprovedCount: 0,
      approvalRejectedCount: 0,
      approvalTimedOutCount: 0,
      approvalCancelledCount: 0,
    }
  )
}
