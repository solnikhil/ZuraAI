// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({ userDataPath: '' }))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => electronMock.userDataPath) },
}))

describe('memoryStore', () => {
  beforeEach(async () => {
    vi.resetModules()
    electronMock.userDataPath = await mkdtemp(path.join(os.tmpdir(), 'zura-memory-store-'))
  })

  afterEach(async () => {
    await rm(electronMock.userDataPath, { recursive: true, force: true })
  })

  it('starts empty when no memory-index file exists', async () => {
    const store = await import('./memoryStore')
    expect(await store.getAllMemoriesAsync()).toEqual([])
    expect(existsSync(path.join(electronMock.userDataPath, 'memory-index.json'))).toBe(false)
  })

  it('persists an added memory and returns it on read', async () => {
    const store = await import('./memoryStore')
    const added = await store.addMemoryAsync({ content: 'I prefer TypeScript' })

    expect(added.id).toBeTruthy()
    expect(added.source).toBe('user')
    expect(added.scope).toEqual({ type: 'global' })
    expect(added.createdAt).toBe(added.updatedAt)

    const indexFile = path.join(electronMock.userDataPath, 'memory-index.json')
    expect(existsSync(indexFile)).toBe(true)

    store._resetMemoryStoreCache()
    const memories = await store.getAllMemoriesAsync()
    expect(memories).toHaveLength(1)
    expect(memories[0].content).toBe('I prefer TypeScript')
  })

  it('rejects empty content and content over the length limit', async () => {
    const store = await import('./memoryStore')
    await expect(store.addMemoryAsync({ content: '' })).rejects.toThrow(/empty/i)
    await expect(store.addMemoryAsync({ content: '   ' })).rejects.toThrow(/empty/i)
    const huge = 'a'.repeat(store.MAX_MEMORY_CONTENT_LENGTH + 1)
    await expect(store.addMemoryAsync({ content: huge })).rejects.toThrow(/length/i)
  })

  it('trims whitespace on add', async () => {
    const store = await import('./memoryStore')
    const added = await store.addMemoryAsync({ content: '  hello  ' })
    expect(added.content).toBe('hello')
  })

  it('updates existing memory content and bumps updatedAt', async () => {
    const store = await import('./memoryStore')
    const added = await store.addMemoryAsync({ content: 'old' })
    const originalUpdatedAt = added.updatedAt

    // Force a measurable timestamp delta.
    await new Promise((resolve) => setTimeout(resolve, 5))

    const updated = await store.updateMemoryAsync(added.id, { content: 'new' })
    expect(updated?.content).toBe('new')
    expect(updated?.updatedAt).toBeGreaterThan(originalUpdatedAt)
    expect(updated?.createdAt).toBe(added.createdAt)
  })

  it('returns null when updating a missing memory', async () => {
    const store = await import('./memoryStore')
    expect(await store.updateMemoryAsync('does-not-exist', { content: 'x' })).toBeNull()
  })

  it('deletes memories by id', async () => {
    const store = await import('./memoryStore')
    const a = await store.addMemoryAsync({ content: 'a' })
    await store.addMemoryAsync({ content: 'b' })

    expect(await store.deleteMemoryAsync(a.id)).toBe(true)
    expect(await store.deleteMemoryAsync(a.id)).toBe(false) // already gone

    const remaining = await store.getAllMemoriesAsync()
    expect(remaining.map((memory) => memory.content)).toEqual(['b'])
  })

  it('clears all memories', async () => {
    const store = await import('./memoryStore')
    await store.addMemoryAsync({ content: 'a' })
    await store.addMemoryAsync({ content: 'b' })
    await store.clearAllMemoriesAsync()
    expect(await store.getAllMemoriesAsync()).toEqual([])
  })

  it('enforces the FIFO cap of MEMORY_CAP entries', async () => {
    const store = await import('./memoryStore')
    const overflow = store.MEMORY_CAP + 5

    for (let i = 0; i < overflow; i += 1) {
      await store.addMemoryAsync({ content: `memory ${i}` })
    }

    const memories = await store.getAllMemoriesAsync()
    expect(memories.length).toBe(store.MEMORY_CAP)
    // Oldest five should have been evicted; newest first.
    expect(memories[0].content).toBe(`memory ${overflow - 1}`)
    expect(memories.find((memory) => memory.content === 'memory 0')).toBeUndefined()
  })

  it('filters by scope (global only excludes project-scoped memories)', async () => {
    const store = await import('./memoryStore')
    await store.addMemoryAsync({ content: 'global one' })
    await store.addMemoryAsync({
      content: 'project one',
      scope: { type: 'project', projectId: 'p1' },
    })

    const globalOnly = await store.getAllMemoriesAsync({ type: 'global' })
    expect(globalOnly.map((memory) => memory.content)).toEqual(['global one'])
  })

  it('project scope returns project-specific plus global memories', async () => {
    const store = await import('./memoryStore')
    await store.addMemoryAsync({ content: 'global' })
    await store.addMemoryAsync({
      content: 'p1 only',
      scope: { type: 'project', projectId: 'p1' },
    })
    await store.addMemoryAsync({
      content: 'p2 only',
      scope: { type: 'project', projectId: 'p2' },
    })

    const inProject1 = await store.getAllMemoriesAsync({ type: 'project', projectId: 'p1' })
    expect(inProject1.map((memory) => memory.content).sort()).toEqual(['global', 'p1 only'])
  })

  it('substring search is case-insensitive and respects the limit', async () => {
    const store = await import('./memoryStore')
    await store.addMemoryAsync({ content: 'I love TypeScript' })
    await store.addMemoryAsync({ content: 'I love Python' })
    await store.addMemoryAsync({ content: 'Coffee enjoyer' })

    const results = await store.searchMemoriesAsync('love')
    expect(results).toHaveLength(2)

    const limited = await store.searchMemoriesAsync('LOVE', 1)
    expect(limited).toHaveLength(1)

    expect(await store.searchMemoriesAsync('  ')).toEqual([])
  })

  it('serializes concurrent writes without corruption', async () => {
    const store = await import('./memoryStore')

    await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.addMemoryAsync({ content: `concurrent ${i}` }))
    )

    store._resetMemoryStoreCache()
    const memories = await store.getAllMemoriesAsync()
    expect(memories).toHaveLength(20)

    const indexFile = path.join(electronMock.userDataPath, 'memory-index.json')
    const persisted = JSON.parse(await readFile(indexFile, 'utf8')) as { memories: unknown[] }
    expect(persisted.memories).toHaveLength(20)
  })

  it('drops corrupted entries on load and keeps valid ones', async () => {
    await writeFile(
      path.join(electronMock.userDataPath, 'memory-index.json'),
      JSON.stringify({
        version: 1,
        memories: [
          { id: 'good', content: 'kept', createdAt: 1, updatedAt: 1, source: 'user', scope: { type: 'global' } },
          { id: 'bad' }, // missing required fields → dropped
          null,
        ],
      })
    )

    const store = await import('./memoryStore')
    const memories = await store.getAllMemoriesAsync()
    expect(memories).toHaveLength(1)
    expect(memories[0].id).toBe('good')
  })

  it('preserves source=model and sessionId on add', async () => {
    const store = await import('./memoryStore')
    const memory = await store.addMemoryAsync({
      content: 'AI saved this',
      source: 'model',
      sessionId: 'chat-42',
    })
    expect(memory.source).toBe('model')
    expect(memory.sessionId).toBe('chat-42')
  })

  it('rejects invalid scope on update', async () => {
    const store = await import('./memoryStore')
    const memory = await store.addMemoryAsync({ content: 'x' })
    await expect(
      store.updateMemoryAsync(memory.id, { scope: { type: 'project' } as never })
    ).rejects.toThrow(/scope/i)
  })
})
