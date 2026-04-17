/**
 * Custom comparison functions for MessageRenderer memoization.
 * Used with React.memo() to prevent unnecessary re-renders when
 * parent components re-render with unchanged message props.
 */

import type { MessageRendererProps } from './types'
import type { ThinkingBlock } from '@/chat/types'

function areOptionalRecordsEqual(
  a?: Record<string, unknown>,
  b?: Record<string, unknown>
): boolean {
  if (a === b) return true
  if (!a || !b) return !a && !b
  return JSON.stringify(a) === JSON.stringify(b)
}

function areStringArraysEqual(left?: string[], right?: string[]): boolean {
  if (left === right) return true
  if (!left || !right) return !left && !right
  if (left.length !== right.length) return false

  return left.every((value, index) => value === right[index])
}

function areThinkingBlocksEqual(prevBlocks: ThinkingBlock[], nextBlocks: ThinkingBlock[]): boolean {
  if (prevBlocks === nextBlocks) return true
  if (prevBlocks.length !== nextBlocks.length) return false

  for (let i = 0; i < prevBlocks.length; i++) {
    const prevBlock = prevBlocks[i]
    const nextBlock = nextBlocks[i]

    if (
      prevBlock.type !== nextBlock.type ||
      prevBlock.content !== nextBlock.content ||
      prevBlock.query !== nextBlock.query ||
      prevBlock.duration !== nextBlock.duration ||
      prevBlock.timestamp !== nextBlock.timestamp ||
      !areOptionalRecordsEqual(prevBlock.toolInput, nextBlock.toolInput)
    ) {
      return false
    }

    const prevOutput = prevBlock.toolOutput
    const nextOutput = nextBlock.toolOutput
    if (prevOutput !== nextOutput) {
      if (!prevOutput || !nextOutput) return false
      if (
        prevOutput.success !== nextOutput.success ||
        prevOutput.error !== nextOutput.error ||
        prevOutput.executionTime !== nextOutput.executionTime ||
        JSON.stringify(prevOutput.data) !== JSON.stringify(nextOutput.data)
      ) {
        return false
      }
    }
  }

  return true
}

/**
 * Custom comparison function for MessageRenderer memoization.
 *
 * Performs a focused deep comparison so historical messages stay stable while
 * nearby streaming state changes.
 */
export function areMessagePropsEqual(
  prevProps: MessageRendererProps,
  nextProps: MessageRendererProps
): boolean {
  // Compare isStreaming - this is critical for streaming updates
  if (prevProps.isStreaming !== nextProps.isStreaming) return false
  if (prevProps.streamPhase !== nextProps.streamPhase) return false

  // Compare activeToolCalls (for tool calling animation)
  const prevActive = prevProps.activeToolCalls || []
  const nextActive = nextProps.activeToolCalls || []
  if (prevActive.length !== nextActive.length) return false

  // Compare callback references (these should be stable via useCallback in parent)
  if (prevProps.onCopy !== nextProps.onCopy) return false
  if (prevProps.onRegenerate !== nextProps.onRegenerate) return false

  const prevMsg = prevProps.message
  const nextMsg = nextProps.message

  // Compare message identity
  if (prevMsg.id !== nextMsg.id) return false
  if (prevMsg.role !== nextMsg.role) return false
  if (prevMsg.content !== nextMsg.content) return false
  if (prevMsg.timestamp !== nextMsg.timestamp) return false
  if (prevMsg.model !== nextMsg.model) return false

  // Compare thinking content (for extended thinking models)
  if (prevMsg.thinking !== nextMsg.thinking) return false
  if (prevMsg.thinkingDuration !== nextMsg.thinkingDuration) return false

  // Compare thinking blocks array (by length and content)
  const prevThinkingBlocks = prevMsg.thinkingBlocks || []
  const nextThinkingBlocks = nextMsg.thinkingBlocks || []
  if (!areThinkingBlocksEqual(prevThinkingBlocks, nextThinkingBlocks)) return false

  // Compare research status
  const prevResearch = prevMsg.researchStatus
  const nextResearch = nextMsg.researchStatus
  if (
    prevResearch?.isSearching !== nextResearch?.isSearching ||
    prevResearch?.currentRound !== nextResearch?.currentRound ||
    prevResearch?.maxRounds !== nextResearch?.maxRounds ||
    prevResearch?.currentSearch !== nextResearch?.currentSearch ||
    !areStringArraysEqual(prevResearch?.currentSearches, nextResearch?.currentSearches)
  ) {
    return false
  }

  // Compare response versions (by length and current index)
  const prevVersions = prevMsg.responseVersions || []
  const nextVersions = nextMsg.responseVersions || []
  if (prevVersions.length !== nextVersions.length) return false
  if (prevMsg.currentVersionIndex !== nextMsg.currentVersionIndex) return false

  // Compare research plan and progress
  const prevPlan = prevMsg.researchPlan
  const nextPlan = nextMsg.researchPlan
  if (prevPlan?.topic !== nextPlan?.topic || prevPlan?.steps?.length !== nextPlan?.steps?.length) {
    return false
  }
  const prevProgress = prevMsg.researchProgress
  const nextProgress = nextMsg.researchProgress
  if (
    prevProgress?.currentStep !== nextProgress?.currentStep ||
    prevProgress?.totalSteps !== nextProgress?.totalSteps
  ) {
    return false
  }

  // Compare tool results (by length and key properties)
  const prevToolResults = prevMsg.toolResults || []
  const nextToolResults = nextMsg.toolResults || []
  if (prevToolResults.length !== nextToolResults.length) return false
  for (let i = 0; i < prevToolResults.length; i++) {
    if (
      prevToolResults[i].toolCall.id !== nextToolResults[i].toolCall.id ||
      prevToolResults[i].toolCall.name !== nextToolResults[i].toolCall.name ||
      JSON.stringify(prevToolResults[i].toolCall.arguments) !==
        JSON.stringify(nextToolResults[i].toolCall.arguments) ||
      prevToolResults[i].result.success !== nextToolResults[i].result.success ||
      prevToolResults[i].result.error !== nextToolResults[i].result.error ||
      prevToolResults[i].result.executionTime !== nextToolResults[i].result.executionTime ||
      JSON.stringify(prevToolResults[i].result.metadata) !==
        JSON.stringify(nextToolResults[i].result.metadata) ||
      prevToolResults[i].result.data !== nextToolResults[i].result.data
    ) {
      return false
    }
  }

  // Compare files array (by length and IDs)
  const prevFiles = prevMsg.files || []
  const nextFiles = nextMsg.files || []
  if (prevFiles.length !== nextFiles.length) return false
  for (let i = 0; i < prevFiles.length; i++) {
    if (prevFiles[i].id !== nextFiles[i].id) return false
  }

  // Compare usage stats
  if (
    prevMsg.usage?.inputTokens !== nextMsg.usage?.inputTokens ||
    prevMsg.usage?.outputTokens !== nextMsg.usage?.outputTokens ||
    prevMsg.usage?.totalTokens !== nextMsg.usage?.totalTokens
  ) {
    return false
  }

  // Compare latency
  if (prevMsg.latency !== nextMsg.latency) return false

  // Compare finish reason
  if (prevMsg.finishReason !== nextMsg.finishReason) return false

  // Compare requested max tokens
  if (prevMsg.requestedMaxTokens !== nextMsg.requestedMaxTokens) return false

  // All props are equal - do NOT re-render
  return true
}
