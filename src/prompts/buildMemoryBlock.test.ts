import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildMemoryBlock, loadMemoryBlock, MEMORY_BLOCK_TOKEN_BUDGET } from './buildMemoryBlock'
import type { Memory } from '@/electron/types'

const noop = () => undefined

function memory(partial: Partial<Memory> & { content: string; updatedAt?: number }): Memory {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    content: partial.content,
    createdAt: partial.createdAt ?? partial.updatedAt ?? 1,
    updatedAt: partial.updatedAt ?? 1,
    source: partial.source ?? 'user',
    scope: partial.scope ?? { type: 'global' },
    category: partial.category ?? 'context',
    status: partial.status ?? 'active',
    sessionId: partial.sessionId,
  }
}

describe('buildMemoryBlock', () => {
  it('returns empty string for an empty list', () => {
    expect(buildMemoryBlock([])).toBe('')
  })

  it('formats memories as dated bullets oldest-first', () => {
    const block = buildMemoryBlock(
      [
        memory({ content: 'I prefer TypeScript', updatedAt: Date.UTC(2026, 4, 23) }),
        memory({ content: 'I live in Bangalore', updatedAt: Date.UTC(2026, 4, 20) }),
      ],
      { type: 'global' },
      { warn: noop }
    )

    expect(block).toContain('Saved Memories (Model Set Context)')
    const bulletLines = block.split('\n').filter((line) => line.startsWith('- ['))
    expect(bulletLines).toEqual([
      '- [2026-05-20] I live in Bangalore',
      '- [2026-05-23] I prefer TypeScript',
    ])
  })

  it('filters project-scoped memories out when scope is global', () => {
    const block = buildMemoryBlock(
      [
        memory({ content: 'global one' }),
        memory({ content: 'project one', scope: { type: 'project', projectId: 'p1' } }),
      ],
      { type: 'global' },
      { warn: noop }
    )
    expect(block).toContain('global one')
    expect(block).not.toContain('project one')
  })

  it('returns project + global entries when scope is project', () => {
    const block = buildMemoryBlock(
      [
        memory({ content: 'global one' }),
        memory({ content: 'p1 only', scope: { type: 'project', projectId: 'p1' } }),
        memory({ content: 'p2 only', scope: { type: 'project', projectId: 'p2' } }),
      ],
      { type: 'project', projectId: 'p1' },
      { warn: noop }
    )
    expect(block).toContain('global one')
    expect(block).toContain('p1 only')
    expect(block).not.toContain('p2 only')
  })

  it('drops oldest memories when token budget is exceeded', () => {
    const longContent = 'lorem ipsum '.repeat(20)
    const memories: Memory[] = []
    for (let i = 0; i < 10; i += 1) {
      memories.push(memory({ content: `${longContent} entry ${i}`, updatedAt: i + 1 }))
    }

    const warn = vi.fn()
    const block = buildMemoryBlock(memories, { type: 'global' }, { tokenBudget: 400, warn })

    // Newest must survive; oldest must be dropped.
    expect(block).toContain('entry 9')
    expect(block).not.toContain('entry 0')
    expect(warn).toHaveBeenCalled()
  })

  it('returns empty string when only blank-content entries exist', () => {
    expect(
      buildMemoryBlock(
        [memory({ content: '   ' }), memory({ content: '' })],
        { type: 'global' },
        { warn: noop }
      )
    ).toBe('')
  })

  it('honours the default budget of MEMORY_BLOCK_TOKEN_BUDGET', () => {
    expect(MEMORY_BLOCK_TOKEN_BUDGET).toBeGreaterThan(500)
    const tiny = memory({ content: 'small fact' })
    expect(buildMemoryBlock([tiny], { type: 'global' }, { warn: noop })).toContain('small fact')
  })

  describe('memory instruction', () => {
    it('appends the passive memory instruction when memories exist', () => {
      const block = buildMemoryBlock(
        [memory({ content: 'I prefer dark mode' })],
        { type: 'global' },
        { warn: noop }
      )
      expect(block).toContain('I prefer dark mode')
      expect(block).toContain('Saved Memories')
      // Passive guidance — never nudges the model to call removed memory tools.
      expect(block).not.toContain('save_memory')
      expect(block).toMatch(/personalize/i)
    })

    it('returns empty string when the list is empty', () => {
      const block = buildMemoryBlock([], { type: 'global' }, { warn: noop })
      expect(block).toBe('')
    })

    it('honours a custom instruction override', () => {
      const block = buildMemoryBlock(
        [memory({ content: 'fact' })],
        { type: 'global' },
        { warn: noop, instruction: 'CUSTOM INSTRUCTION' }
      )
      expect(block).toContain('CUSTOM INSTRUCTION')
    })
  })
})

