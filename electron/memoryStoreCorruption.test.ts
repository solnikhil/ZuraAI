// @vitest-environment node

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({ userDataPath: '' }))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => electronMock.userDataPath) },
}))

const MEMORY_INDEX = 'memory-index.json'
const SUMMARY_INDEX = 'conversation-summaries.json'

async function indexPath(file: string): Promise<string> {
  return path.join(electronMock.userDataPath, file)
}

async function quarantineFiles(prefix: string): Promise<string[]> {
  const entries = await readdir(electronMock.userDataPath)
  return entries.filter((name) => name.startsWith(`${prefix}.corrupt-`))
}

describe('memory store read-failure handling', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    electronMock.userDataPath = await mkdtemp(path.join(os.tmpdir(), 'zura-memory-corrupt-'))
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(electronMock.userDataPath, { recursive: true, force: true })
  })

  it('treats a missing file as an empty store', async () => {
    const store = await import('./memoryStore')
    expect(await store.getAllMemoriesAsync()).toEqual([])
  })

  it('quarantines invalid JSON instead of overwriting it', async () => {
    await writeFile(await indexPath(MEMORY_INDEX), '{ "memories": [ truncated', 'utf-8')

    const store = await import('./memoryStore')
    expect(await store.getAllMemoriesAsync()).toEqual([])

    const quarantined = await quarantineFiles(MEMORY_INDEX)
    expect(quarantined).toHaveLength(1)
    // The original bytes must survive for diagnosis.
    const preserved = await readFile(path.join(electronMock.userDataPath, quarantined[0]), 'utf-8')
    expect(preserved).toBe('{ "memories": [ truncated')
  })

  it('quarantines a wrong root shape rather than silently treating it as empty', async () => {
    await writeFile(await indexPath(MEMORY_INDEX), JSON.stringify(['not', 'an', 'object']), 'utf-8')

    const store = await import('./memoryStore')
    expect(await store.getAllMemoriesAsync()).toEqual([])
    expect(await quarantineFiles(MEMORY_INDEX)).toHaveLength(1)
  })

  it('quarantines a readable object whose memories field is the wrong type', async () => {
    await writeFile(
      await indexPath(MEMORY_INDEX),
      JSON.stringify({ memories: 'oops', version: 1 }),
      'utf-8'
    )

    const store = await import('./memoryStore')
    expect(await store.getAllMemoriesAsync()).toEqual([])
    expect(await quarantineFiles(MEMORY_INDEX)).toHaveLength(1)
  })

  it('propagates operational I/O errors instead of reporting an empty store', async () => {
    // A directory where the index file is expected produces EISDIR, a stand-in
    // for any operational failure (EACCES, EIO, EBUSY, ...). chmod-based
    // permission tests are unreliable when the suite runs as root.
    await mkdir(await indexPath(MEMORY_INDEX), { recursive: true })

    const store = await import('./memoryStore')
    await expect(store.getAllMemoriesAsync()).rejects.toThrow()
  })

  it('does not let a failed read turn a mutation into total data loss', async () => {
    const file = await indexPath(MEMORY_INDEX)
    await mkdir(file, { recursive: true })

    const store = await import('./memoryStore')

    // Before the fix the failed read produced an empty index, so this add
    // persisted a store containing only the new memory - destroying every
    // existing one.
    await expect(store.addMemoryAsync({ content: 'brand new memory' })).rejects.toThrow()
  })

  it('preserves existing memories across a normal read/write cycle', async () => {
    const store = await import('./memoryStore')
    await store.addMemoryAsync({ content: 'first memory' })
    await store.addMemoryAsync({ content: 'second memory' })

    expect((await store.getAllMemoriesAsync()).map((memory) => memory.content)).toEqual([
      'second memory',
      'first memory',
    ])
    expect(await quarantineFiles(MEMORY_INDEX)).toHaveLength(0)
  })
})

describe('conversation summary store read-failure handling', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    electronMock.userDataPath = await mkdtemp(path.join(os.tmpdir(), 'zura-summary-corrupt-'))
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(electronMock.userDataPath, { recursive: true, force: true })
  })

  it('quarantines invalid JSON instead of overwriting it', async () => {
    await writeFile(await indexPath(SUMMARY_INDEX), 'not json at all', 'utf-8')

    const store = await import('./conversationSummaryStore')
    expect(await store.getAllSummariesAsync()).toEqual([])

    const quarantined = await quarantineFiles(SUMMARY_INDEX)
    expect(quarantined).toHaveLength(1)
    expect(await readFile(path.join(electronMock.userDataPath, quarantined[0]), 'utf-8')).toBe(
      'not json at all'
    )
  })

  it('quarantines a wrong summaries field type', async () => {
    await writeFile(
      await indexPath(SUMMARY_INDEX),
      JSON.stringify({ summaries: { nope: true } }),
      'utf-8'
    )

    const store = await import('./conversationSummaryStore')
    expect(await store.getAllSummariesAsync()).toEqual([])
    expect(await quarantineFiles(SUMMARY_INDEX)).toHaveLength(1)
  })

  it('propagates operational I/O errors instead of reporting an empty store', async () => {
    await mkdir(await indexPath(SUMMARY_INDEX), { recursive: true })

    const store = await import('./conversationSummaryStore')
    await expect(store.getAllSummariesAsync()).rejects.toThrow()
  })

  it('does not let a failed read wipe existing summaries on upsert', async () => {
    await mkdir(await indexPath(SUMMARY_INDEX), { recursive: true })

    const store = await import('./conversationSummaryStore')
    await expect(store.upsertSummaryAsync('s1', 'a new summary')).rejects.toThrow()
  })
})
