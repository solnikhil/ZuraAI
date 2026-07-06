import type { MemoryScope } from '../electron/types'

export function getSessionMemoryScope(
  sessions: Array<{ id: string; folderId?: string | null }>,
  sessionId: string | null | undefined,
  folders: Array<{ id: string; memoryMode?: 'default' | 'folder-only' }> = []
): MemoryScope {
  if (!sessionId) return { type: 'global' }
  const folderId = sessions.find((session) => session.id === sessionId)?.folderId
  if (!folderId) return { type: 'global' }
  const folder = folders.find((entry) => entry.id === folderId)
  return {
    type: 'project',
    projectId: folderId,
    includeGlobal: folder?.memoryMode !== 'folder-only',
  }
}

export function folderMemoryScope(folder: {
  id: string
  memoryMode?: 'default' | 'folder-only'
}): Extract<MemoryScope, { type: 'project' }> {
  return {
    type: 'project',
    projectId: folder.id,
    includeGlobal: folder.memoryMode !== 'folder-only',
  }
}

/**
 * Whether a session's folder association can be definitively resolved.
 *
 * Returns `false` (unresolvable) when:
 * - the session itself cannot be found (e.g. a stale/missing `sessionId`), or
 * - the session has a non-null `folderId` that does not match any known
 *   `Folder` (e.g. a stale/removed folder reference).
 *
 * A session with no `folderId` (a global chat) is always resolvable, since
 * "no folder" is itself a definitive, legitimate association.
 *
 * Callers that persist memory (Memory_Extraction) MUST check this before
 * writing: when unresolvable, the write should be deferred/skipped rather
 * than silently falling back to Global_Memory. This is a write-path guard
 * only — read paths (prompt injection) may still fall back to a global read
 * via {@link getSessionMemoryScope} since that carries no misattribution risk.
 */
export function isFolderAssociationResolvable(
  sessions: Array<{ id: string; folderId?: string | null }>,
  sessionId: string | null | undefined,
  folders: Array<{ id: string }> = []
): boolean {
  if (!sessionId) return false
  const session = sessions.find((entry) => entry.id === sessionId)
  if (!session) return false
  if (!session.folderId) return true
  return folders.some((folder) => folder.id === session.folderId)
}
