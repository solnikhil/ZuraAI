import { getArtifactExtension, getCurrentArtifactVersion } from './artifactStore'
import type { ArtifactDocument, ArtifactKind } from './artifactTypes'
import type { ChatSession } from '@/chat/types'
import { downloadFile } from '@/utils/chatExport'

function mimeForArtifact(artifact: Pick<ArtifactDocument, 'kind'>): string {
  if (artifact.kind === 'html') return 'text/html'
  if (artifact.kind === 'json') return 'application/json'
  if (artifact.kind === 'svg') return 'image/svg+xml'
  if (artifact.kind === 'markdown') return 'text/markdown'
  return 'text/plain'
}

function sanitizeFilename(value: string): string {
  return (
    value
      .trim()
      .split('')
      .map((char) => (char.charCodeAt(0) <= 31 ? '-' : char))
      .join('')
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'artifact'
  )
}

export function getExternalOpenLabel(kind: ArtifactKind): string {
  if (kind === 'svg') return 'Open in default image viewer'
  if (kind === 'html') return 'Open in default browser'
  if (kind === 'mermaid') return 'Open in default editor (.mmd)'
  return 'Open in default editor'
}

export async function resolveArtifactContent(
  sessionId: string,
  artifactId: string,
  sessions: ChatSession[]
): Promise<{ artifact: ArtifactDocument; content: string } | null> {
  const liveSession = sessions.find((session) => session.id === sessionId)
  const liveArtifact = liveSession?.artifacts?.find((artifact) => artifact.id === artifactId)
  if (liveArtifact) {
    const version = getCurrentArtifactVersion(liveArtifact)
    if (version?.content) {
      return { artifact: liveArtifact, content: version.content }
    }
  }

  if (!window.ipcRenderer) return null

  const fullSession = (await window.ipcRenderer.invoke(
    'chat-store:get-session',
    sessionId
  )) as ChatSession | null
  const artifact = fullSession?.artifacts?.find((entry) => entry.id === artifactId) ?? null
  if (!artifact) return null

  const version = getCurrentArtifactVersion(artifact)
  if (!version?.content) return null

  return { artifact, content: version.content }
}

export async function openArtifactInExternalApp(
  sessionId: string,
  artifactId: string,
  sessions: ChatSession[]
): Promise<{ ok: boolean; error?: string }> {
  const resolved = await resolveArtifactContent(sessionId, artifactId, sessions)
  if (!resolved) {
    return { ok: false, error: 'Artifact content is unavailable.' }
  }

  const { artifact, content } = resolved

  if (window.artifacts?.openExternally) {
    const result = await window.artifacts.openExternally({
      sessionId,
      artifactId,
      title: artifact.title,
      kind: artifact.kind,
      language: artifact.language,
      content,
    })
    return { ok: result.ok, error: result.error }
  }

  const filename = `${sanitizeFilename(artifact.title)}.${getArtifactExtension(artifact)}`
  downloadFile(content, filename, mimeForArtifact(artifact))
  return { ok: true }
}
