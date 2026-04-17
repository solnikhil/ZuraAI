import { describe, expect, it } from 'vitest'

import type { ThinkingBlock } from '../../../chat/types'
import {
  TOOL_FOLLOW_UP_SPLIT_MARKER,
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
      splitMessageTimeline('Drafted proposal. Here is why.', [initialThinkingBlock, followUpThinkingBlock], {
        contentLength: 'Drafted proposal.'.length,
        completedBlockCount: 1,
      })
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
})
