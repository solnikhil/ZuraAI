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

  it('evicts by createdAt, not updatedAt (editing an old memory does not shield it)', async () => {
    const store = await import('./memoryStore')

    // Drive timestamps from a deterministic monotonic clock instead of real
    // `setTimeout` sleeps. On Windows the timer granularity is ~15.6ms, so the
    // previous `await setTimeout(…, 1)` between each of the MEMORY_CAP + 1 adds
    // actually waited ~15.6ms apiece (~3.1s total) and pushed this test past
    // the 5s per-test timeout under load. A monotonic Date.now() keeps
    // createdAt strictly increasing (the property under test) with zero
    // wall-clock waiting.
    let clock = 1_000
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1))

    try {
      // Create the cap + 1 entries so exactly one will be evicted.
      const created: Array<{ id: string; label: string }> = []
      for (let i = 0; i < store.MEMORY_CAP + 1; i += 1) {
        const memory = await store.addMemoryAsync({ content: `entry ${i}` })
        created.push({ id: memory.id, label: `entry ${i}` })
      }

      // Touch the OLDEST-created entry so its updatedAt becomes the newest.
      // Under updatedAt-based eviction this would shield it; under createdAt-based
      // eviction it should still be the one dropped.
      await store.updateMemoryAsync(created[0].id, { content: 'entry 0 edited' })

      const memories = await store.getAllMemoriesAsync()
      expect(memories.length).toBe(store.MEMORY_CAP)
      // The oldest-created entry was evicted despite being most recently edited.
      expect(memories.find((memory) => memory.id === created[0].id)).toBeUndefined()
      // The second-oldest survived.
      expect(memories.find((memory) => memory.id === created[1].id)).toBeDefined()
    } finally {
      nowSpy.mockRestore()
    }
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

  it('addMemoryWithDedupeAsync adds when no duplicate exists', async () => {
    const store = await import('./memoryStore')
    const result = await store.addMemoryWithDedupeAsync({ content: 'I use Neovim' })
    expect(result.operation).toBe('added')
    expect(result.memory.status).toBe('active')
    expect((await store.getAllMemoriesAsync())).toHaveLength(1)
  })

  it('addMemoryWithDedupeAsync NOOPs on a near-duplicate active memory', async () => {
    const store = await import('./memoryStore')
    const first = await store.addMemoryWithDedupeAsync({ content: 'User prefers dark mode' })
    const dupe = await store.addMemoryWithDedupeAsync({ content: 'user prefers dark mode.' })

    expect(dupe.operation).toBe('noop')
    expect(dupe.memory.id).toBe(first.memory.id)
    expect(await store.getAllMemoriesAsync()).toHaveLength(1)
  })

  it('addMemoryWithDedupeAsync supersedes: keeps both, links them, marks old superseded', async () => {
    const store = await import('./memoryStore')
    const old = await store.addMemoryWithDedupeAsync({ content: 'User lives in New York' })
    const next = await store.addMemoryWithDedupeAsync(
      { content: 'User lives in San Francisco' },
      { supersedesId: old.memory.id }
    )

    expect(next.operation).toBe('superseded')
    expect(next.memory.supersedes).toBe(old.memory.id)

    const all = await store.getAllMemoriesAsync()
    expect(all).toHaveLength(2)
    const oldEntry = all.find((m) => m.id === old.memory.id)
    expect(oldEntry?.status).toBe('superseded')
    expect(oldEntry?.supersededBy).toBe(next.memory.id)

    // excludeSuperseded keeps only the active (new) entry.
    const active = store.excludeSuperseded(all)
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe(next.memory.id)
  })
})
