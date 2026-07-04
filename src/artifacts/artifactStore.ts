import type { ArtifactDocument, ArtifactKind, ArtifactSummary } from './artifactTypes'

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `artifact-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function isArtifactKind(value: unknown): value is ArtifactKind {
  return (
    value === 'text' ||
    value === 'markdown' ||
    value === 'code' ||
    value === 'html' ||
    value === 'json' ||
    value === 'svg' ||
    value === 'mermaid'
  )
}

export function getArtifactExtension(
  artifact: Pick<ArtifactDocument, 'kind' | 'language'>
): string {
  if (artifact.kind === 'markdown') return 'md'
  if (artifact.kind === 'html') return 'html'
  if (artifact.kind === 'json') return 'json'
  if (artifact.kind === 'svg') return 'svg'
  if (artifact.kind === 'mermaid') return 'mmd'
  if (artifact.kind === 'code') return normalizeCodeExtension(artifact.language)
  return 'txt'
}

function normalizeCodeExtension(language?: string): string {
  const normalized = (language || '').trim().toLowerCase()
  if (normalized === 'typescript' || normalized === 'ts') return 'ts'
  if (normalized === 'tsx') return 'tsx'
  if (normalized === 'javascript' || normalized === 'js') return 'js'
  if (normalized === 'python' || normalized === 'py') return 'py'
  if (normalized === 'css') return 'css'
  if (normalized === 'json') return 'json'
  if (normalized === 'html') return 'html'
  return 'txt'
}

export function getCurrentArtifactVersion(artifact: ArtifactDocument) {
  return (
    artifact.versions.find((version) => version.id === artifact.currentVersionId) ??
    artifact.versions[artifact.versions.length - 1] ??
    null
  )
}

export function createArtifactDocument(input: {
  title: string
  kind: ArtifactKind
  language?: string
  content: string
  sourceMessageId?: string
  now?: number
}): ArtifactDocument {
  const now = input.now ?? Date.now()
  const versionId = createId()
  return {
    id: createId(),
    title: normalizeTitle(input.title),
    kind: input.kind,
    language: normalizeOptionalText(input.language),
    createdAt: now,
    updatedAt: now,
    createdByMessageId: input.sourceMessageId,
    updatedByMessageId: input.sourceMessageId,
    currentVersionId: versionId,
    versions: [
      {
        id: versionId,
        content: input.content,
        createdAt: now,
        sourceMessageId: input.sourceMessageId,
      },
    ],
  }
}

export function updateArtifactDocument(
  artifact: ArtifactDocument,
  input: {
    content: string
    title?: string
    language?: string
    sourceMessageId?: string
    changeSummary?: string
    now?: number
  }
): ArtifactDocument {
  const now = input.now ?? Date.now()
  const versionId = createId()
  return {
    ...artifact,
    title: input.title ? normalizeTitle(input.title) : artifact.title,
    language:
      input.language !== undefined ? normalizeOptionalText(input.language) : artifact.language,
    updatedAt: now,
    updatedByMessageId: input.sourceMessageId ?? artifact.updatedByMessageId,
    currentVersionId: versionId,
    versions: [
      ...artifact.versions,
      {
        id: versionId,
        content: input.content,
        createdAt: now,
        sourceMessageId: input.sourceMessageId,
        changeSummary: normalizeOptionalText(input.changeSummary),
      },
    ],
  }
}

export function restoreArtifactVersion(
  artifact: ArtifactDocument,
  versionId: string,
  input: { sourceMessageId?: string; now?: number } = {}
): ArtifactDocument {
  const version = artifact.versions.find((candidate) => candidate.id === versionId)
  if (!version) return artifact
  const now = input.now ?? Date.now()
  return {
    ...artifact,
    updatedAt: now,
    updatedByMessageId: input.sourceMessageId ?? artifact.updatedByMessageId,
    currentVersionId: version.id,
  }
}

export function renameArtifactDocument(
  artifact: ArtifactDocument,
  title: string
): ArtifactDocument {
  return {
    ...artifact,
    title: normalizeTitle(title),
    updatedAt: Date.now(),
  }
}

export function summarizeArtifact(artifact: ArtifactDocument): ArtifactSummary {
  return {
    id: artifact.id,
    title: artifact.title,
    kind: artifact.kind,
    language: artifact.language,
    updatedAt: artifact.updatedAt,
    currentVersionId: artifact.currentVersionId,
    versionCount: artifact.versions.length,
  }
}

export function normalizeArtifacts(raw: unknown): ArtifactDocument[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(normalizeArtifact)
    .filter((artifact): artifact is ArtifactDocument => Boolean(artifact))
}

function normalizeArtifact(raw: unknown): ArtifactDocument | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Partial<ArtifactDocument>
  if (
    !record.id ||
    !record.title ||
    !isArtifactKind(record.kind) ||
    !Array.isArray(record.versions)
  )
    return null
  const versions = record.versions.filter(
    (version): version is ArtifactDocument['versions'][number] =>
      Boolean(
        version &&
        typeof version.id === 'string' &&
        typeof version.content === 'string' &&
        typeof version.createdAt === 'number'
      )
  )
  if (versions.length === 0) return null
  const currentVersionId = versions.some((version) => version.id === record.currentVersionId)
    ? record.currentVersionId!
    : versions[versions.length - 1].id
  return {
    id: record.id,
    title: normalizeTitle(record.title),
    kind: record.kind,
    language: normalizeOptionalText(record.language),
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : versions[0].createdAt,
    updatedAt:
      typeof record.updatedAt === 'number'
        ? record.updatedAt
        : versions[versions.length - 1].createdAt,
    createdByMessageId: normalizeOptionalText(record.createdByMessageId),
    updatedByMessageId: normalizeOptionalText(record.updatedByMessageId),
    currentVersionId,
    versions,
  }
}

function normalizeTitle(value: string): string {
  const trimmed = value.trim()
  return trimmed || 'Untitled artifact'
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
