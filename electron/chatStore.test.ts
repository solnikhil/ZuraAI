// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  userDataPath: '',
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.userDataPath),
  },
}))

describe('chatStore metadata-first persistence', () => {
  beforeEach(async () => {
    vi.resetModules()
    electronMock.userDataPath = await mkdtemp(path.join(os.tmpdir(), 'zura-chat-store-'))
  })

  afterEach(async () => {
    await rm(electronMock.userDataPath, { recursive: true, force: true })
  })

  it('migrates legacy chat-history.json into metadata and per-session files', async () => {
    const legacySession = {
      id: 'session-1',
      title: 'Legacy chat',
      messages: [{ id: 'm1', role: 'user', content: 'hello', timestamp: 1 }],
      createdAt: 1,
      updatedAt: 2,
    }

    await writeFile(
      path.join(electronMock.userDataPath, 'chat-history.json'),
      JSON.stringify({ sessions: [legacySession], folders: [], version: 2 })
    )

    const chatStore = await import('./chatStore')
    const metadata = await chatStore.getSessionMetadataAsync()

    expect(metadata).toEqual([
      expect.objectContaining({
        id: 'session-1',
        title: 'Legacy chat',
        messageCount: 1,
      }),
    ])
    expect(metadata[0]).not.toHaveProperty('messages')
    expect(existsSync(path.join(electronMock.userDataPath, 'chat-index.json'))).toBe(true)

    const loaded = await chatStore.getSessionAsync('session-1')
    expect(loaded?.messages).toHaveLength(1)
  })

  it('saves a single session without requiring whole-history writes', async () => {
    const chatStore = await import('./chatStore')

    await chatStore.saveSessionAsync({
      id: 'session-2',
      title: 'Split chat',
      messages: [
        { id: 'm1', role: 'user', content: 'one', timestamp: 1 },
        { id: 'm2', role: 'assistant', content: 'two', timestamp: 2 },
      ],
      createdAt: 1,
      updatedAt: 2,
    })

    const metadata = await chatStore.getSessionMetadataAsync()
    expect(metadata).toHaveLength(1)
    expect(metadata[0].messageCount).toBe(2)

    const sessionFile = path.join(electronMock.userDataPath, 'chat-sessions', 'session-2.json')
    expect(JSON.parse(await readFile(sessionFile, 'utf8')).messages).toHaveLength(2)
  })

  it('preserves artifact summaries when saving a lightweight session shell', async () => {
    const chatStore = await import('./chatStore')

    await chatStore.saveSessionAsync({
      id: 'session-artifact',
      title: 'Artifact chat',
      messages: [{ id: 'm1', role: 'user', content: 'one', timestamp: 1 }],
      artifacts: [
        {
          id: 'artifact-1',
          title: 'Persisted artifact',
          kind: 'markdown',
          createdAt: 1,
          updatedAt: 2,
          currentVersionId: 'version-1',
          versions: [{ id: 'version-1', content: '# Saved', createdAt: 1 }],
        },
      ],
      createdAt: 1,
      updatedAt: 2,
    })

    await chatStore.saveSessionAsync({
      id: 'session-artifact',
      title: 'Artifact chat renamed',
      messages: [{ id: 'm1', role: 'user', content: 'one', timestamp: 1 }],
      artifacts: [],
      artifactSummaries: [
        {
          id: 'artifact-1',
          title: 'Persisted artifact',
          kind: 'markdown',
          updatedAt: 2,
          currentVersionId: 'version-1',
          versionCount: 1,
        },
      ],
      createdAt: 1,
      updatedAt: 3,
    })

    const metadata = await chatStore.getSessionMetadataAsync()
    expect(metadata[0]).toEqual(expect.objectContaining({
      id: 'session-artifact',
      title: 'Artifact chat renamed',
      artifactCount: 1,
    }))
    expect(metadata[0].artifactSummaries?.[0]).toEqual(expect.objectContaining({
      id: 'artifact-1',
      title: 'Persisted artifact',
    }))
  })

  it('derives artifact metadata from full artifact documents', async () => {
    const chatStore = await import('./chatStore')

    await chatStore.saveSessionAsync({
      id: 'session-full-artifact',
      title: 'Full artifact chat',
      messages: [],
      artifacts: [
        {
          id: 'artifact-1',
          title: 'Full artifact',
          kind: 'code',
          language: 'typescript',
          createdAt: 1,
          updatedAt: 5,
          currentVersionId: 'version-2',
          versions: [
            { id: 'version-1', content: 'one', createdAt: 1 },
            { id: 'version-2', content: 'two', createdAt: 5 },
          ],
        },
      ],
      createdAt: 1,
      updatedAt: 5,
    })

    const metadata = await chatStore.getSessionMetadataAsync()
    expect(metadata[0].artifactCount).toBe(1)
    expect(metadata[0].artifactSummaries?.[0]).toEqual(expect.objectContaining({
      id: 'artifact-1',
      title: 'Full artifact',
      kind: 'code',
      language: 'typescript',
      currentVersionId: 'version-2',
      versionCount: 2,
    }))
  })
})
