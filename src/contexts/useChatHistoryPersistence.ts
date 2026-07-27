import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import type { ChatIndexData, ChatSession, Folder } from '../chat/types'
import type { ChatStoreChangedEvent, ChatStoreMutationResult } from '../electron/types'
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
  const reconciledStoreRevisionRef = useRef(0)
  const ownStoreRevisionsRef = useRef(new Set<number>())
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

  const trackSelfStoreMutation = useCallback(
    async (mutation: () => Promise<ChatStoreMutationResult>): Promise<ChatStoreMutationResult> => {
      const result = await mutation()
      if (result.changed) ownStoreRevisionsRef.current.add(result.revision)
      return result
    },
    []
  )

  const markStoreReconciled = useCallback((revision: number) => {
    if (!Number.isSafeInteger(revision) || revision < 0) return
    reconciledStoreRevisionRef.current = Math.max(0, revision)
    for (const ownRevision of ownStoreRevisionsRef.current) {
      if (ownRevision <= revision) ownStoreRevisionsRef.current.delete(ownRevision)
    }
  }, [])

  const isExternalStoreEvent = useCallback((event: ChatStoreChangedEvent | undefined): boolean => {
    // Older development preloads did not include revision metadata. Fail open to a refresh.
    if (!event || !Number.isSafeInteger(event.revision) || event.revision < 0) return true
    if (event.source === 'self') {
      ownStoreRevisionsRef.current.add(event.revision)
      return false
    }
    return true
  }, [])

  const hasMissedExternalStoreChanges = useCallback(async (): Promise<boolean> => {
    const currentRevision = await chatHistoryRepository.getRevision()
    if (!Number.isSafeInteger(currentRevision) || currentRevision < 0) return false
    const reconciledRevision = reconciledStoreRevisionRef.current
    if (currentRevision <= reconciledRevision) return false

    let ownRevisionCount = 0
    for (const ownRevision of ownStoreRevisionsRef.current) {
      if (ownRevision > reconciledRevision && ownRevision <= currentRevision) ownRevisionCount += 1
    }
    return ownRevisionCount !== currentRevision - reconciledRevision
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
    markStoreReconciled,
    isExternalStoreEvent,
    hasMissedExternalStoreChanges,
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
