import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import type { ChatIndexData, ChatSession, Folder } from '../chat/types'
import { normalizeSession, sessionToMetadata } from './chatHistoryDomain'
import {
  chatHistoryRepository,
  isElectronChatRepository,
  localChatStorage,
} from './chatHistoryRepository'

const SAVE_DEBOUNCE_MS = 500
const INDEX_VERSION = 4

interface Options {
  isInitialized: boolean
  sessionsRef: MutableRefObject<ChatSession[]>
  foldersRef: MutableRefObject<Folder[]>
}

export function useChatHistoryPersistence({ isInitialized, sessionsRef, foldersRef }: Options) {
  const indexSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionSaveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const pendingSessionSavesRef = useRef(new Map<string, ChatSession>())
  const localSessionRevisionRef = useRef(0)
  const savedSessionRevisionRef = useRef(0)
  const pendingSelfStoreChangesRef = useRef(0)
  const sessionSavesInFlightRef = useRef(new Set<string>())
  const flushSessionSaveRef = useRef<(sessionId: string) => Promise<void>>(async () => {})
  const flushIndexSaveRef = useRef<() => Promise<void>>(async () => {})

  const markSessionsDirty = useCallback(() => {
    localSessionRevisionRef.current += 1
  }, [])
  const hasUnsavedLocalSessionChanges = useCallback(
    () => localSessionRevisionRef.current > savedSessionRevisionRef.current,
    []
  )
  const markAllSaved = useCallback(() => {
    savedSessionRevisionRef.current = localSessionRevisionRef.current
  }, [])

  const trackSelfStoreMutation = useCallback(async <T>(mutation: () => Promise<T>): Promise<T> => {
    pendingSelfStoreChangesRef.current += 1
    try {
      const result = await mutation()
      if (result === false)
        pendingSelfStoreChangesRef.current = Math.max(0, pendingSelfStoreChangesRef.current - 1)
      return result
    } catch (error) {
      pendingSelfStoreChangesRef.current = Math.max(0, pendingSelfStoreChangesRef.current - 1)
      throw error
    }
  }, [])

  const flushIndexSave = useCallback(async () => {
    if (!isInitialized) return
    const revisionToSave = localSessionRevisionRef.current
    const index: ChatIndexData = {
      sessions: sessionsRef.current.map(sessionToMetadata),
      folders: foldersRef.current,
      version: INDEX_VERSION,
    }
    try {
      if (isElectronChatRepository()) {
        await trackSelfStoreMutation(() => chatHistoryRepository.saveIndex(index))
      } else {
        localChatStorage.save(index, sessionsRef.current)
      }
      if (localSessionRevisionRef.current === revisionToSave)
        savedSessionRevisionRef.current = revisionToSave
    } catch (error) {
      console.error('Failed to save chat index:', error)
      if (!isElectronChatRepository()) {
        localChatStorage.save(index, sessionsRef.current)
        if (localSessionRevisionRef.current === revisionToSave)
          savedSessionRevisionRef.current = revisionToSave
      }
    }
  }, [foldersRef, isInitialized, sessionsRef, trackSelfStoreMutation])
  flushIndexSaveRef.current = flushIndexSave

  const scheduleIndexSave = useCallback(() => {
    if (!isInitialized) return
    if (indexSaveTimerRef.current) clearTimeout(indexSaveTimerRef.current)
    indexSaveTimerRef.current = setTimeout(() => {
      indexSaveTimerRef.current = null
      void flushIndexSave()
    }, SAVE_DEBOUNCE_MS)
  }, [flushIndexSave, isInitialized])

  const flushSessionSave = useCallback(
    async (sessionId: string) => {
      if (sessionSavesInFlightRef.current.has(sessionId)) return
      sessionSavesInFlightRef.current.add(sessionId)
      let shouldFlushNewerSnapshot = false
      try {
        while (true) {
          const session = pendingSessionSavesRef.current.get(sessionId)
          if (!session) break
          pendingSessionSavesRef.current.delete(sessionId)
          try {
            if (isElectronChatRepository()) {
              await trackSelfStoreMutation(() => chatHistoryRepository.saveSession(session))
            } else {
              localStorage.setItem(localChatStorage.historyKey, JSON.stringify(sessionsRef.current))
            }
          } catch (error) {
            shouldFlushNewerSnapshot = pendingSessionSavesRef.current.has(sessionId)
            if (!shouldFlushNewerSnapshot) pendingSessionSavesRef.current.set(sessionId, session)
            throw error
          }
        }
      } catch (error) {
        console.error(`Failed to save chat session ${sessionId}:`, error)
      } finally {
        sessionSavesInFlightRef.current.delete(sessionId)
        if (shouldFlushNewerSnapshot) void flushSessionSaveRef.current(sessionId)
      }
    },
    [sessionsRef, trackSelfStoreMutation]
  )
  flushSessionSaveRef.current = flushSessionSave

  const scheduleSessionSave = useCallback(
    (session: ChatSession) => {
      if (!isInitialized) return
      pendingSessionSavesRef.current.set(session.id, normalizeSession(session))
      const existingTimer = sessionSaveTimersRef.current.get(session.id)
      if (existingTimer) clearTimeout(existingTimer)
      const nextTimer = setTimeout(() => {
        sessionSaveTimersRef.current.delete(session.id)
        void flushSessionSave(session.id)
      }, SAVE_DEBOUNCE_MS)
      sessionSaveTimersRef.current.set(session.id, nextTimer)
    },
    [flushSessionSave, isInitialized]
  )

  const cancelScheduledIndexSave = useCallback(() => {
    if (indexSaveTimerRef.current) clearTimeout(indexSaveTimerRef.current)
    indexSaveTimerRef.current = null
  }, [])

  useEffect(
    () => () => {
      cancelScheduledIndexSave()
      for (const timer of sessionSaveTimersRef.current.values()) clearTimeout(timer)
      sessionSaveTimersRef.current.clear()
      if (localSessionRevisionRef.current > savedSessionRevisionRef.current)
        void flushIndexSaveRef.current()
      for (const sessionId of pendingSessionSavesRef.current.keys())
        void flushSessionSaveRef.current(sessionId)
    },
    [cancelScheduledIndexSave]
  )

  return {
    pendingSelfStoreChangesRef,
    markSessionsDirty,
    hasUnsavedLocalSessionChanges,
    markAllSaved,
    trackSelfStoreMutation,
    flushIndexSave,
    scheduleIndexSave,
    scheduleSessionSave,
    cancelScheduledIndexSave,
  }
}