describe('loadMemoryBlock', () => {
  const originalWindow = globalThis.window

  afterEach(() => {
    if (originalWindow) {
      globalThis.window = originalWindow
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  })

  const enabledSkills = {
    memory: { enabled: true },
  } as unknown as import('@/skills').SkillsSettings
  const disabledSkills = {
    memory: { enabled: false },
  } as unknown as import('@/skills').SkillsSettings

  it('returns empty string when the Memory skill is disabled', async () => {
    const result = await loadMemoryBlock({ skills: disabledSkills })
    expect(result).toBe('')
  })

  it('returns empty string when window.memory bridge is missing', async () => {
    ;(globalThis as unknown as { window: Window }).window = {} as Window
    const result = await loadMemoryBlock({ skills: enabledSkills })
    expect(result).toBe('')
  })

  it('returns formatted block when bridge resolves memories', async () => {
    const list = vi
      .fn()
      .mockResolvedValue([memory({ content: 'remember me', updatedAt: Date.UTC(2026, 4, 23) })])
    ;(globalThis as unknown as { window: { memory: { list: typeof list } } }).window = {
      memory: { list },
    }

    const result = await loadMemoryBlock({ skills: enabledSkills })
    expect(list).toHaveBeenCalledWith({ type: 'global' })
    expect(result).toContain('remember me')
  })

  it('returns empty string when bridge throws', async () => {
    const list = vi.fn().mockRejectedValue(new Error('boom'))
    ;(globalThis as unknown as { window: { memory: { list: typeof list } } }).window = {
      memory: { list },
    }

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = await loadMemoryBlock({ skills: enabledSkills })
    expect(result).toBe('')
    warn.mockRestore()
  })

  it('always includes the passive memory instruction when the Memory skill is enabled', async () => {
    const list = vi.fn().mockResolvedValue([memory({ content: 'fact', updatedAt: 1 })])
    ;(globalThis as unknown as { window: { memory: { list: typeof list } } }).window = {
      memory: { list },
    }

    const result = await loadMemoryBlock({ skills: enabledSkills })
    expect(result).toContain('fact')
    expect(result).toMatch(/personalize/i)
    expect(result).not.toContain('save_memory')
  })

  it('uses a custom memoryPrompt override when provided', async () => {
    const list = vi.fn().mockResolvedValue([memory({ content: 'fact', updatedAt: 1 })])
    ;(globalThis as unknown as { window: { memory: { list: typeof list } } }).window = {
      memory: { list },
    }

    const result = await loadMemoryBlock({
      skills: enabledSkills,
      memoryPrompt: 'CUSTOM INSTRUCTION',
    })
    expect(result).toContain('CUSTOM INSTRUCTION')
    expect(result).not.toContain('save_memory')
  })

  it('retrieves top-K via search when a user message is provided', async () => {
    const search = vi.fn().mockResolvedValue([memory({ content: 'uses Neovim', updatedAt: 5 })])
    const list = vi.fn().mockResolvedValue([])
    ;(
      globalThis as unknown as {
        window: { memory: { search: typeof search; list: typeof list } }
      }
    ).window = { memory: { search, list } }

    const result = await loadMemoryBlock(
      { skills: enabledSkills },
      { type: 'global' },
      { userMessage: 'what editor do I use', limit: 8 }
    )
    expect(search).toHaveBeenCalledWith('what editor do I use', 8, { type: 'global' })
    expect(result).toContain('uses Neovim')
  })

  it('does not inject unrelated recent memories when search returns no matches', async () => {
    const search = vi.fn().mockResolvedValue([])
    const list = vi.fn().mockResolvedValue([memory({ content: 'recent fact', updatedAt: 9 })])
    ;(
      globalThis as unknown as {
        window: { memory: { search: typeof search; list: typeof list } }
      }
    ).window = { memory: { search, list } }

    const result = await loadMemoryBlock(
      { skills: enabledSkills },
      { type: 'global' },
      { userMessage: 'unrelated query' }
    )
    expect(list).not.toHaveBeenCalled()
    expect(result).not.toContain('recent fact')
    // No matches → nothing to inject (no fallback to unrelated recent memories).
    expect(result).toBe('')
  })

  it('injects memories regardless of the auto-manage sub-toggle', async () => {
    const list = vi
      .fn()
      .mockResolvedValue([memory({ content: 'lives in Bangalore', updatedAt: 3 })])
    ;(globalThis as unknown as { window: { memory: { list: typeof list } } }).window = {
      memory: { list },
    }
    const manualOnly = {
      memory: { enabled: true, config: { autoManage: false } },
    } as unknown as import('@/skills').SkillsSettings

    const result = await loadMemoryBlock({ skills: manualOnly })
    expect(result).toContain('lives in Bangalore')
    expect(result).not.toContain('save_memory')
  })

  it('excludes superseded memories from the injected block', () => {
    const block = buildMemoryBlock(
      [
        memory({ content: 'lives in New York', status: 'superseded' }),
        memory({ content: 'lives in San Francisco' }),
      ],
      { type: 'global' },
      { warn: noop }
    )
    expect(block).toContain('San Francisco')
    expect(block).not.toContain('New York')
  })
})
