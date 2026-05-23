import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

import {
  executeMemoryTool,
  isMemoryToolEvent,
  isMemoryToolName,
  MEMORY_TOOL_NAMES,
} from './memoryTools'
import type { Memory } from '@/electron/types'

const memoryAPI = {
  list: vi.fn<(scope?: unknown) => Promise<Memory[]>>(),
  add: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  search: vi.fn(),
  onChanged: vi.fn(() => () => undefined),
}

beforeEach(() => {
  Object.values(memoryAPI).forEach((fn) => {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  })
  ;(globalThis as unknown as { window: { memory: typeof memoryAPI } }).window = { memory: memoryAPI }
})

describe('memoryTools registry', () => {
  it('registers exactly the four memory tools', () => {
    expect(MEMORY_TOOL_NAMES).toEqual([
      'save_memory',
      'update_memory',
      'delete_memory',
      'search_memories',
    ])
    for (const name of MEMORY_TOOL_NAMES) {
      expect(isMemoryToolName(name)).toBe(true)
    }
    expect(isMemoryToolName('web_search')).toBe(false)
  })
})

describe('normalizeMemoryToolCall', () => {
  it('passes through non-memory tools unchanged', async () => {
    const { normalizeMemoryToolCall } = await import('./memoryTools')
    const call = { name: 'web_search', arguments: { query: 'hi' } }
    expect(normalizeMemoryToolCall(call)).toEqual(call)
  })

  it('renames `text` → `content` for save_memory', async () => {
    const { normalizeMemoryToolCall } = await import('./memoryTools')
    const result = normalizeMemoryToolCall({
      name: 'save_memory',
      arguments: { text: 'User studies at SRM IST' },
    })
    expect(result.arguments).toMatchObject({ content: 'User studies at SRM IST' })
  })

  it('renames `fact`, `memory`, `note` → `content`', async () => {
    const { normalizeMemoryToolCall } = await import('./memoryTools')
    expect(
      normalizeMemoryToolCall({ name: 'save_memory', arguments: { fact: 'a' } }).arguments.content
    ).toBe('a')
    expect(
      normalizeMemoryToolCall({ name: 'save_memory', arguments: { memory: 'b' } }).arguments.content
    ).toBe('b')
    expect(
      normalizeMemoryToolCall({ name: 'save_memory', arguments: { note: 'c' } }).arguments.content
    ).toBe('c')
  })

  it('renames `memory_id` / `memoryId` → `id` for update_memory', async () => {
    const { normalizeMemoryToolCall } = await import('./memoryTools')
    expect(
      normalizeMemoryToolCall({
        name: 'update_memory',
        arguments: { memory_id: 'm1', text: 'new' },
      }).arguments
    ).toMatchObject({ id: 'm1', content: 'new' })
  })

  it('renames `q` → `query` for search_memories (and keeps `text` mapped to query, NOT content)', async () => {
    const { normalizeMemoryToolCall } = await import('./memoryTools')
    expect(
      normalizeMemoryToolCall({ name: 'search_memories', arguments: { q: 'hello' } }).arguments.query
    ).toBe('hello')
    // The interesting case: search_memories does NOT have a `content` field —
    // a stray `text` should resolve to `query`, not be left orphaned under
    // `content`.
    const fromText = normalizeMemoryToolCall({
      name: 'search_memories',
      arguments: { text: 'hello' },
    }).arguments
    expect(fromText.query).toBe('hello')
    expect(fromText.content).toBeUndefined()
  })

  it('preserves canonical key when both alias and canonical are present', async () => {
    const { normalizeMemoryToolCall } = await import('./memoryTools')
    const result = normalizeMemoryToolCall({
      name: 'save_memory',
      arguments: { content: 'real', text: 'fake' },
    })
    expect(result.arguments.content).toBe('real')
  })
})

