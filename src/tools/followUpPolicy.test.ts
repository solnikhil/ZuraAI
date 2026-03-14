import { describe, expect, it } from 'vitest'

import { shouldRequestToolFollowUp } from './followUpPolicy'

describe('shouldRequestToolFollowUp', () => {
  it('keeps the second model pass for website smoke test proposals', () => {
    expect(
      shouldRequestToolFollowUp(
        [
          {
            toolCall: {
              id: 'tool-1',
              name: 'propose_website_smoke_test',
              arguments: {},
            },
            result: {
              success: true,
              data: { status: 'awaiting_approval' },
            },
          },
        ],
        [{ role: 'tool', tool_call_id: 'tool-1', content: '{"status":"awaiting_approval"}' }]
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
