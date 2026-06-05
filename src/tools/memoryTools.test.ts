import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { executeMemoryTool, normalizeMemoryToolCall, isMemoryToolEvent } from './memoryTools'
import type { Memory } from '@/electron/types'

// Keep sonner quiet and side-effect-free in tests.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/**
 * Minimal in-memory fake of the `window.memory` bridge that mimics the
 * main-process store closely enough for tool-level assertions: add() assigns a
 * real-looking UUID and persists, so a chained update()/search() can see it.
 */
function installFakeMemoryBridge(): { store: Memory[] } {
  const store: Memory[] = []
  let counter = 0
  const api = {
    list: vi.fn(async () => [...store]),
    add: vi.fn(async (input: { content: string; source?: 'user' | 'model'; sessionId?: string }) => {
      const now = Date.now()
      const memory: Memory = {
        id: `uuid-${++counter}`,
        content: input.content,
        createdAt: now,
        updatedAt: now,
        source: input.source ?? 'user',
        scope: { type: 'global' },
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      }
      store.unshift(memory)
      return memory
    }),
    update: vi.fn(async (id: string, patch: { content?: string }) => {
      const memory = store.find((m) => m.id === id)
      if (!memory) return null
      if (patch.content !== undefined) memory.content = patch.content
      memory.updatedAt = Date.now()
      return memory
    }),
    delete: vi.fn(async (id: string) => {
      const index = store.findIndex((m) => m.id === id)
      if (index === -1) return false
      store.splice(index, 1)
      return true
    }),
    clear: vi.fn(async () => true),
    search: vi.fn(async (query: string) =>
      store.filter((m) => m.content.toLowerCase().includes(query.toLowerCase()))
    ),
    onChanged: vi.fn(() => () => undefined),
  }
  ;(window as unknown as { memory: typeof api }).memory = api
  return { store }
}

describe('memoryTools', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })
  afterEach(() => {
    delete (window as { memory?: unknown }).memory
    vi.clearAllMocks()
  })

  it('save_memory awaits the write and returns the real persisted id', async () => {
    const { store } = installFakeMemoryBridge()
    const result = await executeMemoryTool('save_memory', { content: 'I study at SRM' })

    expect(result.success).toBe(true)
    expect(isMemoryToolEvent(result.data)).toBe(true)
    const event = result.data as { kind: string; id: string }
    expect(event.kind).toBe('memory.added')
    // The returned id must match the actually persisted entry (no synthetic id).
    expect(store[0].id).toBe(event.id)
    expect(event.id.startsWith('mem-opt-')).toBe(false)
  })

  it('supports chained save -> update by the returned id in the same turn', async () => {
    const { store } = installFakeMemoryBridge()
    const saved = await executeMemoryTool('save_memory', { content: 'lives in NY' })
    const savedId = (saved.data as { id: string }).id

    const updated = await executeMemoryTool('update_memory', {
      id: savedId,
      content: 'lives in SF',
    })

    expect(updated.success).toBe(true)
    expect((updated.data as { kind: string }).kind).toBe('memory.updated')
    expect(store.find((m) => m.id === savedId)?.content).toBe('lives in SF')
  })

  it('fails save_memory with empty content', async () => {
    installFakeMemoryBridge()
    const result = await executeMemoryTool('save_memory', { content: '   ' })
    expect(result.success).toBe(false)
  })

  it('normalizeMemoryToolCall coerces aliases to canonical keys', () => {
    const call = normalizeMemoryToolCall({ name: 'save_memory', arguments: { text: 'hello' } })
    expect(call.arguments.content).toBe('hello')

    const search = normalizeMemoryToolCall({ name: 'search_memories', arguments: { q: 'srm' } })
    expect(search.arguments.query).toBe('srm')
  })
})