describe('executeMemoryTool', () => {
  it('save_memory returns immediately with optimistic id and fires bridge in background', async () => {
    memoryAPI.add.mockResolvedValue({
      id: 'm1',
      content: 'I love TS',
      createdAt: 1,
      updatedAt: 1,
      source: 'model',
      scope: { type: 'global' },
    } satisfies Memory)

    const result = await executeMemoryTool(
      'save_memory',
      { content: 'I love TS' },
      { sessionId: 'chat-42' }
    )

    // Optimistic write: synthetic success returned without awaiting the bridge.
    expect(result.success).toBe(true)
    expect(isMemoryToolEvent(result.data)).toBe(true)
    expect(result.data).toMatchObject({ kind: 'memory.added', content: 'I love TS' })
    expect((result.data as { id: string }).id).toMatch(/^mem-opt-/)
    expect(result.metadata).toEqual({ origin: 'builtin-renderer' })

    // Bridge call still happens — just fire-and-forget.
    expect(memoryAPI.add).toHaveBeenCalledWith({
      content: 'I love TS',
      source: 'model',
      sessionId: 'chat-42',
    })

    // Flush the background promise so the toast/error handler resolves before
    // the next test runs.
    await Promise.resolve()
    await Promise.resolve()
  })

  it('save_memory rejects empty content without hitting bridge', async () => {
    const result = await executeMemoryTool('save_memory', { content: '   ' })
    expect(result.success).toBe(false)
    expect(memoryAPI.add).not.toHaveBeenCalled()
  })

  it('save_memory does not await the bridge — returns before window.memory.add resolves', async () => {
    let resolveAdd: ((memory: Memory) => void) | null = null
    memoryAPI.add.mockImplementation(
      () =>
        new Promise<Memory>((resolve) => {
          resolveAdd = resolve
        })
    )

    const resultPromise = executeMemoryTool('save_memory', { content: 'durable fact' })
    const result = await resultPromise

    // Bridge is still pending, but the tool already returned a synthetic OK.
    expect(result.success).toBe(true)
    expect((result.data as { id: string }).id).toMatch(/^mem-opt-/)
    expect(resolveAdd).not.toBeNull()

    // Resolve the bridge after the fact — should not throw and should not
    // change the already-returned tool result.
    resolveAdd?.({
      id: 'm-real',
      content: 'durable fact',
      createdAt: 1,
      updatedAt: 1,
      source: 'model',
      scope: { type: 'global' },
    })
    await Promise.resolve()
    await Promise.resolve()
  })

  it('update_memory captures previousContent from current store', async () => {
    memoryAPI.list.mockResolvedValue([
      {
        id: 'm1',
        content: 'old',
        createdAt: 1,
        updatedAt: 1,
        source: 'user',
        scope: { type: 'global' },
      } satisfies Memory,
    ])
    memoryAPI.update.mockResolvedValue({
      id: 'm1',
      content: 'new',
      createdAt: 1,
      updatedAt: 2,
      source: 'user',
      scope: { type: 'global' },
    } satisfies Memory)

    const result = await executeMemoryTool('update_memory', { id: 'm1', content: 'new' })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      kind: 'memory.updated',
      id: 'm1',
      content: 'new',
      previousContent: 'old',
    })
  })

  it('update_memory fails when id is unknown', async () => {
    memoryAPI.list.mockResolvedValue([])
    const result = await executeMemoryTool('update_memory', { id: 'missing', content: 'x' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/No memory with id "missing"/)
  })

  it('delete_memory captures the previous content for the diff event', async () => {
    memoryAPI.list.mockResolvedValue([
      {
        id: 'm1',
        content: 'gone',
        createdAt: 1,
        updatedAt: 1,
        source: 'user',
        scope: { type: 'global' },
      } satisfies Memory,
    ])
    memoryAPI.delete.mockResolvedValue(true)
    const result = await executeMemoryTool('delete_memory', { id: 'm1' })
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      kind: 'memory.deleted',
      id: 'm1',
      previousContent: 'gone',
    })
  })

  it('search_memories caps limit at 20', async () => {
    memoryAPI.search.mockResolvedValue([])
    await executeMemoryTool('search_memories', { query: 'hi', limit: 999 })
    expect(memoryAPI.search).toHaveBeenCalledWith('hi', 20, { type: 'global' })

    await executeMemoryTool('search_memories', { query: 'hi' })
    expect(memoryAPI.search).toHaveBeenLastCalledWith('hi', 5, { type: 'global' })
  })

  it('returns failure when window.memory is missing', async () => {
    ;(globalThis as unknown as { window: Window }).window = {} as Window
    const result = await executeMemoryTool('save_memory', { content: 'x' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/bridge unavailable/i)
  })
})
