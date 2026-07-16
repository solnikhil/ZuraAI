import type { ArtifactDocument, ArtifactKind, ArtifactSummary } from '@/artifacts/artifactTypes'
import type { ChatSession, ChatSessionMetadata } from '@/chat/types'

export type ArtifactFilter = 'all' | ArtifactKind
export type ArtifactSort = 'updated' | 'name' | 'type'

export interface ArtifactLibraryEntry {
  key: string
  sessionId: string
  sessionTitle: string
  id: string
  title: string
  kind: ArtifactKind
  language?: string
  createdAt?: number
  updatedAt: number
  currentVersionId: string
  versionCount: number
  document?: ArtifactDocument
}

function fromDocument(
  sessionId: string,
  sessionTitle: string,
  artifact: ArtifactDocument
): ArtifactLibraryEntry {
  return {
    key: `${sessionId}:${artifact.id}`,
    sessionId,
    sessionTitle,
    id: artifact.id,
    title: artifact.title,
    kind: artifact.kind,
    language: artifact.language,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    currentVersionId: artifact.currentVersionId,
    versionCount: artifact.versions.length,
    document: artifact,
  }
}

function fromSummary(
  sessionId: string,
  sessionTitle: string,
  summary: ArtifactSummary
): ArtifactLibraryEntry {
  return {
    key: `${sessionId}:${summary.id}`,
    sessionId,
    sessionTitle,
    id: summary.id,
    title: summary.title,
    kind: summary.kind,
    language: summary.language,
    updatedAt: summary.updatedAt,
    currentVersionId: summary.currentVersionId,
    versionCount: summary.versionCount,
  }
}

export function buildArtifactLibrary(
  sessions: ChatSession[],
  metadata: ChatSessionMetadata[],
  resolvedDocuments: ReadonlyMap<string, ArtifactDocument> = new Map()
): ArtifactLibraryEntry[] {
  const entries = new Map<string, ArtifactLibraryEntry>()

  for (const session of sessions) {
    const documents = session.artifacts ?? []
    if (documents.length > 0) {
      for (const artifact of documents) {
        const entry = fromDocument(session.id, session.title, artifact)
        entries.set(entry.key, entry)
      }
      continue
    }

    for (const summary of session.artifactSummaries ?? []) {
      const entry = fromSummary(session.id, session.title, summary)
      entries.set(entry.key, entry)
    }
  }

  for (const session of metadata) {
    for (const summary of session.artifactSummaries ?? []) {
      const entry = fromSummary(session.id, session.title, summary)
      if (!entries.has(entry.key)) entries.set(entry.key, entry)
    }
  }

  for (const [key, document] of resolvedDocuments) {
    const existing = entries.get(key)
    if (existing)
      entries.set(key, fromDocument(existing.sessionId, existing.sessionTitle, document))
  }

  return [...entries.values()]
}

export function filterAndSortArtifacts(
  entries: ArtifactLibraryEntry[],
  options: { filter: ArtifactFilter; query: string; sort: ArtifactSort }
): ArtifactLibraryEntry[] {
  const query = options.query.trim().toLocaleLowerCase()
  const filtered = entries.filter((entry) => {
    if (options.filter !== 'all' && entry.kind !== options.filter) return false
    if (!query) return true
    return [entry.title, entry.sessionTitle, entry.kind, entry.language]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(query))
  })

  return filtered.sort((a, b) => {
    if (options.sort === 'name') return a.title.localeCompare(b.title)
    if (options.sort === 'type') {
      return a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title)
    }
    return b.updatedAt - a.updatedAt
  })
}
