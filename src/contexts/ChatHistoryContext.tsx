/**
 * Manages chat sessions, persistence, and selector-based subscriptions.
 *
 * Renderer state is metadata-first: inactive sessions keep lightweight metadata
 * only, while full message arrays are loaded on demand and capped to the active
 * session plus two recently used sessions.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react'
import { useSettings } from './SettingsContext'
import type { SessionMetadata } from './ChatSessionManager'
import { createSelectableContext } from './createSelectableContext'
import { warnOnceDuringHmr } from './hmrWarnings'
import type {
  ArtifactDocument,
  ChatSession,
  FileAttachment,
  Folder,
  Message,
  ResponseVersion,
  ThinkingBlock,
  ToolCallResult,
} from '../chat/types'
import {
  createArtifactDocument,
  normalizeArtifacts,
  renameArtifactDocument,
  restoreArtifactVersion,
  summarizeArtifact,
  updateArtifactDocument,
} from '../artifacts/artifactStore'
import type { ArtifactKind } from '../artifacts/artifactTypes'
import { registerArtifactToolHost } from '../tools/artifactTools'
import {
  addSessionTag,
  deleteFolderFromState,
  metadataToSession,
  normalizeSession,
  removeSessionTag,
  setSessionFolder,
  setSessionPinned,
} from './chatHistoryDomain'
import {
  chatHistoryRepository,
  isElectronChatRepository,
  localChatStorage,
  readLocalChatIndex,
} from './chatHistoryRepository'
import { useChatHistoryPersistence } from './useChatHistoryPersistence'
import { mergeLoadedSessionWithLiveShell, useLoadedSessionCache } from './useLoadedSessionCache'

export type { SessionMetadata } from './ChatSessionManager'

export type {
  ChatSession,
  FileAttachment,
  Folder,
  Message,
  ResponseVersion,
  ThinkingBlock,
  ToolCallResult,
}

interface ChatHistoryContextType {
  sessions: ChatSession[]
  folders: Folder[]
  currentSessionId: string | null
  isLoading: boolean
  createSession: (
    firstMessage?: string,
    folderId?: string | null,
    idOverride?: string,
    options?: { activate?: boolean }
  ) => string
  switchSession: (id: string) => void
  addMessageToSession: (sessionId: string, message: Omit<Message, 'id' | 'timestamp'>) => string
  updateStreamingMessage: (
    sessionId: string,
    messageId: string,
    updates: Partial<Message>,
    options?: { persist?: boolean }
  ) => void
  deleteMessageFromSession: (sessionId: string, messageId: string) => void
  deleteSession: (id: string) => void
  clearAllSessions: () => void
  updateSessionTitle: (id: string, title: string) => void
  refreshSessions: () => Promise<void>
  clearCurrentSession: () => void
  loadFullSession: (id: string, options?: { limit?: number }) => Promise<ChatSession | null>
  getSessionMetadata: () => SessionMetadata[]
  isSessionLoaded: (id: string) => boolean

  pinSession: (id: string) => void
  unpinSession: (id: string) => void
  duplicateSession: (id: string) => void
  createArtifact: (
    sessionId: string,
    input: {
      title: string
      kind: ArtifactKind
      language?: string
      content: string
      sourceMessageId?: string
    }
  ) => ArtifactDocument | null
  updateArtifact: (
    sessionId: string,
    artifactId: string,
    input: {
      content: string
      title?: string
      language?: string
      sourceMessageId?: string
      changeSummary?: string
    }
  ) => ArtifactDocument | null
  renameArtifact: (sessionId: string, artifactId: string, title: string) => void
  restoreArtifact: (sessionId: string, artifactId: string, versionId: string) => void
  deleteArtifact: (sessionId: string, artifactId: string) => void

  assignFolder: (sessionId: string, folderId: string) => void
  removeFromFolder: (sessionId: string) => void

  addTag: (sessionId: string, tag: string) => void
  removeTag: (sessionId: string, tag: string) => void

  createFolder: (name: string, memoryMode?: Folder['memoryMode']) => string
  deleteFolder: (id: string) => void
  renameFolder: (id: string, name: string) => void
  reorderFolder: (id: string, order: number) => void
  setFolderMemoryMode: (id: string, memoryMode: Folder['memoryMode']) => void
}

interface ChatHistoryState {
  sessions: ChatSession[]
  folders: Folder[]
  currentSessionId: string | null
  isLoading: boolean
}

const { Provider: SelectableChatHistoryProvider, useSelector: useChatHistoryStateSelector } =
  createSelectableContext<ChatHistoryState>()

const ChatHistoryContext = createContext<ChatHistoryContextType | undefined>(undefined)

const isElectron = isElectronChatRepository()
const LAST_SESSION_ID_KEY = 'zura-ui:lastChatSessionId'
/** Compact index preview tail — keep small; full history loads from disk on demand. */
const SESSION_WINDOW_SIZE = 80
const INACTIVE_UNLOAD_MS = 5 * 60 * 1000
const INDEX_VERSION = 4

