import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeArtifactTool, registerArtifactToolHost } from './artifactTools'

describe('artifactTools', () => {
  afterEach(() => {
    registerArtifactToolHost({
      createArtifact: () => null,
      updateArtifact: () => null,
    })()
  })

  it('creates artifacts through the registered renderer host', async () => {
    const createArtifact = vi.fn(() => ({
      id: 'artifact-1',
      title: 'Spec',
      kind: 'markdown' as const,
      createdAt: 1,
      updatedAt: 1,
      currentVersionId: 'version-1',
      versions: [{ id: 'version-1', content: '# Spec', createdAt: 1 }],
    }))
    const unregister = registerArtifactToolHost({
      createArtifact,
      updateArtifact: () => null,
    })

    const result = await executeArtifactTool(
      'artifact_create',
      {
        title: 'Spec',
        kind: 'markdown',
        content: '# Spec',
      },
      { sessionId: 'session-1', messageId: 'message-1' }
    )

    expect(result.success).toBe(true)
    expect(result.metadata?.origin).toBe('builtin-renderer')
    expect(createArtifact).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        title: 'Spec',
        sourceMessageId: 'message-1',
      })
    )
    unregister()
  })

  it('rejects invalid artifact kinds', async () => {
    const unregister = registerArtifactToolHost({
      createArtifact: () => null,
      updateArtifact: () => null,
    })

    const result = await executeArtifactTool(
      'artifact_create',
      {
        title: 'Spec',
        kind: 'docx',
        content: 'x',
      },
      { sessionId: 'session-1' }
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('kind')
    unregister()
  })
})
