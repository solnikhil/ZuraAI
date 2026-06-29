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

export interface MessageTimelineSegment {
  blocks: ThinkingBlock[]
  content: string
}

interface TimelineMarkerMatch {
  index: number
  length: number
  blockCount: number | null
}

function findTimelineMarkers(content: string): TimelineMarkerMatch[] {
  const markers: TimelineMarkerMatch[] = []
  const pattern = new RegExp(TOOL_FOLLOW_UP_SPLIT_MARKER_PATTERN.source, 'g')
  let match: RegExpExecArray | null = pattern.exec(content)

  while (match) {
    markers.push({
      index: match.index,
      length: match[0].length,
      blockCount: match[1] !== undefined ? Number.parseInt(match[1], 10) : null,
    })
    match = pattern.exec(content)
  }

  return markers
}

function resolveMarkerBlockEnd(
  blockCount: number | null,
  completedBlocks: ThinkingBlock[],
  blockStart: number
): number {
  if (blockCount !== null && Number.isFinite(blockCount)) {
    return Math.min(Math.max(blockCount, blockStart), completedBlocks.length)
  }

  const lastThinkingIndex = completedBlocks.reduce((latestIndex, block, index) => {
    if (index < blockStart || block.type !== 'thinking') {
      return latestIndex
    }
    return index
  }, -1)

  if (lastThinkingIndex > blockStart) {
    return lastThinkingIndex
  }

  return completedBlocks.length
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

export function buildMessageTimelineSegments(
  content: string,
  completedBlocks: ThinkingBlock[],
  snapshot?: FollowUpTimelineSnapshot | null
): MessageTimelineSegment[] {
  const markers = findTimelineMarkers(content)

  if (markers.length > 0) {
    const segments: MessageTimelineSegment[] = []
    let blockStart = 0
    let contentStart = 0

    for (const marker of markers) {
      const blockEnd = resolveMarkerBlockEnd(marker.blockCount, completedBlocks, blockStart)
      segments.push({
        blocks: completedBlocks.slice(blockStart, blockEnd),
        content: removeToolFollowUpSplitMarker(content.slice(contentStart, marker.index)),
      })
      blockStart = blockEnd
      contentStart = marker.index + marker.length
    }

    segments.push({
      blocks: completedBlocks.slice(blockStart),
      content: removeToolFollowUpSplitMarker(content.slice(contentStart)),
    })

    return segments
  }

  if (!snapshot) {
    return [
      {
        blocks: completedBlocks,
        content: removeToolFollowUpSplitMarker(content),
      },
    ]
  }

  const strippedContent = removeToolFollowUpSplitMarker(content)
  const contentLength = Math.min(Math.max(snapshot.contentLength, 0), strippedContent.length)
  const blockCount = Math.min(Math.max(snapshot.completedBlockCount, 0), completedBlocks.length)

  return [
    {
      blocks: completedBlocks.slice(0, blockCount),
      content: strippedContent.slice(0, contentLength),
    },
    {
      blocks: completedBlocks.slice(blockCount),
      content: strippedContent.slice(contentLength),
    },
  ]
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
  const segments = buildMessageTimelineSegments(content, completedBlocks, snapshot)

  if (segments.length <= 1) {
    const [onlySegment] = segments
    return {
      beforeContent: onlySegment?.content ?? removeToolFollowUpSplitMarker(content),
      afterContent: '',
      beforeBlocks: onlySegment?.blocks ?? completedBlocks,
      afterBlocks: [],
    }
  }

  const mergedAfterContent = segments
    .slice(1)
    .map((segment) => segment.content)
    .join('')

  return {
    beforeContent: segments[0]?.content ?? '',
    afterContent: mergedAfterContent,
    beforeBlocks: segments[0]?.blocks ?? [],
    afterBlocks: segments.slice(1).flatMap((segment) => segment.blocks),
  }
}

export function removeToolFollowUpSplitMarker(content: string): string {
  return content.replace(TOOL_FOLLOW_UP_SPLIT_MARKER_PATTERN, '')
}
