import { describe, expect, it } from 'vitest'

import { shouldRequestToolFollowUp } from './followUpPolicy'

describe('shouldRequestToolFollowUp', () => {
  it('keeps the second model pass for web search outputs', () => {
    expect(
      shouldRequestToolFollowUp(
        [
          {
            toolCall: {
              id: 'tool-1',
              name: 'web_search',
              arguments: { query: 'AI news' },
            },
            result: {
              success: true,
              data: { results: [] },
            },
          },
        ],
        [{ role: 'tool', tool_call_id: 'tool-1', content: '{"results":[]}' }]
      )
    ).toBe(true)
  })

  it('keeps the second model pass for regular tool outputs', () => {
    expect(
      shouldRequestToolFollowUp(
        [
          {
            toolCall: {
              id: 'tool-2',
              name: 'web_search',
              arguments: { query: 'zura ai' },
            },
            result: {
              success: true,
              data: { results: [] },
            },
          },
        ],
        [{ role: 'tool', tool_call_id: 'tool-2', content: '{"results":[]}' }]
      )
    ).toBe(true)
  })
})
