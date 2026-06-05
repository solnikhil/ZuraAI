import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildRecentActivityBlock,
  loadRecentActivityBlock,
  RECENT_ACTIVITY_MAX_ITEMS,
} from './buildRecentActivityBlock'
import type { ConversationSummary } from '@/electron/types'

function summary(partial: Partial<ConversationSummary> & { summary: string }): ConversationSummary {
  return {
    sessionId: partial.sessionId ?? Math.random().toString(36).slice(2),
    summary: partial.summary,
    updatedAt: partial.updatedAt ?? Date.UTC(2026, 4, 23),
  }
}

describe('buildRecentActivityBlock', () => {
  it('returns empty string when there are no summaries', () => {
    expect(buildRecentActivityBlock([])).toBe('')
  })

  it('formats summaries as dated bullets under a header', () => {
    const block = buildRecentActivityBlock([
      summary({ summary: 'Discussed Go load balancer', updatedAt: Date.UTC(2026, 4, 23) }),
    ])
    expect(block).toContain('Recent Activity')
    expect(block).toContain('- [2026-05-23] Discussed Go load balancer')
  })

  it('skips blank summaries and caps the item count', () => {
    const many = Array.from({ length: RECENT_ACTIVITY_MAX_ITEMS + 5 }, (_, i) =>
      summary({ summary: `chat ${i}` })
    )
    many.push(summary({ summary: '   ' }))
    const block = buildRecentActivityBlock(many)
    const bullets = block.split('\n').filter((l) => l.startsWith('- '))
    expect(bullets).toHaveLength(RECENT_ACTIVITY_MAX_ITEMS)
  })
})

describe('loadRecentActivityBlock', () => {
  afterEach(() => {
    delete (window as { memory?: unknown }).memory
    vi.clearAllMocks()
  })

  const enabled = { memory: { enabled: true } } as unknown as import('@/skills').SkillsSettings
  const disabled = { memory: { enabled: false } } as unknown as import('@/skills').SkillsSettings

  it('returns empty string when memory skill disabled', async () => {
    expect(await loadRecentActivityBlock({ skills: disabled })).toBe('')
  })

  it('builds a block from bridge summaries', async () => {
    const list = vi.fn().mockResolvedValue([summary({ summary: 'fitness routine chat', updatedAt: 1 })])
    ;(window as unknown as { memory: { summaries: { list: typeof list } } }).memory = {
      summaries: { list },
    }
    const result = await loadRecentActivityBlock({ skills: enabled })
    expect(result).toContain('fitness routine chat')
  })

  it('returns empty string when the bridge throws', async () => {
    const list = vi.fn().mockRejectedValue(new Error('boom'))
    ;(window as unknown as { memory: { summaries: { list: typeof list } } }).memory = {
      summaries: { list },
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await loadRecentActivityBlock({ skills: enabled })).toBe('')
    warn.mockRestore()
  })
})