function withArtifactSummaries(session: ChatSession): ChatSession {
  const artifacts = normalizeArtifacts(session.artifacts)
  return {
    ...session,
    artifacts,
    artifactSummaries: artifacts.length > 0 ? artifacts.map(summarizeArtifact) : [],
  }
}

export function ChatHistoryProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)
  const [hasExternalStoreChanges, setHasExternalStoreChanges] = useState(false)

  const sessionsRef = useRef<ChatSession[]>([])
  const foldersRef = useRef<Folder[]>([])

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  useEffect(() => {
    foldersRef.current = folders
  }, [folders])

  const {
    pendingSelfStoreChangesRef,
    markSessionsDirty,
    hasUnsavedLocalSessionChanges,
    markAllSaved,
    trackSelfStoreMutation,
    flushIndexSave,
    scheduleIndexSave,
    scheduleSessionSave,
    cancelScheduledIndexSave,
  } = useChatHistoryPersistence({ isInitialized, sessionsRef, foldersRef })

  const {
    loadedSessionIdsRef,
    markLoaded,
    forgetLoaded,
    clearLoaded,
    pruneLoadedSessions,
    loadFullSession,
  } = useLoadedSessionCache({
    sessionsRef,
    setSessions,
    getCurrentSessionId: () => currentSessionId,
  })

  const loadSessions = useCallback(async () => {
    try {
      if (isElectron) {
        let metadata = await chatHistoryRepository.getMetadata()

        if (metadata.length === 0) {
          const localData = localStorage.getItem(localChatStorage.historyKey)
          if (localData) {
            const parsed = JSON.parse(localData)
            if (Array.isArray(parsed) && parsed.length > 0) {
              await chatHistoryRepository.migrate(parsed)
              localStorage.removeItem(localChatStorage.historyKey)
              metadata = await chatHistoryRepository.getMetadata()
            }
          }
        }

        setSessions(metadata.map((entry) => metadataToSession(entry)))
        setFolders(await chatHistoryRepository.getFolders())
      } else {
        const localState = readLocalChatIndex()
        localState.sessions.forEach((session) => markLoaded(session.id))
        setSessions(localState.sessions)
        setFolders(localState.folders)
      }
    } catch (error) {
      console.error('Failed to load chat history:', error)
      const saved = localStorage.getItem(localChatStorage.historyKey)
      const parsed = saved ? (JSON.parse(saved) as ChatSession[]) : []
      setSessions(parsed.map(normalizeSession))
    } finally {
      markAllSaved()
      setIsLoading(false)
      setIsInitialized(true)
    }
  }, [markAllSaved, markLoaded])

  const reloadFromExternalStore = useCallback(async () => {
    try {
      if (isElectron) {
        const metadata = await chatHistoryRepository.getMetadata()
        const nextFolders = await chatHistoryRepository.getFolders()
        clearLoaded()
        setSessions(metadata.map((entry) => metadataToSession(entry)))
        setFolders(nextFolders)
        setCurrentSessionId((prev) => {
          if (!prev) return null
          return metadata.some((session) => session.id === prev) ? prev : null
        })
      } else {
        const localState = readLocalChatIndex()
        localState.sessions.forEach((session) => markLoaded(session.id))
        setSessions(localState.sessions)
        setFolders(localState.folders)
      }

      markAllSaved()
      setHasExternalStoreChanges(false)
    } catch (error) {
      console.error('Failed to reload chat history from external store:', error)
    }
  }, [clearLoaded, markAllSaved, markLoaded])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  useEffect(() => {
    if (!isInitialized) return
    if (currentSessionId) return
    if (!settings.rememberLastChatSession) return
    const rememberedId = localStorage.getItem(LAST_SESSION_ID_KEY)
    if (!rememberedId) return
    if (sessions.some((session) => session.id === rememberedId)) {
      setCurrentSessionId(rememberedId)
      // Windowed load only — full history stays on disk until user scrolls for older messages.
      void loadFullSession(rememberedId, { limit: SESSION_WINDOW_SIZE })
    }
  }, [currentSessionId, isInitialized, loadFullSession, sessions, settings.rememberLastChatSession])

  // Unload inactive fully-loaded sessions after idle to free renderer heap.
  useEffect(() => {
    if (!isElectron) return
    const timer = window.setInterval(() => {
      const activeId = currentSessionId
      // Time-based unload is handled by prune to empty messages for non-kept sessions.
      pruneLoadedSessions(activeId)
    }, INACTIVE_UNLOAD_MS)
    return () => window.clearInterval(timer)
  }, [currentSessionId, pruneLoadedSessions])

  useEffect(() => {
    if (!currentSessionId) return
    const session = sessions.find((entry) => entry.id === currentSessionId)
    if (session && !loadedSessionIdsRef.current.has(currentSessionId)) {
      const have = session.messages?.length ?? 0
      // Thin index previews are not enough for chat UI — always load a window.
      if (have < SESSION_WINDOW_SIZE) {
        void loadFullSession(currentSessionId, { limit: SESSION_WINDOW_SIZE })
      } else {
        // Already have a full window from a previous limited load; mark loaded for pruning.
        markLoaded(currentSessionId)
      }
      // Do not background-load the entire history (RAM). Older messages load on demand.
    }
  }, [currentSessionId, loadFullSession, markLoaded, sessions])

  useEffect(() => {
    if (!isElectron || !window.ipcRenderer?.on) return

    const handleChatStoreChanged = () => {
      if (pendingSelfStoreChangesRef.current > 0) {
        pendingSelfStoreChangesRef.current -= 1
        return
      }
      setHasExternalStoreChanges(true)
    }

    return window.ipcRenderer.on('chat-store:changed', handleChatStoreChanged)
  }, [])

  useEffect(() => {
    if (!isElectron || !isInitialized) return

    const refreshIfNeeded = () => {
      if (!hasExternalStoreChanges) return
      if (hasUnsavedLocalSessionChanges()) return
      void reloadFromExternalStore()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshIfNeeded()
      }
    }

    window.addEventListener('focus', refreshIfNeeded)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', refreshIfNeeded)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [
    hasExternalStoreChanges,
    hasUnsavedLocalSessionChanges,
    isInitialized,
    reloadFromExternalStore,
  ])

  useEffect(() => {
    if (!isInitialized) return
    if (!settings.rememberLastChatSession) {
      localStorage.removeItem(LAST_SESSION_ID_KEY)
      return
    }
    if (currentSessionId) {
      localStorage.setItem(LAST_SESSION_ID_KEY, currentSessionId)
    } else {
      localStorage.removeItem(LAST_SESSION_ID_KEY)
    }
  }, [currentSessionId, isInitialized, settings.rememberLastChatSession])

  const refreshSessions = useCallback(async () => {
    await reloadFromExternalStore()
  }, [reloadFromExternalStore])

  const persistSessionMutation = useCallback(
    (session: ChatSession) => {
      markSessionsDirty()
      scheduleIndexSave()
      if (loadedSessionIdsRef.current.has(session.id)) {
        scheduleSessionSave(session)
      }
    },
    [markSessionsDirty, scheduleIndexSave, scheduleSessionSave]
  )

  const createSession = useCallback(
    (
      firstMessage?: string,
      folderId?: string | null,
      idOverride?: string,
      options?: { activate?: boolean }
    ) => {
      const now = Date.now()
      const normalizedFirstMessage = typeof firstMessage === 'string' ? firstMessage.trim() : ''
      const normalizedFolderId = folderId || null
      const normalizedIdOverride =
        typeof idOverride === 'string' && idOverride.trim() ? idOverride.trim() : ''
      const shouldActivate = options?.activate !== false
      const existingReusable =
        !normalizedIdOverride && !normalizedFirstMessage
          ? sessionsRef.current.find(
              (session) =>
                session.title === 'New Chat' &&
                (session.folderId ?? null) === normalizedFolderId &&
                (session.messageCount ?? session.messages.length) === 0
            )
          : undefined

      if (existingReusable) {
        const updatedExisting = {
          ...existingReusable,
          folderId: normalizedFolderId,
          updatedAt: now,
        }
        markLoaded(updatedExisting.id)
        setSessions((prev) => [
          updatedExisting,
          ...prev.filter((session) => session.id !== updatedExisting.id),
        ])
        persistSessionMutation(updatedExisting)
        if (shouldActivate) {
          setCurrentSessionId(updatedExisting.id)
        }
        return updatedExisting.id
      }

      const initialMessages: Message[] = normalizedFirstMessage
        ? [
            {
              id: crypto.randomUUID(),
              role: 'user',
              content: normalizedFirstMessage,
              timestamp: now,
            },
          ]
        : []

      const newSession: ChatSession = normalizeSession({
        id: normalizedIdOverride || crypto.randomUUID(),
        title: normalizedFirstMessage
          ? normalizedFirstMessage.slice(0, 30) + (normalizedFirstMessage.length > 30 ? '...' : '')
          : 'New Chat',
        messages: initialMessages,
        createdAt: now,
        updatedAt: now,
        pinned: false,
        folderId: normalizedFolderId,
        tags: [],
      })

      markLoaded(newSession.id)
      setSessions((prev) => [newSession, ...prev])
      persistSessionMutation(newSession)
      if (shouldActivate) {
        setCurrentSessionId(newSession.id)
      }
      return newSession.id
    },
    [markLoaded, persistSessionMutation]
  )

  const getSessionMetadata = useCallback(
    (): SessionMetadata[] =>
      sessionsRef.current.map((session) => ({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messageCount ?? session.messages.length,
      })),
    []
  )

  const isSessionLoaded = useCallback(
    (id: string): boolean => loadedSessionIdsRef.current.has(id),
    []
  )

  const switchSession = useCallback(
    (id: string) => {
      if (!sessionsRef.current.some((session) => session.id === id)) return
      setCurrentSessionId(id)
      // Windowed load only — keeps RAM bounded for large histories.
      void loadFullSession(id, { limit: SESSION_WINDOW_SIZE })
    },
    [loadFullSession]
  )

  const updateOneSession = useCallback(
    (
      sessionId: string,
      updater: (session: ChatSession) => ChatSession,
      options?: { persist?: boolean }
    ) => {
      const shouldPersist = options?.persist !== false
      setSessions((prev) => {
        let updatedSession: ChatSession | null = null
        const next = prev.map((session) => {
          if (session.id !== sessionId) return session
          updatedSession = normalizeSession(updater(session))
          return updatedSession
        })

        if (updatedSession && shouldPersist) {
          persistSessionMutation(updatedSession)
        }

        return next.sort((a, b) => b.updatedAt - a.updatedAt)
      })
    },
    [persistSessionMutation]
  )

  const persistUnloadedArtifactMutation = useCallback(
    (sessionId: string, updater: (session: ChatSession) => ChatSession) => {
      if (!isElectron || loadedSessionIdsRef.current.has(sessionId)) return

      void (async () => {
        try {
          const fullSession = await chatHistoryRepository.getSession(sessionId)
          if (!fullSession) return

          const latestExisting = sessionsRef.current.find((session) => session.id === sessionId)
          const mergedBase = mergeLoadedSessionWithLiveShell(fullSession, latestExisting)
          const nextSession = withArtifactSummaries(normalizeSession(updater(mergedBase)))

          await trackSelfStoreMutation(() => chatHistoryRepository.saveSession(nextSession))
        } catch (error) {
          console.error(`Failed to persist artifact mutation for session ${sessionId}:`, error)
        }
      })()
    },
    [trackSelfStoreMutation]
  )

  const addMessageToSession = useCallback(
    (sessionId: string, message: Omit<Message, 'id' | 'timestamp'>): string => {
      const newMessage: Message = {
        ...message,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      }

      markLoaded(sessionId)
      updateOneSession(sessionId, (session) => {
        const messages = [...session.messages, newMessage]
        const firstUserMessage =
          (session.messageCount ?? session.messages.length) === 0 && message.role === 'user'
        const title = firstUserMessage
          ? message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '')
          : session.title

        return {
          ...session,
          title,
          messages,
          updatedAt: Date.now(),
          messageCount: messages.length,
        }
      })

      return newMessage.id
    },
    [markLoaded, updateOneSession]
  )

  const updateStreamingMessage = useCallback(
    (
      sessionId: string,
      messageId: string,
      updates: Partial<Message>,
      options?: { persist?: boolean }
    ) => {
      // Default: in-memory only during stream — avoid rewriting multi-MB session
      // JSON and re-embedding index tails on every throttled token batch.
      // Pass { persist: true } when committing the final streamed message.
      updateOneSession(
        sessionId,
        (session) => {
          const updatedMessages = session.messages.map((message) =>
            message.id === messageId ? { ...message, ...updates } : message
          )

          return {
            ...session,
            messages: updatedMessages,
            updatedAt: Date.now(),
            messageCount: updatedMessages.length,
          }
        },
        { persist: options?.persist === true }
      )
    },
    [updateOneSession]
  )

  const deleteMessageFromSession = useCallback(
    (sessionId: string, messageId: string) => {
      updateOneSession(sessionId, (session) => {
        const messages = session.messages.filter((message) => message.id !== messageId)
        return {
          ...session,
          messages,
          updatedAt: Date.now(),
          messageCount: messages.length,
        }
      })
    },
    [updateOneSession]
  )

  const deleteSession = useCallback(
    (id: string) => {
      markSessionsDirty()
      forgetLoaded(id)
      setSessions((prev) => prev.filter((session) => session.id !== id))
      setCurrentSessionId((prev) => (prev === id ? null : prev))
      if (isElectron) {
        void trackSelfStoreMutation(() => chatHistoryRepository.deleteSession(id))
      } else {
        scheduleIndexSave()
      }
    },
    [forgetLoaded, markSessionsDirty, scheduleIndexSave, trackSelfStoreMutation]
  )

  const clearAllSessions = useCallback(() => {
    markSessionsDirty()
    const ids = sessionsRef.current.map((session) => session.id)
    clearLoaded()
    setSessions([])
    setCurrentSessionId(null)
    if (isElectron) {
      void Promise.all(
        ids.map((id) => trackSelfStoreMutation(() => chatHistoryRepository.deleteSession(id)))
      ).then(() =>
        trackSelfStoreMutation(() =>
          chatHistoryRepository.saveIndex({
            sessions: [],
            folders: foldersRef.current,
            version: INDEX_VERSION,
          })
        )
      )
    } else {
      localStorage.setItem(localChatStorage.historyKey, '[]')
      localStorage.setItem(
        localChatStorage.indexKey,
        JSON.stringify({ sessions: [], folders: foldersRef.current, version: INDEX_VERSION })
      )
    }
  }, [clearLoaded, markSessionsDirty, trackSelfStoreMutation])

  const updateSessionTitle = useCallback(
    (id: string, title: string) => {
      updateOneSession(id, (session) => ({ ...session, title, updatedAt: Date.now() }))
    },
    [updateOneSession]
  )

  const clearCurrentSession = useCallback(() => {
    localStorage.removeItem(LAST_SESSION_ID_KEY)
    setCurrentSessionId(null)
  }, [])

  const pinSession = useCallback(
    (id: string) => {
      updateOneSession(id, (session) => setSessionPinned(session, true, Date.now()))
    },
    [updateOneSession]
  )

  const unpinSession = useCallback(
    (id: string) => {
      updateOneSession(id, (session) => setSessionPinned(session, false, Date.now()))
    },
    [updateOneSession]
  )

  const duplicateSession = useCallback(
    (id: string) => {
      void (async () => {
        const original =
          (await loadFullSession(id)) ?? sessionsRef.current.find((session) => session.id === id)
        if (!original) return

        const now = Date.now()
        const newSession: ChatSession = normalizeSession({
          id: crypto.randomUUID(),
          title: `Copy of ${original.title}`,
          messages: original.messages.map((message) => ({
            ...message,
            id: crypto.randomUUID(),
            timestamp: message.timestamp,
          })),
          createdAt: now,
          updatedAt: now,
          totalTokens: original.totalTokens,
          pinned: false,
          folderId: original.folderId,
          tags: [...(original.tags || [])],
        })

        markLoaded(newSession.id)
        setSessions((prev) => [newSession, ...prev])
        persistSessionMutation(newSession)
      })()
    },
    [loadFullSession, markLoaded, persistSessionMutation]
  )

  const createArtifact = useCallback(
    (
      sessionId: string,
      input: {
        title: string
        kind: ArtifactKind
        language?: string
        content: string
        sourceMessageId?: string
      }
    ): ArtifactDocument | null => {
      const created = createArtifactDocument(input)
      updateOneSession(sessionId, (session) => {
        return withArtifactSummaries({
          ...session,
          artifacts: [...normalizeArtifacts(session.artifacts), created],
          updatedAt: Date.now(),
        })
      })
      persistUnloadedArtifactMutation(sessionId, (session) => {
        const artifacts = normalizeArtifacts(session.artifacts)
        if (artifacts.some((artifact) => artifact.id === created.id)) return session
        return {
          ...session,
          artifacts: [...artifacts, created],
          updatedAt: Math.max(session.updatedAt, created.updatedAt),
        }
      })
      return created
    },
    [persistUnloadedArtifactMutation, updateOneSession]
  )

  const updateArtifact = useCallback(
    (
      sessionId: string,
      artifactId: string,
      input: {
        content: string
        title?: string
        language?: string
        sourceMessageId?: string
        changeSummary?: string
      }
    ): ArtifactDocument | null => {
      const existingSession = sessionsRef.current.find((session) => session.id === sessionId)
      const existingArtifact = normalizeArtifacts(existingSession?.artifacts).find(
        (artifact) => artifact.id === artifactId
      )
      const optimisticUpdated = existingArtifact
        ? updateArtifactDocument(existingArtifact, input)
        : null
      updateOneSession(sessionId, (session) => {
        const artifacts = normalizeArtifacts(session.artifacts)
        const nextArtifacts = artifacts.map((artifact) => {
          if (artifact.id !== artifactId) return artifact
          return artifact.id === optimisticUpdated?.id
            ? optimisticUpdated
            : updateArtifactDocument(artifact, input)
        })
        return nextArtifacts.some((artifact) => artifact.id === artifactId)
          ? withArtifactSummaries({ ...session, artifacts: nextArtifacts, updatedAt: Date.now() })
          : session
      })
      persistUnloadedArtifactMutation(sessionId, (session) => {
        const artifacts = normalizeArtifacts(session.artifacts)
        const nextArtifacts = artifacts.map((artifact) =>
          artifact.id === artifactId ? updateArtifactDocument(artifact, input) : artifact
        )
        return nextArtifacts.some((artifact) => artifact.id === artifactId)
          ? { ...session, artifacts: nextArtifacts, updatedAt: Date.now() }
          : session
      })
      return optimisticUpdated
    },
    [persistUnloadedArtifactMutation, updateOneSession]
  )

  const renameArtifact = useCallback(
    (sessionId: string, artifactId: string, title: string) => {
      const updater = (session: ChatSession) => ({
        ...session,
        artifacts: normalizeArtifacts(session.artifacts).map((artifact) =>
          artifact.id === artifactId ? renameArtifactDocument(artifact, title) : artifact
        ),
        updatedAt: Date.now(),
      })
      updateOneSession(sessionId, (session) => withArtifactSummaries(updater(session)))
      persistUnloadedArtifactMutation(sessionId, updater)
    },
    [persistUnloadedArtifactMutation, updateOneSession]
  )

  const restoreArtifact = useCallback(
    (sessionId: string, artifactId: string, versionId: string) => {
      const updater = (session: ChatSession) => ({
        ...session,
        artifacts: normalizeArtifacts(session.artifacts).map((artifact) =>
          artifact.id === artifactId ? restoreArtifactVersion(artifact, versionId) : artifact
        ),
        updatedAt: Date.now(),
      })
      updateOneSession(sessionId, (session) => withArtifactSummaries(updater(session)))
      persistUnloadedArtifactMutation(sessionId, updater)
    },
    [persistUnloadedArtifactMutation, updateOneSession]
  )

  const deleteArtifact = useCallback(
    (sessionId: string, artifactId: string) => {
      const updater = (session: ChatSession) => ({
        ...session,
        artifacts: normalizeArtifacts(session.artifacts).filter(
          (artifact) => artifact.id !== artifactId
        ),
        updatedAt: Date.now(),
      })
      updateOneSession(sessionId, (session) => withArtifactSummaries(updater(session)))
      persistUnloadedArtifactMutation(sessionId, updater)
    },
    [persistUnloadedArtifactMutation, updateOneSession]
  )

  useEffect(() => {
    return registerArtifactToolHost({
      createArtifact,
      updateArtifact,
    })
  }, [createArtifact, updateArtifact])

  const assignFolder = useCallback(
    (sessionId: string, folderId: string) => {
      updateOneSession(sessionId, (session) => setSessionFolder(session, folderId, Date.now()))
    },
    [updateOneSession]
  )

  const removeFromFolder = useCallback(
    (sessionId: string) => {
      updateOneSession(sessionId, (session) => setSessionFolder(session, null, Date.now()))
    },
    [updateOneSession]
  )

  const addTag = useCallback(
    (sessionId: string, tag: string) => {
      updateOneSession(sessionId, (session) => addSessionTag(session, tag, Date.now()))
    },
    [updateOneSession]
  )

  const removeTag = useCallback(
    (sessionId: string, tag: string) => {
      updateOneSession(sessionId, (session) => removeSessionTag(session, tag, Date.now()))
    },
    [updateOneSession]
  )

  const saveFoldersAndIndex = useCallback(
    (nextFolders: Folder[]) => {
      foldersRef.current = nextFolders
      setFolders(nextFolders)
      markSessionsDirty()
      cancelScheduledIndexSave()
      void flushIndexSave()
    },
    [cancelScheduledIndexSave, flushIndexSave, markSessionsDirty]
  )

  const createFolder = useCallback(
    (name: string, memoryMode: Folder['memoryMode'] = 'default'): string => {
      const newFolder: Folder = {
        id: crypto.randomUUID(),
        name,
        order: 0,
        createdAt: Date.now(),
        memoryMode,
      }

      const maxOrder = foldersRef.current.reduce((max, folder) => Math.max(max, folder.order), -1)
      newFolder.order = maxOrder + 1
      saveFoldersAndIndex([...foldersRef.current, newFolder])
      return newFolder.id
    },
    [saveFoldersAndIndex]
  )

  const deleteFolder = useCallback(
    (id: string) => {
      const now = Date.now()
      const { folders: nextFolders, sessions: nextSessions } = deleteFolderFromState(
        foldersRef.current,
        sessionsRef.current,
        id,
        now
      )

      foldersRef.current = nextFolders
      sessionsRef.current = nextSessions
      setFolders(nextFolders)
      setSessions(nextSessions)
      markSessionsDirty()
      cancelScheduledIndexSave()
      void flushIndexSave()
    },
    [cancelScheduledIndexSave, flushIndexSave, markSessionsDirty]
  )

  const renameFolder = useCallback(
    (id: string, name: string) => {
      saveFoldersAndIndex(
        foldersRef.current.map((folder) => (folder.id === id ? { ...folder, name } : folder))
      )
    },
    [saveFoldersAndIndex]
  )

  const reorderFolder = useCallback(
    (id: string, order: number) => {
      saveFoldersAndIndex(
        foldersRef.current.map((folder) => (folder.id === id ? { ...folder, order } : folder))
      )
    },
    [saveFoldersAndIndex]
  )

  const setFolderMemoryMode = useCallback(
    (id: string, memoryMode: Folder['memoryMode']) => {
      saveFoldersAndIndex(
        foldersRef.current.map((folder) => (folder.id === id ? { ...folder, memoryMode } : folder))
      )
    },
    [saveFoldersAndIndex]
  )

  const contextValue = useMemo(
    () => ({
      sessions,
      folders,
      currentSessionId,
      isLoading,
      createSession,
      switchSession,
      addMessageToSession,
      updateStreamingMessage,
      deleteMessageFromSession,
      deleteSession,
      clearAllSessions,
      updateSessionTitle,
      refreshSessions,
      clearCurrentSession,
      loadFullSession,
      getSessionMetadata,
      isSessionLoaded,
      pinSession,
      unpinSession,
      duplicateSession,
      createArtifact,
      updateArtifact,
      renameArtifact,
      restoreArtifact,
      deleteArtifact,
      assignFolder,
      removeFromFolder,
      addTag,
      removeTag,
      createFolder,
      deleteFolder,
      renameFolder,
      reorderFolder,
      setFolderMemoryMode,
    }),
    [
      sessions,
      folders,
      currentSessionId,
      isLoading,
      createSession,
      switchSession,
      addMessageToSession,
      updateStreamingMessage,
      deleteMessageFromSession,
      deleteSession,
      clearAllSessions,
      updateSessionTitle,
      refreshSessions,
      clearCurrentSession,
      loadFullSession,
      getSessionMetadata,
      isSessionLoaded,
      pinSession,
      unpinSession,
      duplicateSession,
      createArtifact,
      updateArtifact,
      renameArtifact,
      restoreArtifact,
      deleteArtifact,
      assignFolder,
      removeFromFolder,
      addTag,
      removeTag,
      createFolder,
      deleteFolder,
      renameFolder,
      reorderFolder,
      setFolderMemoryMode,
    ]
  )

  const selectableState = useMemo<ChatHistoryState>(
    () => ({
      sessions,
      folders,
      currentSessionId,
      isLoading,
    }),
    [sessions, folders, currentSessionId, isLoading]
  )

  return (
    <SelectableChatHistoryProvider value={selectableState}>
      <ChatHistoryContext.Provider value={contextValue}>{children}</ChatHistoryContext.Provider>
    </SelectableChatHistoryProvider>
  )
}

