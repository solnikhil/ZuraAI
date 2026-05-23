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

describe('executeMemoryTool', () => {
  it('save_memory persists with source=model and sessionId, returns memory.added event', async () => {
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

    expect(memoryAPI.add).toHaveBeenCalledWith({
      content: 'I love TS',
      source: 'model',
      sessionId: 'chat-42',
    })
    expect(result.success).toBe(true)
    expect(isMemoryToolEvent(result.data)).toBe(true)
    expect(result.data).toMatchObject({ kind: 'memory.added', id: 'm1', content: 'I love TS' })
    expect(result.metadata).toEqual({ origin: 'builtin-renderer' })
  })

  it('save_memory rejects empty content without hitting bridge', async () => {
    const result = await executeMemoryTool('save_memory', { content: '   ' })
    expect(result.success).toBe(false)
    expect(memoryAPI.add).not.toHaveBeenCalled()
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
