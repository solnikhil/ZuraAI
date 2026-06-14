// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { scoreMemories } from './memoryRetrieval'
import type { Memory } from './memoryStore'

function mem(partial: Partial<Memory> & { id: string; content: string }): Memory {
  return {
    createdAt: 1,
    updatedAt: 1,
    source: 'user',
    scope: { type: 'global' },
    status: 'active',
    ...partial,
  }
}

describe('scoreMemories', () => {
  it('matches across plural/verb-form variation (keyword normalization)', () => {
    const memories = [
      mem({ id: 'a', content: 'The user studies at SRM University' }),
      mem({ id: 'b', content: 'The user enjoys hiking on weekends' }),
    ]
    const results = scoreMemories('what does the user study', memories)
    expect(results[0]?.id).toBe('a')
  })

  it('matches "meetings" against "attended a meeting"', () => {
    const memories = [
      mem({ id: 'a', content: 'attended a meeting with the design team' }),
      mem({ id: 'b', content: 'prefers tea over coffee' }),
    ]
    const results = scoreMemories('what meetings did I attend', memories)
    expect(results.map((m) => m.id)).toContain('a')
    expect(results.map((m) => m.id)).not.toContain('b')
  })

  it('matches common query aliases such as location against living facts', () => {
    const memories = [
      mem({ id: 'a', content: 'The user studies at SRM University' }),
      mem({ id: 'b', content: 'The user lives in Bangalore' }),
    ]
    const results = scoreMemories('what is my current location', memories)
    expect(results[0]?.id).toBe('b')
  })

  it('breaks score ties by recency', () => {
    const memories = [
      mem({ id: 'old', content: 'likes dark mode', updatedAt: 100 }),
      mem({ id: 'new', content: 'likes dark mode', updatedAt: 200 }),
    ]
    const results = scoreMemories('dark mode', memories)
    expect(results[0]?.id).toBe('new')
  })

  it('uses recency and human-authored source as secondary ranking signals', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    try {
      const memories = [
        mem({ id: 'model-old', content: 'prefers concise answers', source: 'model', updatedAt: 1 }),
        mem({
          id: 'user-new',
          content: 'prefers concise answers',
          source: 'user',
          updatedAt: 999_000,
        }),
      ]
      const results = scoreMemories('concise answers', memories)
      expect(results[0]?.id).toBe('user-new')
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('excludes superseded memories by default', () => {
    const memories = [
      mem({ id: 'old', content: 'lives in New York', status: 'superseded' }),
      mem({ id: 'new', content: 'lives in San Francisco' }),
    ]
    const results = scoreMemories('where does the user live city', memories)
    expect(results.map((m) => m.id)).not.toContain('old')
  })

  it('respects the limit and returns [] for empty query', () => {
    const memories = [
      mem({ id: 'a', content: 'loves typescript' }),
      mem({ id: 'b', content: 'loves typescript too' }),
      mem({ id: 'c', content: 'loves typescript also' }),
    ]
    expect(scoreMemories('typescript', memories, { limit: 2 })).toHaveLength(2)
    expect(scoreMemories('   ', memories)).toEqual([])
  })
})