export function useChatHistory() {
  const context = useContext(ChatHistoryContext)
  if (context === undefined) {
    if (import.meta.hot) {
      warnOnceDuringHmr(
        'ChatHistoryContext',
        '[ChatHistoryContext] Context undefined during HMR, using defaults'
      )
      const noop = () => {}
      return {
        sessions: [],
        folders: [],
        currentSessionId: null,
        isLoading: true,
        createSession: () => '',
        switchSession: noop,
        addMessageToSession: () => '',
        updateStreamingMessage: noop,
        deleteMessageFromSession: noop,
        deleteSession: noop,
        clearAllSessions: noop,
        updateSessionTitle: noop,
        refreshSessions: () => Promise.resolve(),
        clearCurrentSession: noop,
        loadFullSession: () => Promise.resolve(null),
        getSessionMetadata: () => [],
        isSessionLoaded: () => false,
        pinSession: noop,
        unpinSession: noop,
        duplicateSession: noop,
        createArtifact: () => null,
        updateArtifact: () => null,
        renameArtifact: noop,
        restoreArtifact: noop,
        deleteArtifact: noop,
        assignFolder: noop,
        removeFromFolder: noop,
        addTag: noop,
        removeTag: noop,
        createFolder: () => '',
        deleteFolder: noop,
        renameFolder: noop,
        reorderFolder: noop,
        setFolderMemoryMode: noop,
      } as ChatHistoryContextType
    }
    throw new Error('useChatHistory must be used within a ChatHistoryProvider')
  }
  return context
}

