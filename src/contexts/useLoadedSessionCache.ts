import { useCallback, useRef, type MutableRefObject } from 'react'
import type { ArtifactDocument, ChatSession } from '../chat/types'
import { normalizeArtifacts, summarizeArtifact } from '../artifacts/artifactStore'
import {
  chatHistoryRepository,
  isElectronChatRepository,
  localChatStorage,
} from './chatHistoryRepository'
import { normalizeSession } from './chatHistoryDomain'

const MAX_LOADED_SESSIONS = 3

function mergeArtifacts(loadedArtifacts: unknown, liveArtifacts: unknown): ArtifactDocument[] {
  const merged = new Map<string, ArtifactDocument>()
  for (const artifact of normalizeArtifacts(loadedArtifacts)) merged.set(artifact.id, artifact)
  for (const artifact of normalizeArtifacts(liveArtifacts)) {
    const existing = merged.get(artifact.id)
    if (!existing || artifact.updatedAt >= existing.updatedAt) merged.set(artifact.id, artifact)
  }
  return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function mergeLoadedSessionWithLiveShell(
  loaded: ChatSession,
  latestExisting?: ChatSession
): ChatSession {
  const artifacts = mergeArtifacts(loaded.artifacts, latestExisting?.artifacts)
  return normalizeSession({
    ...loaded,
    ...latestExisting,
    messages: loaded.messages ?? [],
    messageCount:
      loaded.messageCount ?? loaded.messages?.length ?? latestExisting?.messageCount ?? 0,
    artifacts,
    artifactSummaries:
      artifacts.length > 0
        ? artifacts.map(summarizeArtifact)
        : (latestExisting?.artifactSummaries ?? loaded.artifactSummaries),
  })
}

interface Options {
  sessionsRef: MutableRefObject<ChatSession[]>
  replaceSessions: (sessions: ChatSession[]) => void
  getCurrentSessionId: () => string | null
}

export function useLoadedSessionCache({
  sessionsRef,
  replaceSessions,
  getCurrentSessionId,
}: Options) {
  const loadedSessionIdsRef = useRef(new Set<string>())
  const recentLoadedSessionIdsRef = useRef<string[]>([])

  const markLoaded = useCallback((id: string) => {
    loadedSessionIdsRef.current.add(id)
    recentLoadedSessionIdsRef.current = [
      id,
      ...recentLoadedSessionIdsRef.current.filter((candidate) => candidate !== id),
    ].slice(0, MAX_LOADED_SESSIONS)
  }, [])

  const forgetLoaded = useCallback((id: string) => {
    loadedSessionIdsRef.current.delete(id)
    recentLoadedSessionIdsRef.current = recentLoadedSessionIdsRef.current.filter(
      (entry) => entry !== id
    )
  }, [])

  const clearLoaded = useCallback(() => {
    loadedSessionIdsRef.current.clear()
    recentLoadedSessionIdsRef.current = []
  }, [])

  const pruneLoadedSessions = useCallback(
    (activeId?: string | null) => {
      if (!isElectronChatRepository()) return
      const keep = new Set(recentLoadedSessionIdsRef.current.slice(0, MAX_LOADED_SESSIONS))
      if (activeId) keep.add(activeId)
      const evictedIds: string[] = []
      const nextSessions = sessionsRef.current.map((session) => {
        if (keep.has(session.id) || !loadedSessionIdsRef.current.has(session.id)) return session
        evictedIds.push(session.id)
        return {
          ...session,
          messages: [],
          artifacts: [],
          messageCount: session.messageCount ?? session.messages.length,
        }
      })
      replaceSessions(nextSessions)
      for (const id of evictedIds) loadedSessionIdsRef.current.delete(id)
    },
    [replaceSessions, sessionsRef]
  )

  const loadFullSession = useCallback(
    async (id: string, options?: { limit?: number }): Promise<ChatSession | null> => {
      const existing = sessionsRef.current.find((session) => session.id === id)
      if (!existing) return null
      const haveCount = existing.messages?.length ?? 0
      const totalCount = existing.messageCount ?? haveCount
      const holdsFullHistory = haveCount >= totalCount || totalCount === 0
      if (
        loadedSessionIdsRef.current.has(id) &&
        (haveCount > 0 || totalCount === 0) &&
        holdsFullHistory &&
        !options?.limit
      ) {
        markLoaded(id)
        pruneLoadedSessions(getCurrentSessionId())
        return existing
      }
      try {
        let loaded: ChatSession | null
        if (isElectronChatRepository()) {
          loaded = await chatHistoryRepository.getSession(id, options)
        } else {
          loaded = localChatStorage.readSessions().find((session) => session.id === id) ?? null
          if (loaded && options?.limit && Array.isArray(loaded.messages))
            loaded = { ...loaded, messages: loaded.messages.slice(-options.limit) }
        }
        if (!loaded) return null
        const latestExisting = sessionsRef.current.find((session) => session.id === id) ?? existing
        const normalized = mergeLoadedSessionWithLiveShell(loaded, latestExisting)
        const loadedCount = normalized.messages?.length ?? 0
        const normalizedTotal = normalized.messageCount ?? loadedCount
        if (
          !options?.limit ||
          loadedCount >= Math.min(options.limit, normalizedTotal) ||
          normalizedTotal === 0
        )
          markLoaded(id)
        replaceSessions(
          sessionsRef.current.map((session) => (session.id === id ? normalized : session))
        )
        pruneLoadedSessions(id)
        return normalized
      } catch (error) {
        console.error('Failed to load session:', error)
        return null
      }
    },
    [getCurrentSessionId, markLoaded, pruneLoadedSessions, replaceSessions, sessionsRef]
  )

  return {
    loadedSessionIdsRef,
    recentLoadedSessionIdsRef,
    markLoaded,
    forgetLoaded,
    clearLoaded,
    pruneLoadedSessions,
    loadFullSession,
  }
}
