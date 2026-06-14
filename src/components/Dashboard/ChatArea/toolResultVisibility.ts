import type { ThinkingBlock, ToolCallResult } from '../../../chat/types'
import { MEMORY_TOOL_NAMES } from '../../../tools/memoryTools'

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

  if (result.toolCall.name === 'code_execution') {
    return true
  }

  if (result.toolCall.name === 'system_shell') {
    return true
  }

  if (result.toolCall.name.startsWith('computer_')) {
    return true
  }

  // Legacy in-conversation memory tool results (from older chat sessions, when
  // save/update/delete/search_memories were model-callable). The tools were
  // removed; suppress their generic cards so old histories don't render a
  // stray, unsupported tool entry.
  if ((MEMORY_TOOL_NAMES as readonly string[]).includes(result.toolCall.name)) {
    return true
  }


  if (/^mcp__/.test(result.toolCall.name)) {
    return true
  }

  return hasMcpMetadataShape(result.result?.metadata)
}

export function shouldHideMessageToolResultCard(
  result: ToolCallResult,
  _thinkingBlocks: ThinkingBlock[] | undefined
): boolean {
  return shouldHideGenericToolResultCard(result)
}
