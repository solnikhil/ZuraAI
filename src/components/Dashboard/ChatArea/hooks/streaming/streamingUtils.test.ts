import { describe, expect, it } from 'vitest'

import {
  appendCompletedThinkingBlock,
  buildFinalSynthesisMessages,
  FINAL_SYNTHESIS_PROMPT,
  getThinkingTranscript,
} from './streamingUtils'

describe('streamingUtils final synthesis helpers', () => {
  it('prepends a final synthesis instruction before follow-up messages', () => {
    const messages = buildFinalSynthesisMessages(
      'research context',
      6,
      8,
      [{ role: 'user', content: 'Why is Silicon Valley famous?' }],
      { role: 'assistant', content: 'I will search more.', tool_calls: [] },
      [{ role: 'tool', content: 'search result' }]
    )

    expect(messages[0]).toEqual({ role: 'system', content: FINAL_SYNTHESIS_PROMPT })
    expect(messages.some((message) => message.role === 'tool')).toBe(true)
    expect(messages.some((message) => message.content === 'research context')).toBe(true)
  })

  it('stores each completed reasoning segment as its own thinking block', () => {
    const blocks = appendCompletedThinkingBlock([], 'Initial reasoning', 900)
    const nextBlocks = appendCompletedThinkingBlock(blocks, 'Follow-up reasoning', 1100)

    expect(nextBlocks).toHaveLength(2)
    expect(nextBlocks[0]).toMatchObject({
      type: 'thinking',
      content: 'Initial reasoning',
      duration: 900,
    })
    expect(nextBlocks[1]).toMatchObject({
      type: 'thinking',
      content: 'Follow-up reasoning',
      duration: 1100,
    })
  })

  it('builds fallback reasoning transcripts from completed blocks and the active segment', () => {
    const transcript = getThinkingTranscript(
      [
        { type: 'thinking', content: 'Initial reasoning', duration: 900, timestamp: 1 },
        { type: 'searching', query: 'query', timestamp: 2 },
      ],
      'Follow-up reasoning'
    )

    expect(transcript).toBe('Initial reasoning\n\n---\n\nFollow-up reasoning')
  })
})
