import { describe, expect, it } from 'vitest'

import type { ThinkingBlock } from '../../../chat/types'
import {
  TOOL_FOLLOW_UP_SPLIT_MARKER,
  buildMessageTimelineSegments,
  createToolFollowUpSplitMarker,
  endsWithToolFollowUpSplitMarker,
  removeToolFollowUpSplitMarker,
  shouldCaptureFollowUpSnapshot,
  splitMessageTimeline,
} from './messageTimeline'

const initialThinkingBlock: ThinkingBlock = {
  type: 'thinking',
  content: 'Initial reasoning',
  duration: 1200,
  timestamp: 1,
}

const followUpThinkingBlock: ThinkingBlock = {
  type: 'thinking',
  content: 'Follow-up reasoning',
  duration: 900,
  timestamp: 2,
}

describe('messageTimeline', () => {
  it('captures a follow-up snapshot only after visible content already exists', () => {
    expect(
      shouldCaptureFollowUpSnapshot({
        isStreaming: true,
        streamPhase: 'reasoning',
        content: 'Drafted proposal.',
        isSearching: false,
        activeToolCallCount: 0,
      })
    ).toBe(true)

    expect(
      shouldCaptureFollowUpSnapshot({
        isStreaming: true,
        streamPhase: 'reasoning',
        content: '',
        isSearching: false,
        activeToolCallCount: 0,
      })
    ).toBe(false)

    expect(
      shouldCaptureFollowUpSnapshot({
        isStreaming: true,
        streamPhase: 'answering',
        content: 'Drafted proposal.',
        isSearching: false,
        activeToolCallCount: 0,
      })
    ).toBe(false)
  })

  it('splits completed blocks and content around the follow-up snapshot', () => {
    expect(
      splitMessageTimeline(
        'Drafted proposal. Here is why.',
        [initialThinkingBlock, followUpThinkingBlock],
        {
          contentLength: 'Drafted proposal.'.length,
          completedBlockCount: 1,
        }
      )
    ).toEqual({
      beforeContent: 'Drafted proposal.',
      afterContent: ' Here is why.',
      beforeBlocks: [initialThinkingBlock],
      afterBlocks: [followUpThinkingBlock],
    })
  })

  it('uses the persisted follow-up marker to split content and move the last thought below tools', () => {
    expect(
      splitMessageTimeline(
        `Drafted proposal.${TOOL_FOLLOW_UP_SPLIT_MARKER}Please review assumptions.`,
        [initialThinkingBlock, followUpThinkingBlock]
      )
    ).toEqual({
      beforeContent: 'Drafted proposal.',
      afterContent: 'Please review assumptions.',
      beforeBlocks: [initialThinkingBlock],
      afterBlocks: [followUpThinkingBlock],
    })
  })

  it('uses marker block metadata to keep early visible content above later tool activity', () => {
    const searchBlock: ThinkingBlock = {
      type: 'searching',
      toolName: 'web_search',
      query: 'follow-up search',
      timestamp: 3,
    }
    const content = `Initial visible text.${createToolFollowUpSplitMarker(1)}Final answer.`

    expect(
      splitMessageTimeline(content, [initialThinkingBlock, followUpThinkingBlock, searchBlock])
    ).toEqual({
      beforeContent: 'Initial visible text.',
      afterContent: 'Final answer.',
      beforeBlocks: [initialThinkingBlock],
      afterBlocks: [followUpThinkingBlock, searchBlock],
    })
    expect(
      endsWithToolFollowUpSplitMarker(`Initial visible text.${createToolFollowUpSplitMarker(1)}`)
    ).toBe(true)
  })

  it('removes leaked follow-up markers even when bracket/whitespace shape varies', () => {
    expect(removeToolFollowUpSplitMarker('Before\n\n[[ZURA_TOOL_FOLLOW_UP_SPLIT]]]\n\nAfter')).toBe(
      'BeforeAfter'
    )

    expect(
      splitMessageTimeline('Before\n\n[[ZURA_TOOL_FOLLOW_UP_SPLIT]]]\n\nAfter', [
        initialThinkingBlock,
      ])
    ).toEqual({
      beforeContent: 'Before',
      afterContent: 'After',
      beforeBlocks: [initialThinkingBlock],
      afterBlocks: [],
    })
  })

  it('builds one interleaved segment per follow-up marker', () => {
    const searchBlock: ThinkingBlock = {
      type: 'searching',
      toolName: 'web_search',
      query: 'pricing lookup',
      timestamp: 3,
    }
    const commandBlock: ThinkingBlock = {
      type: 'tool',
      toolName: 'system_shell',
      timestamp: 4,
    }
    const content = [
      'Good call — verify pricing.',
      createToolFollowUpSplitMarker(1),
      'Here is what pricing shows.',
      createToolFollowUpSplitMarker(3),
      'The main log file is application.log.',
    ].join('\n\n')

    expect(
      buildMessageTimelineSegments(content, [
        initialThinkingBlock,
        searchBlock,
        followUpThinkingBlock,
        commandBlock,
      ])
    ).toEqual([
      {
        blocks: [initialThinkingBlock],
        content: 'Good call — verify pricing.',
      },
      {
        blocks: [searchBlock, followUpThinkingBlock],
        content: 'Here is what pricing shows.',
      },
      {
        blocks: [commandBlock],
        content: 'The main log file is application.log.',
      },
    ])
  })

  it('strips residual markers from afterContent when multiple tool follow-up rounds run', () => {
    // Three tool-enabled rounds insert two markers. The split happens on the
    // first marker; the second must not leak into the rendered afterContent.
    const content = [
      'First round answer.',
      TOOL_FOLLOW_UP_SPLIT_MARKER.trim(),
      'Second round answer.',
      TOOL_FOLLOW_UP_SPLIT_MARKER.trim(),
      'Final synthesized answer.',
    ].join('\n\n')

    const result = splitMessageTimeline(content, [initialThinkingBlock, followUpThinkingBlock])

    expect(result.beforeContent).toBe('First round answer.')
    expect(result.afterContent).not.toContain('ZURA_TOOL_FOLLOW_UP_SPLIT')
    expect(result.afterContent).toContain('Second round answer.')
    expect(result.afterContent).toContain('Final synthesized answer.')
  })
})
