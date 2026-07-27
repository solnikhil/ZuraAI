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

  it('does not lose index entries when different sessions save concurrently', async () => {
    const chatStore = await import('./chatStore')

    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        chatStore.saveSessionAsync({
          id: `concurrent-${index}`,
          title: `Concurrent ${index}`,
          messages: [{ id: `m-${index}`, role: 'user', content: 'hello', timestamp: index }],
          createdAt: index,
          updatedAt: index,
        })
      )
    )

    const metadata = await chatStore.getSessionMetadataAsync()
    expect(metadata.map((session) => session.id).sort()).toEqual(
      Array.from({ length: 12 }, (_, index) => `concurrent-${index}`).sort()
    )
  })

  it('awaits and durably commits renderer-localStorage migration', async () => {
    const chatStore = await import('./chatStore')
    const migrated = await chatStore.migrateFromLocalStorage([
      {
        id: 'renderer-session',
        title: 'Renderer chat',
        messages: [{ id: 'm1', role: 'user', content: 'persist me', timestamp: 1 }],
        createdAt: 1,
        updatedAt: 2,
      },
    ])

    expect(migrated).toBe(true)
    await expect(chatStore.getSessionAsync('renderer-session')).resolves.toEqual(
      expect.objectContaining({
        id: 'renderer-session',
        messages: [expect.objectContaining({ content: 'persist me' })],
      })
    )
    const index = JSON.parse(
      await readFile(path.join(electronMock.userDataPath, 'chat-index.json'), 'utf8')
    )
    expect(index.sessions).toEqual([
      expect.objectContaining({ id: 'renderer-session', title: 'Renderer chat' }),
    ])
  })

  it('does not replace an existing main-owned store during renderer migration', async () => {
    const chatStore = await import('./chatStore')
    await chatStore.saveSessionAsync({
      id: 'main-session',
      title: 'Main chat',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    })

    const migrated = await chatStore.migrateFromLocalStorage([
      {
        id: 'renderer-session',
        title: 'Renderer chat',
        messages: [],
        createdAt: 2,
        updatedAt: 2,
      },
    ])

    expect(migrated).toBe(false)
    await expect(chatStore.getSessionAsync('renderer-session')).resolves.toBeNull()
    expect((await chatStore.getSessionMetadataAsync()).map((session) => session.id)).toEqual([
      'main-session',
    ])
  })

  it('surfaces a corrupt index instead of replacing it with empty state', async () => {
    await writeFile(path.join(electronMock.userDataPath, 'chat-index.json'), '{invalid json')
    const chatStore = await import('./chatStore')

    await expect(chatStore.getSessionMetadataAsync()).rejects.toThrow(
      'Chat index contains invalid JSON'
    )
  })

  it('embeds only compact text previews in index recentMessages (no tool payloads)', async () => {
    const chatStore = await import('./chatStore')
    const hugeImage = `iVBORw0KGgo${'B'.repeat(2000)}`

    await chatStore.saveSessionAsync({
      id: 'session-heavy',
      title: 'Agent chat',
      messages: [
        { id: 'm1', role: 'user', content: 'click the button', timestamp: 1 },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Done clicking.',
          timestamp: 2,
          toolResults: [
            {
              toolCall: { id: 'tc1', name: 'computer_screenshot', arguments: {} },
              result: {
                success: true,
                data: {
                  action: 'screenshot',
                  image: hugeImage,
                  screenWidth: 1280,
                  screenHeight: 720,
                },
              },
            },
          ],
          thinkingBlocks: [{ type: 'thinking', content: 'planning…', timestamp: 2 }],
        },
      ],
      createdAt: 1,
      updatedAt: 2,
    })

    const metadata = await chatStore.getSessionMetadataAsync()
    const recent = metadata[0].recentMessages
    expect(recent).toBeDefined()
    expect(recent!.length).toBe(2)
    expect(recent![1]).toMatchObject({
      id: 'm2',
      role: 'assistant',
      content: 'Done clicking.',
      toolResultCount: 1,
      hasThinking: true,
    })
    expect(recent![1]).not.toHaveProperty('toolResults')
    expect(recent![1]).not.toHaveProperty('thinkingBlocks')
    expect(recent![1]).not.toHaveProperty('image')

    // Session file should externalize the screenshot off the message JSON.
    const sessionFile = path.join(electronMock.userDataPath, 'chat-sessions', 'session-heavy.json')
    const saved = JSON.parse(await readFile(sessionFile, 'utf8'))
    const toolData = saved.messages[1].toolResults[0].result.data
    expect(toolData.image).toBeUndefined()
    expect(typeof toolData.mediaRef).toBe('string')
    expect(toolData.mediaRef.startsWith('tool-media:')).toBe(true)
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
    expect(metadata[0]).toEqual(
      expect.objectContaining({
        id: 'session-artifact',
        title: 'Artifact chat renamed',
        artifactCount: 1,
      })
    )
    expect(metadata[0].artifactSummaries?.[0]).toEqual(
      expect.objectContaining({
        id: 'artifact-1',
        title: 'Persisted artifact',
      })
    )
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
    expect(metadata[0].artifactSummaries?.[0]).toEqual(
      expect.objectContaining({
        id: 'artifact-1',
        title: 'Full artifact',
        kind: 'code',
        language: 'typescript',
        currentVersionId: 'version-2',
        versionCount: 2,
      })
    )
  })
})
