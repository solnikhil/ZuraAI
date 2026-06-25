import fs from 'fs/promises'
import path from 'path'
import { app, shell } from 'electron'
import { getArtifactExtension, isArtifactKind } from '../../src/artifacts/artifactStore'
import type { ArtifactKind } from '../../src/artifacts/artifactTypes'

const MAX_ARTIFACT_CONTENT_LENGTH = 5_000_000

export interface OpenArtifactExternallyPayload {
  sessionId: string
  artifactId: string
  title: string
  kind: ArtifactKind
  language?: string
  content: string
}

export interface OpenArtifactExternallyResult {
  ok: boolean
  path?: string
  error?: string
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'artifact'
}

function sanitizeFilename(value: string): string {
  return value.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'artifact'
}

function normalizePayload(payload: unknown): OpenArtifactExternallyPayload | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
  const artifactId = typeof record.artifactId === 'string' ? record.artifactId.trim() : ''
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  const kind = record.kind
  const content = typeof record.content === 'string' ? record.content : ''
  const language = typeof record.language === 'string' ? record.language.trim() : undefined

  if (!sessionId || !artifactId || !title || !isArtifactKind(kind)) return null
  if (!content || content.length > MAX_ARTIFACT_CONTENT_LENGTH) return null

  return {
    sessionId,
    artifactId,
    title,
    kind,
    language: language || undefined,
    content,
  }
}

export async function openArtifactExternally(payload: unknown): Promise<OpenArtifactExternallyResult> {
  const normalized = normalizePayload(payload)
  if (!normalized) {
    return { ok: false, error: 'Invalid artifact open request.' }
  }

  const extension = getArtifactExtension({
    kind: normalized.kind,
    language: normalized.language,
  })
  const exportDir = path.join(
    app.getPath('userData'),
    'artifact-exports',
    safePathSegment(normalized.sessionId)
  )
  const filename = `${safePathSegment(normalized.artifactId)}-${sanitizeFilename(normalized.title)}.${extension}`
  const filePath = path.join(exportDir, filename)

  try {
    await fs.mkdir(exportDir, { recursive: true })
    await fs.writeFile(filePath, normalized.content, 'utf8')

    const openError = await shell.openPath(filePath)
    if (openError) {
      return { ok: false, error: openError, path: filePath }
    }

    return { ok: true, path: filePath }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to open artifact externally.',
    }
  }
}