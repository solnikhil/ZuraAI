import type { ToolCallResult } from './types'

export function shouldRequestToolFollowUp(
  toolResults: ToolCallResult[],
  formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>
): boolean {
  return formattedResults.length > 0 && toolResults.length > 0
}
