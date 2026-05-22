import { describe, expect, it } from 'vitest'

import { buildOptimizedContext, buildOptimizedContextWithTrace } from './tokenUtils'

describe('buildOptimizedContext', () => {
  it('keeps long DeepSeek history stable instead of falling back to the tiny default window', () => {
    const longAssistantEssay = 'DeepSeek cached paragraph. '.repeat(3600)
    const history = [
      { role: 'user', content: 'Write a long essay about AI.' },
      { role: 'assistant', content: longAssistantEssay },
      { role: 'user', content: 'Follow-up 1.' },
      { role: 'assistant', content: 'Short answer 1.' },
      { role: 'user', content: 'Follow-up 2.' },
      { role: 'assistant', content: 'Short answer 2.' },
      { role: 'user', content: 'Follow-up 3.' },
      { role: 'assistant', content: 'Short answer 3.' },
    ]

    const messages = buildOptimizedContext(
      history,
      { role: 'user', content: 'Follow-up 4: make it sharper.' },
      'You are ZuraAI.',
      'deepseek-v4-pro'
    )

    expect(messages).toEqual([
      { role: 'system', content: 'You are ZuraAI.' },
      ...history,
      { role: 'user', content: 'Follow-up 4: make it sharper.' },
    ])
  })

  it('returns trace details when no truncation is needed', () => {
    const result = buildOptimizedContextWithTrace(
      [{ id: 'm1', role: 'user', content: 'hello' }],
      { id: 'm2', role: 'user', content: 'follow up' },
      'You are ZuraAI.',
      'deepseek-v4-pro'
    )

    expect(result.trace.wasTruncated).toBe(false)
    expect(result.trace.insertedSummary).toBe(false)
    expect(result.trace.keptMessageIds).toEqual(['m1', 'm2'])
    expect(result.trace.droppedMessageIds).toEqual([])
  })

  it('records kept and dropped message ids when truncating', () => {
    const history = Array.from({ length: 10 }, (_, index) => ({
      id: `m${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message ${index} ${'x'.repeat(5000)}`,
    }))

    const result = buildOptimizedContextWithTrace(
      history,
      { id: 'new-user', role: 'user', content: 'latest' },
      'You are ZuraAI.',
      'tiny-default-model'
    )

    expect(result.trace.wasTruncated).toBe(true)
    expect(result.trace.insertedSummary).toBe(true)
    expect(result.trace.keptMessageIds).toContain('new-user')
    expect(result.trace.droppedMessageIds?.length).toBeGreaterThan(0)
  })
})
