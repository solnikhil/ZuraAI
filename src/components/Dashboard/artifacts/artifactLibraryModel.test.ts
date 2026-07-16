import { describe, expect, it } from 'vitest'
import { buildArtifactLibrary, filterAndSortArtifacts } from './artifactLibraryModel'

describe('artifactLibraryModel', () => {
  const summary = {
    id: 'artifact-1',
    title: 'Launch plan',
    kind: 'markdown' as const,
    updatedAt: 20,
    currentVersionId: 'version-1',
    versionCount: 2,
  }

  it('prefers full documents over metadata summaries', () => {
    const document = {
      ...summary,
      createdAt: 10,
      versions: [{ id: 'version-1', content: '# Launch', createdAt: 10 }],
    }
    const entries = buildArtifactLibrary(
      [
        {
          id: 'session-1',
          title: 'Chat',
          createdAt: 1,
          updatedAt: 2,
          messages: [],
          artifacts: [document],
        },
      ],
      [
        {
          id: 'session-1',
          title: 'Chat',
          createdAt: 1,
          updatedAt: 2,
          messageCount: 0,
          artifactSummaries: [summary],
        },
      ]
    )

    expect(entries).toHaveLength(1)
    expect(entries[0].document?.versions[0].content).toBe('# Launch')
  })

  it('searches provenance and sorts by name', () => {
    const entries = buildArtifactLibrary(
      [],
      [
        {
          id: 's1',
          title: 'Research chat',
          createdAt: 1,
          updatedAt: 1,
          messageCount: 0,
          artifactSummaries: [summary],
        },
        {
          id: 's2',
          title: 'Other',
          createdAt: 1,
          updatedAt: 1,
          messageCount: 0,
          artifactSummaries: [{ ...summary, id: 'a2', title: 'Alpha' }],
        },
      ]
    )

    expect(
      filterAndSortArtifacts(entries, { filter: 'all', query: 'research', sort: 'name' }).map(
        (entry) => entry.title
      )
    ).toEqual(['Launch plan'])
    expect(
      filterAndSortArtifacts(entries, { filter: 'all', query: '', sort: 'name' }).map(
        (entry) => entry.title
      )
    ).toEqual(['Alpha', 'Launch plan'])
  })
})
