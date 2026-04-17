import type { ToolCallResult } from '../../../chat/types'

function hasMcpMetadataShape(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') {
    return false
  }

  const record = metadata as Record<string, unknown>
  return (
    record.origin === 'mcp' ||
    typeof record.serverName === 'string' ||
    typeof record.originalToolName === 'string' ||
    typeof record.namespacedToolName === 'string' ||
    typeof record.serverId === 'string'
  )
}

export function shouldHideGenericToolResultCard(result: ToolCallResult): boolean {
  if (result.toolCall.name === 'web_search') {
    return true
  }

  if (/^mcp__/.test(result.toolCall.name)) {
    return true
  }

  return hasMcpMetadataShape(result.result?.metadata)
}

