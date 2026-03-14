import type { ThinkingBlock } from '../../../contexts/ChatHistoryContext'
import type { StreamingPhase } from '../../../contexts/StreamingContext'

export const TOOL_FOLLOW_UP_SPLIT_MARKER = '\n\n[[ZURA_TOOL_FOLLOW_UP_SPLIT]]\n\n'

export interface FollowUpTimelineSnapshot {
  contentLength: number
  completedBlockCount: number
}

interface ShouldCaptureFollowUpSnapshotOptions {
  isStreaming: boolean
  streamPhase?: StreamingPhase
  content: string
  isSearching: boolean
  activeToolCallCount: number
  existingSnapshot?: FollowUpTimelineSnapshot | null
}

export function shouldCaptureFollowUpSnapshot({
  isStreaming,
  streamPhase,
  content,
  isSearching,
  activeToolCallCount,
  existingSnapshot,
}: ShouldCaptureFollowUpSnapshotOptions): boolean {
  if (!isStreaming || existingSnapshot) {
    return false
  }

  if (content.trim().length === 0) {
    return false
  }

  return (
    streamPhase === 'reasoning' ||
    streamPhase === 'searching' ||
    streamPhase === 'tool' ||
    isSearching ||
    activeToolCallCount > 0
  )
}

export function splitMessageTimeline(
  content: string,
  completedBlocks: ThinkingBlock[],
  snapshot?: FollowUpTimelineSnapshot | null
): {
  beforeContent: string
  afterContent: string
  beforeBlocks: ThinkingBlock[]
  afterBlocks: ThinkingBlock[]
} {
  const markerIndex = content.indexOf(TOOL_FOLLOW_UP_SPLIT_MARKER)
  if (markerIndex >= 0) {
    const beforeContent = content.slice(0, markerIndex)
    const afterContent = content.slice(markerIndex + TOOL_FOLLOW_UP_SPLIT_MARKER.length)
    const lastThinkingIndex = completedBlocks.reduce(
      (latestIndex, block, index) => (block.type === 'thinking' ? index : latestIndex),
      -1
    )

    if (lastThinkingIndex > 0) {
      return {
        beforeContent,
        afterContent,
        beforeBlocks: completedBlocks.slice(0, lastThinkingIndex),
        afterBlocks: completedBlocks.slice(lastThinkingIndex),
      }
    }

    return {
      beforeContent,
      afterContent,
      beforeBlocks: completedBlocks,
      afterBlocks: [],
    }
  }

  if (!snapshot) {
    return {
      beforeContent: content,
      afterContent: '',
      beforeBlocks: completedBlocks,
      afterBlocks: [],
    }
  }

  const contentLength = Math.min(Math.max(snapshot.contentLength, 0), content.length)
  const blockCount = Math.min(Math.max(snapshot.completedBlockCount, 0), completedBlocks.length)

  return {
    beforeContent: content.slice(0, contentLength),
    afterContent: content.slice(contentLength),
    beforeBlocks: completedBlocks.slice(0, blockCount),
      afterBlocks: completedBlocks.slice(blockCount),
  }
}

export function removeToolFollowUpSplitMarker(content: string): string {
  return content.split(TOOL_FOLLOW_UP_SPLIT_MARKER).join('')
}
