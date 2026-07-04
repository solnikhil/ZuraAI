import { describe, expect, it } from 'vitest'

import { shouldContinueToolResearch, shouldRequestToolFollowUp } from './followUpPolicy'

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

describe('shouldContinueToolResearch', () => {
  it('stops after successful web search results so the next pass synthesizes', () => {
    expect(
      shouldContinueToolResearch([
        {
          toolCall: {
            id: 'tool-1',
            name: 'web_search',
            arguments: { query: 'MrBeast subscribers 2026' },
          },
          result: {
            success: true,
            data: { results: [{ title: 'MrBeast subscriber count' }] },
          },
        },
      ])
    ).toBe(false)
  })

  it('allows another search when the batch returned no usable results', () => {
    expect(
      shouldContinueToolResearch([
        {
          toolCall: {
            id: 'tool-1',
            name: 'web_search',
            arguments: { query: 'specific obscure query' },
          },
          result: {
            success: true,
            data: { results: [] },
          },
        },
      ])
    ).toBe(true)
  })

  it('does not continue after skipped over-budget searches', () => {
    expect(
      shouldContinueToolResearch([
        {
          toolCall: {
            id: 'tool-1',
            name: 'web_search',
            arguments: { query: 'cursor pricing plans' },
          },
          result: {
            success: false,
            error:
              'Skipped web_search call because the per-response search budget has been reached.',
            metadata: {
              origin: 'builtin-main',
              executionDisposition: 'skipped',
              skippedReason: 'budget',
            },
          },
        },
      ])
    ).toBe(false)
  })
})
