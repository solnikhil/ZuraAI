import { isSkippedBuiltinToolResult, type ToolCallResult } from './types'

export function shouldRequestToolFollowUp(
  toolResults: ToolCallResult[],
  formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>
): boolean {
  return formattedResults.length > 0 && toolResults.length > 0
}

function getWebSearchResultCount(result: ToolCallResult): number | null {
  const data = result.result.data
  if (!data || typeof data !== 'object') return null

  const resultCount = (data as Record<string, unknown>).resultCount
  if (typeof resultCount === 'number' && Number.isFinite(resultCount)) {
    return Math.max(0, resultCount)
  }

  const results = (data as Record<string, unknown>).results
  if (Array.isArray(results)) {
    return results.length
  }

  return null
}

function shouldContinueWebSearch(result: ToolCallResult): boolean {
  if (isSkippedBuiltinToolResult(result.result.metadata)) {
    return false
  }

  if (!result.result.success) {
    return true
  }

  const resultCount = getWebSearchResultCount(result)
  return resultCount !== null && resultCount === 0
}

export function shouldContinueToolResearch(toolResults: ToolCallResult[]): boolean {
  const webSearchResults = toolResults.filter((result) => result.toolCall.name === 'web_search')
  if (webSearchResults.length === 0) {
    return false
  }

  return webSearchResults.some(shouldContinueWebSearch)
}
