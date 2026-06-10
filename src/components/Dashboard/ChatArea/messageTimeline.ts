import type { ThinkingBlock } from '../../../chat/types'
import type { StreamingPhase } from '../../../contexts/StreamingContext'

export const TOOL_FOLLOW_UP_SPLIT_MARKER = '\n\n[[ZURA_TOOL_FOLLOW_UP_SPLIT]]\n\n'
const TOOL_FOLLOW_UP_SPLIT_MARKER_PATTERN =
  /\s*\[\[ZURA_TOOL_FOLLOW_UP_SPLIT(?::blocks=(\d+))?\]\]+\s*/g
const TOOL_FOLLOW_UP_SPLIT_MARKER_AT_END_PATTERN =
  /\s*\[\[ZURA_TOOL_FOLLOW_UP_SPLIT(?::blocks=\d+)?\]\]+\s*$/

export function createToolFollowUpSplitMarker(completedBlockCount?: number): string {
  if (typeof completedBlockCount === 'number' && Number.isFinite(completedBlockCount)) {
    return `\n\n[[ZURA_TOOL_FOLLOW_UP_SPLIT:blocks=${Math.max(0, Math.floor(completedBlockCount))}]]\n\n`
  }

  return TOOL_FOLLOW_UP_SPLIT_MARKER
}

export function endsWithToolFollowUpSplitMarker(content: string): boolean {
  return TOOL_FOLLOW_UP_SPLIT_MARKER_AT_END_PATTERN.test(content)
}

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
  const markerMatch = TOOL_FOLLOW_UP_SPLIT_MARKER_PATTERN.exec(content)
  TOOL_FOLLOW_UP_SPLIT_MARKER_PATTERN.lastIndex = 0
  if (markerMatch) {
    const markerIndex = markerMatch.index
    const markerBlockCount =
      markerMatch[1] !== undefined ? Number.parseInt(markerMatch[1], 10) : null
    const beforeContent = removeToolFollowUpSplitMarker(content.slice(0, markerIndex))
    // Strip any residual markers: with multiple tool follow-up rounds the
    // content holds more than one marker, so everything after the first split
    // still carries the remaining marker(s). They must never reach the renderer.
    const afterContent = removeToolFollowUpSplitMarker(
      content.slice(markerIndex + markerMatch[0].length)
    )
    if (markerBlockCount !== null && Number.isFinite(markerBlockCount)) {
      const blockCount = Math.min(Math.max(markerBlockCount, 0), completedBlocks.length)
      return {
        beforeContent,
        afterContent,
        beforeBlocks: completedBlocks.slice(0, blockCount),
        afterBlocks: completedBlocks.slice(blockCount),
      }
    }

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
  return content.replace(TOOL_FOLLOW_UP_SPLIT_MARKER_PATTERN, '')
}
