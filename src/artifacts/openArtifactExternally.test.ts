import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatSession } from '@/chat/types'
import { openArtifactInExternalApp } from './openArtifactExternally'

describe('openArtifactInExternalApp', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('opens live artifact content through the artifacts bridge', async () => {
    const openExternally = vi.fn(async () => ({ ok: true, path: '/tmp/Launch-plan.md' }))
    Object.defineProperty(globalThis.window, 'artifacts', {
      value: { openExternally },
      configurable: true,
    })

    const sessions: ChatSession[] = [
      {
        id: 'session-1',
        title: 'Source chat',
        createdAt: 1,
        updatedAt: 2,
        messages: [],
        artifacts: [
          {
            id: 'artifact-1',
            title: 'Launch plan',
            kind: 'markdown',
            createdAt: 1,
            updatedAt: 2,
            currentVersionId: 'version-1',
            versions: [{ id: 'version-1', content: '# Launch', createdAt: 1 }],
          },
        ],
      },
    ]

    const result = await openArtifactInExternalApp('session-1', 'artifact-1', sessions)

    expect(result.ok).toBe(true)
    expect(openExternally).toHaveBeenCalledWith({
      sessionId: 'session-1',
      artifactId: 'artifact-1',
      title: 'Launch plan',
      kind: 'markdown',
      language: undefined,
      content: '# Launch',
    })
  })
})
