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
