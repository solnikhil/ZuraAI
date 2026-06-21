import type { MemoryScope } from '../electron/types'

export function getSessionMemoryScope(
  sessions: Array<{ id: string; folderId?: string | null }>,
  sessionId: string | null | undefined
): MemoryScope {
  if (!sessionId) return { type: 'global' }
  const folderId = sessions.find((session) => session.id === sessionId)?.folderId
  return folderId ? { type: 'project', projectId: folderId } : { type: 'global' }
}
