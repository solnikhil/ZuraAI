// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({ userDataPath: '' }))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => electronMock.userDataPath) },
}))

describe('conversationSummaryStore', () => {
  beforeEach(async () => {
    vi.resetModules()
    electronMock.userDataPath = await mkdtemp(path.join(os.tmpdir(), 'zura-summary-store-'))
  })

  afterEach(async () => {
    await rm(electronMock.userDataPath, { recursive: true, force: true })
  })

  it('starts empty', async () => {
    const store = await import('./conversationSummaryStore')
    expect(await store.getAllSummariesAsync()).toEqual([])
  })

  it('upserts and lists newest-first', async () => {
    const store = await import('./conversationSummaryStore')
    await store.upsertSummaryAsync('s1', 'first chat about Go')
    await new Promise((r) => setTimeout(r, 2))
    await store.upsertSummaryAsync('s2', 'second chat about fitness')

    const all = await store.getAllSummariesAsync()
    expect(all.map((s) => s.sessionId)).toEqual(['s2', 's1'])
  })

  it('replaces the summary for the same session (one per session)', async () => {
    const store = await import('./conversationSummaryStore')
    await store.upsertSummaryAsync('s1', 'old summary')
    await store.upsertSummaryAsync('s1', 'new summary')

    const all = await store.getAllSummariesAsync()
    expect(all).toHaveLength(1)
    expect(all[0].summary).toBe('new summary')
  })

  it('enforces the rolling cap', async () => {
    const store = await import('./conversationSummaryStore')
    for (let i = 0; i < store.SUMMARY_CAP + 5; i += 1) {
      await store.upsertSummaryAsync(`s${i}`, `summary ${i}`)
      await new Promise((r) => setTimeout(r, 1))
    }
    const all = await store.getAllSummariesAsync()
    expect(all).toHaveLength(store.SUMMARY_CAP)
    expect(all[0].sessionId).toBe(`s${store.SUMMARY_CAP + 4}`)
    expect(all.find((s) => s.sessionId === 's0')).toBeUndefined()
  })

  it('rejects empty summary and missing sessionId', async () => {
    const store = await import('./conversationSummaryStore')
    await expect(store.upsertSummaryAsync('s1', '   ')).rejects.toThrow(/empty/i)
    await expect(store.upsertSummaryAsync('', 'x')).rejects.toThrow(/sessionId/i)
  })

  it('drops corrupted entries on load', async () => {
    await writeFile(
      path.join(electronMock.userDataPath, 'conversation-summaries.json'),
      JSON.stringify({
        version: 1,
        summaries: [{ sessionId: 'ok', summary: 'kept', updatedAt: 1 }, { sessionId: 'bad' }, null],
      })
    )
    const store = await import('./conversationSummaryStore')
    const all = await store.getAllSummariesAsync()
    expect(all).toHaveLength(1)
    expect(all[0].sessionId).toBe('ok')
  })

  it('serializes concurrent upserts without corruption', async () => {
    const store = await import('./conversationSummaryStore')
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => store.upsertSummaryAsync(`s${i}`, `summary ${i}`))
    )
    store._resetConversationSummaryCache()
    const all = await store.getAllSummariesAsync()
    expect(all).toHaveLength(10)
    const persisted = JSON.parse(
      await readFile(path.join(electronMock.userDataPath, 'conversation-summaries.json'), 'utf8')
    ) as { summaries: unknown[] }
    expect(persisted.summaries).toHaveLength(10)
  })
})
