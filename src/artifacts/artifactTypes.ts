export type ArtifactKind = 'text' | 'markdown' | 'code' | 'html' | 'json' | 'svg' | 'mermaid'

export interface ArtifactVersion {
  id: string
  content: string
  createdAt: number
  sourceMessageId?: string
  changeSummary?: string
}

export interface ArtifactDocument {
  id: string
  title: string
  kind: ArtifactKind
  language?: string
  createdAt: number
  updatedAt: number
  createdByMessageId?: string
  updatedByMessageId?: string
  currentVersionId: string
  versions: ArtifactVersion[]
}

export interface ArtifactSummary {
  id: string
  title: string
  kind: ArtifactKind
  language?: string
  updatedAt: number
  currentVersionId: string
  versionCount: number
}

export const ARTIFACT_KINDS: ArtifactKind[] = [
  'text',
  'markdown',
  'code',
  'html',
  'json',
  'svg',
  'mermaid',
]
