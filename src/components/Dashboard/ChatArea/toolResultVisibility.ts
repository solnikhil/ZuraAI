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

  if (result.toolCall.name.startsWith('computer_')) {
    return true
  }

  // Memory tools render through the inline MemoryUpdatePill on the assistant
  // message. Suppress the generic tool card during streaming and after commit
  // so we don't double-render save/update/delete/search results.
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
