import { describe, expect, it } from 'vitest'
import {
  createArtifactDocument,
  getArtifactExtension,
  getCurrentArtifactVersion,
  normalizeArtifacts,
  restoreArtifactVersion,
  updateArtifactDocument,
} from './artifactStore'

describe('artifactStore', () => {
  it('creates an artifact with an initial version', () => {
    const artifact = createArtifactDocument({
      title: ' Plan ',
      kind: 'markdown',
      content: '# Plan',
      now: 100,
      sourceMessageId: 'msg-1',
    })

    expect(artifact.title).toBe('Plan')
    expect(artifact.kind).toBe('markdown')
    expect(artifact.currentVersionId).toBe(artifact.versions[0].id)
    expect(getCurrentArtifactVersion(artifact)?.content).toBe('# Plan')
  })

  it('updates an artifact by appending a version', () => {
    const artifact = createArtifactDocument({
      title: 'Widget',
      kind: 'code',
      language: 'typescript',
      content: 'one',
      now: 100,
    })

    const updated = updateArtifactDocument(artifact, {
      content: 'two',
      changeSummary: 'Changed body',
      now: 200,
    })

    expect(updated.versions).toHaveLength(2)
    expect(updated.currentVersionId).toBe(updated.versions[1].id)
    expect(getCurrentArtifactVersion(updated)?.content).toBe('two')
    expect(updated.versions[1].changeSummary).toBe('Changed body')
  })

  it('restores an older version without deleting history', () => {
    const artifact = createArtifactDocument({
      title: 'Doc',
      kind: 'text',
      content: 'one',
      now: 100,
    })
    const updated = updateArtifactDocument(artifact, { content: 'two', now: 200 })
    const restored = restoreArtifactVersion(updated, artifact.currentVersionId, { now: 300 })

    expect(restored.versions).toHaveLength(2)
    expect(restored.currentVersionId).toBe(artifact.currentVersionId)
    expect(getCurrentArtifactVersion(restored)?.content).toBe('one')
  })

  it('normalizes invalid persisted artifacts away', () => {
    const artifact = createArtifactDocument({
      title: 'Valid',
      kind: 'json',
      content: '{}',
    })

    expect(normalizeArtifacts([artifact, { id: 'bad' }])).toEqual([artifact])
  })

  it('selects download extensions by kind and language', () => {
    expect(getArtifactExtension({ kind: 'markdown' })).toBe('md')
    expect(getArtifactExtension({ kind: 'code', language: 'typescript' })).toBe('ts')
    expect(getArtifactExtension({ kind: 'mermaid' })).toBe('mmd')
  })
})

