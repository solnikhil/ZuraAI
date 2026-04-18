import type { ThinkingBlock, ToolCallResult } from '../../../chat/types'

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


  if (/^mcp__/.test(result.toolCall.name)) {
    return true
  }

  return hasMcpMetadataShape(result.result?.metadata)
}

function hasCompletedToolThinkingBlock(
  thinkingBlocks: ThinkingBlock[] | undefined,
  toolName: string
): boolean {
  if (!thinkingBlocks || thinkingBlocks.length === 0) {
    return false
  }

  return thinkingBlocks.some(
    (block) => block.type === 'tool' && block.toolName === toolName
  )
}

export function shouldHideMessageToolResultCard(
  result: ToolCallResult,
  thinkingBlocks: ThinkingBlock[] | undefined
): boolean {
  if (shouldHideGenericToolResultCard(result)) {
    return true
  }

  if (
    result.toolCall.name === 'code_execution' &&
    hasCompletedToolThinkingBlock(thinkingBlocks, result.toolCall.name)
  ) {
    return true
  }

  return false
}