export function useChatHistoryActions() {
  const context = useContext(ChatHistoryContext)
  if (context === undefined) {
    if (import.meta.hot) {
      warnOnceDuringHmr(
        'ChatHistoryContext.actions',
        '[ChatHistoryContext] Actions context undefined during HMR, using defaults'
      )
      const noop = () => {}
      return {
        createSession: () => '' as string,
        switchSession: noop,
        addMessageToSession: () => '' as string,
        updateStreamingMessage: noop,
        deleteMessageFromSession: noop,
        deleteSession: noop,
        clearAllSessions: noop,
        updateSessionTitle: noop,
        refreshSessions: () => Promise.resolve(),
        clearCurrentSession: noop,
        loadFullSession: () => Promise.resolve(null),
        getSessionMetadata: () => [] as SessionMetadata[],
        isSessionLoaded: () => false,
        pinSession: noop,
        unpinSession: noop,
        duplicateSession: noop,
        assignFolder: noop,
        removeFromFolder: noop,
        addTag: noop,
        removeTag: noop,
        createFolder: () => '' as string,
        deleteFolder: noop,
        renameFolder: noop,
        reorderFolder: noop,
        setFolderMemoryMode: noop,
      }
    }
    throw new Error('useChatHistoryActions must be used within a ChatHistoryProvider')
  }

  return useMemo(
    () => ({
      createSession: context.createSession,
      switchSession: context.switchSession,
      addMessageToSession: context.addMessageToSession,
      updateStreamingMessage: context.updateStreamingMessage,
      deleteMessageFromSession: context.deleteMessageFromSession,
      deleteSession: context.deleteSession,
      clearAllSessions: context.clearAllSessions,
      updateSessionTitle: context.updateSessionTitle,
      refreshSessions: context.refreshSessions,
      clearCurrentSession: context.clearCurrentSession,
      loadFullSession: context.loadFullSession,
      getSessionMetadata: context.getSessionMetadata,
      isSessionLoaded: context.isSessionLoaded,
      pinSession: context.pinSession,
      unpinSession: context.unpinSession,
      duplicateSession: context.duplicateSession,
      createArtifact: context.createArtifact,
      updateArtifact: context.updateArtifact,
      renameArtifact: context.renameArtifact,
      restoreArtifact: context.restoreArtifact,
      deleteArtifact: context.deleteArtifact,
      assignFolder: context.assignFolder,
      removeFromFolder: context.removeFromFolder,
      addTag: context.addTag,
      removeTag: context.removeTag,
      createFolder: context.createFolder,
      deleteFolder: context.deleteFolder,
      renameFolder: context.renameFolder,
      reorderFolder: context.reorderFolder,
      setFolderMemoryMode: context.setFolderMemoryMode,
    }),
    [
      context.createSession,
      context.switchSession,
      context.addMessageToSession,
      context.updateStreamingMessage,
      context.deleteMessageFromSession,
      context.deleteSession,
      context.clearAllSessions,
      context.updateSessionTitle,
      context.refreshSessions,
      context.clearCurrentSession,
      context.loadFullSession,
      context.getSessionMetadata,
      context.isSessionLoaded,
      context.pinSession,
      context.unpinSession,
      context.duplicateSession,
      context.createArtifact,
      context.updateArtifact,
      context.renameArtifact,
      context.restoreArtifact,
      context.deleteArtifact,
      context.assignFolder,
      context.removeFromFolder,
      context.addTag,
      context.removeTag,
      context.createFolder,
      context.deleteFolder,
      context.renameFolder,
      context.reorderFolder,
      context.setFolderMemoryMode,
    ]
  )
}

export function useFolders(): Folder[] {
  return useChatHistoryStateSelector((state) => state.folders)
}
