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
  ChatIndexData,
  ChatSession,
  ChatSessionMetadata,
  CompactPreviewMessage,
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

const isElectron = typeof window !== 'undefined' && Boolean(window.ipcRenderer)
const LAST_SESSION_ID_KEY = 'zura-ui:lastChatSessionId'
const LOCAL_CHAT_HISTORY_KEY = 'zura-chat-history'
const LOCAL_CHAT_INDEX_KEY = 'zura-chat-index'
const MAX_LOADED_SESSIONS = 3
/** Compact index preview tail — keep small; full history loads from disk on demand. */
const INDEX_RECENT_TAIL_SIZE = 20
const INDEX_PREVIEW_CONTENT_MAX = 500
const SESSION_WINDOW_SIZE = 80
const INACTIVE_UNLOAD_MS = 5 * 60 * 1000
const SAVE_DEBOUNCE_MS = 500
const INDEX_VERSION = 4

function compactMessageForIndex(message: Message): CompactPreviewMessage {
  return {
    id: message.id,
    role: message.role,
    content:
      typeof message.content === 'string'
        ? message.content.slice(0, INDEX_PREVIEW_CONTENT_MAX)
        : '',
    timestamp: message.timestamp,
    model: message.model,
    hasImage: Boolean(message.image) || undefined,
    hasFiles: Array.isArray(message.files) && message.files.length > 0 ? true : undefined,
    toolResultCount:
      Array.isArray(message.toolResults) && message.toolResults.length > 0
        ? message.toolResults.length
        : undefined,
    hasThinking:
      message.thinking ||
      (Array.isArray(message.thinkingBlocks) && message.thinkingBlocks.length > 0)
        ? true
        : undefined,
  }
}

function compactPreviewToMessage(preview: CompactPreviewMessage): Message {
  return {
    id: preview.id,
    role: preview.role,
    content: preview.content,
    timestamp: preview.timestamp,
    model: preview.model,
  }
}

function sessionToMetadata(session: ChatSession): ChatSessionMetadata {
  const messages = session.messages ?? []
  const messageCount = session.messages?.length ?? session.messageCount ?? 0

  // Compact text-only tail — never embed tool screenshots / base64 / agent runs.
  const recentMessages =
    messages.length > 0
      ? messages.slice(-INDEX_RECENT_TAIL_SIZE).map(compactMessageForIndex)
      : undefined

  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    totalTokens: session.totalTokens,
    pinned: session.pinned ?? false,
    folderId: session.folderId ?? null,
    tags: Array.isArray(session.tags) ? session.tags : [],
    messageCount,
    artifactCount: session.artifacts?.length ?? session.artifactSummaries?.length ?? 0,
    artifactSummaries: session.artifacts?.length
      ? session.artifacts.map(summarizeArtifact)
      : (session.artifactSummaries ?? undefined),
    recentMessages,
  }
}

function metadataToSession(metadata: ChatSessionMetadata, messages: Message[] = []): ChatSession {
  // Prefer provided full messages; otherwise hydrate compact text-only previews.
  const effectiveMessages =
    messages.length > 0 ? messages : (metadata.recentMessages ?? []).map(compactPreviewToMessage)
  return {
    id: metadata.id,
    title: metadata.title,
    messages: effectiveMessages,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    totalTokens: metadata.totalTokens,
    pinned: metadata.pinned,
    folderId: metadata.folderId,
    tags: [...metadata.tags],
    messageCount: metadata.messageCount,
    artifacts: [],
    artifactSummaries: metadata.artifactSummaries,
  }
}

function normalizeSession(session: ChatSession): ChatSession {
  const messages = Array.isArray(session.messages) ? session.messages : []
  return {
    ...session,
    messages,
    artifacts: normalizeArtifacts(session.artifacts),
    artifactSummaries: session.artifactSummaries,
    pinned: session.pinned ?? false,
    folderId: session.folderId ?? null,
    tags: Array.isArray(session.tags) ? session.tags : [],
    messageCount: session.messageCount ?? messages.length,
  }
}

function readLocalChatIndex(): { sessions: ChatSession[]; folders: Folder[] } {
  const savedIndex = localStorage.getItem(LOCAL_CHAT_INDEX_KEY)
  if (savedIndex) {
    try {
      const parsed = JSON.parse(savedIndex) as Partial<ChatIndexData>
      const metadata = Array.isArray(parsed.sessions) ? parsed.sessions : []
      const folders = Array.isArray(parsed.folders) ? parsed.folders : []
      return {
        sessions: metadata.map((entry) => metadataToSession(entry)),
        folders,
      }
    } catch (error) {
      console.error('Failed to parse local chat index:', error)
    }
  }

  const savedHistory = localStorage.getItem(LOCAL_CHAT_HISTORY_KEY)
  const parsedHistory = savedHistory ? (JSON.parse(savedHistory) as ChatSession[]) : []
  return {
    sessions: parsedHistory.map(normalizeSession),
    folders: [],
  }
}

function mergeArtifactDocuments(
  loadedArtifacts: unknown,
  liveArtifacts: unknown
): ArtifactDocument[] {
  const merged = new Map<string, ArtifactDocument>()
  for (const artifact of normalizeArtifacts(loadedArtifacts)) {
    merged.set(artifact.id, artifact)
  }
  for (const artifact of normalizeArtifacts(liveArtifacts)) {
    const existing = merged.get(artifact.id)
    if (!existing || artifact.updatedAt >= existing.updatedAt) {
      merged.set(artifact.id, artifact)
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt)
}

function withArtifactSummaries(session: ChatSession): ChatSession {
  const artifacts = normalizeArtifacts(session.artifacts)
  return {
    ...session,
    artifacts,
    artifactSummaries: artifacts.length > 0 ? artifacts.map(summarizeArtifact) : [],
  }
}

function mergeLoadedSessionWithLiveShell(
  loaded: ChatSession,
  latestExisting?: ChatSession
): ChatSession {
  const artifacts = mergeArtifactDocuments(loaded.artifacts, latestExisting?.artifacts)
  const artifactSummaries =
    artifacts.length > 0
      ? artifacts.map(summarizeArtifact)
      : (latestExisting?.artifactSummaries ?? loaded.artifactSummaries)

  return normalizeSession({
    ...loaded,
    ...latestExisting,
    messages: loaded.messages ?? [],
    messageCount:
      loaded.messageCount ?? loaded.messages?.length ?? latestExisting?.messageCount ?? 0,
    artifacts,
    artifactSummaries,
  })
}

function isLoadedSession(session: ChatSession): boolean {
  return session.messages.length > 0 || (session.messageCount ?? 0) === 0
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
  const loadedSessionIdsRef = useRef(new Set<string>())
  const recentLoadedSessionIdsRef = useRef<string[]>([])
  const indexSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionSaveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const pendingSessionSavesRef = useRef(new Map<string, ChatSession>())
  const localSessionRevisionRef = useRef(0)
  const savedSessionRevisionRef = useRef(0)
  const expectedSelfSessionStoreChangeRef = useRef(false)

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  useEffect(() => {
    foldersRef.current = folders
  }, [folders])

  const markSessionsDirty = useCallback(() => {
    localSessionRevisionRef.current += 1
  }, [])

  const hasUnsavedLocalSessionChanges = useCallback(
    () => localSessionRevisionRef.current > savedSessionRevisionRef.current,
    []
  )

  const flushIndexSave = useCallback(async () => {
    if (!isInitialized) return

    const revisionToSave = localSessionRevisionRef.current
    const index: ChatIndexData = {
      sessions: sessionsRef.current.map(sessionToMetadata),
      folders: foldersRef.current,
      version: INDEX_VERSION,
    }

    try {
      if (isElectron) {
        expectedSelfSessionStoreChangeRef.current = true
        await window.ipcRenderer.invoke('chat-store:save-index', index)
      } else {
        localStorage.setItem(LOCAL_CHAT_INDEX_KEY, JSON.stringify(index))
        localStorage.setItem(LOCAL_CHAT_HISTORY_KEY, JSON.stringify(sessionsRef.current))
      }

      if (localSessionRevisionRef.current === revisionToSave) {
        savedSessionRevisionRef.current = revisionToSave
      }
    } catch (error) {
      expectedSelfSessionStoreChangeRef.current = false
      console.error('Failed to save chat index:', error)
      if (!isElectron) {
        localStorage.setItem(LOCAL_CHAT_INDEX_KEY, JSON.stringify(index))
        localStorage.setItem(LOCAL_CHAT_HISTORY_KEY, JSON.stringify(sessionsRef.current))
        if (localSessionRevisionRef.current === revisionToSave) {
          savedSessionRevisionRef.current = revisionToSave
        }
      }
    }
  }, [isInitialized])

  const scheduleIndexSave = useCallback(() => {
    if (!isInitialized) return
    if (indexSaveTimerRef.current) {
      clearTimeout(indexSaveTimerRef.current)
    }
    indexSaveTimerRef.current = setTimeout(() => {
      indexSaveTimerRef.current = null
      void flushIndexSave()
    }, SAVE_DEBOUNCE_MS)
  }, [flushIndexSave, isInitialized])

  const flushSessionSave = useCallback(async (sessionId: string) => {
    const session = pendingSessionSavesRef.current.get(sessionId)
    if (!session) return
    pendingSessionSavesRef.current.delete(sessionId)

    try {
      if (isElectron) {
        expectedSelfSessionStoreChangeRef.current = true
        await window.ipcRenderer.invoke('chat-store:save-session', session)
      } else {
        localStorage.setItem(LOCAL_CHAT_HISTORY_KEY, JSON.stringify(sessionsRef.current))
      }
    } catch (error) {
      expectedSelfSessionStoreChangeRef.current = false
      console.error(`Failed to save chat session ${sessionId}:`, error)
    }
  }, [])

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

  const markLoaded = useCallback((id: string) => {
    loadedSessionIdsRef.current.add(id)
    recentLoadedSessionIdsRef.current = [
      id,
      ...recentLoadedSessionIdsRef.current.filter((candidate) => candidate !== id),
    ].slice(0, MAX_LOADED_SESSIONS)
  }, [])

  const pruneLoadedSessions = useCallback((activeId?: string | null) => {
    if (!isElectron) return

    const keep = new Set(recentLoadedSessionIdsRef.current.slice(0, MAX_LOADED_SESSIONS))
    if (activeId) keep.add(activeId)

    setSessions((prev) =>
      prev.map((session) => {
        if (keep.has(session.id)) return session
        if (!loadedSessionIdsRef.current.has(session.id)) return session
        loadedSessionIdsRef.current.delete(session.id)
        // Metadata-only: drop message arrays from inactive sessions (index has thin previews).
        return {
          ...session,
          messages: [],
          artifacts: [],
          messageCount: session.messageCount ?? session.messages.length,
        }
      })
    )
  }, [])

  const loadFullSession = useCallback(
    async (id: string, options?: { limit?: number }): Promise<ChatSession | null> => {
      const existing = sessionsRef.current.find((session) => session.id === id)
      if (!existing) return null

      // Reuse only when we already hold the full message array (not just a window).
      const haveCount = existing.messages?.length ?? 0
      const totalCount = existing.messageCount ?? haveCount
      const holdsFullHistory = haveCount >= totalCount || totalCount === 0
      const isFullyLoaded =
        loadedSessionIdsRef.current.has(id) && isLoadedSession(existing) && holdsFullHistory
      if (isFullyLoaded && !options?.limit) {
        markLoaded(id)
        pruneLoadedSessions(currentSessionId)
        return existing
      }

      try {
        const loaded = isElectron
          ? await window.ipcRenderer.invoke('chat-store:get-session', id, options)
          : (() => {
              const saved = localStorage.getItem(LOCAL_CHAT_HISTORY_KEY)
              const parsed = saved ? (JSON.parse(saved) as ChatSession[]) : []
              const found = parsed.find((session) => session.id === id) ?? null
              if (found && options?.limit && Array.isArray(found.messages)) {
                found.messages = found.messages.slice(-options.limit)
              }
              return found
            })()

        if (!loaded) return null

        const latestExisting = sessionsRef.current.find((session) => session.id === id) ?? existing
        const normalized = mergeLoadedSessionWithLiveShell(loaded, latestExisting)

        // Windowed loads count as "loaded" for UI (no spinner) and pruning eligibility.
        // Full unlimited loads also mark loaded. Incomplete thin previews do not.
        const loadedCount = normalized.messages?.length ?? 0
        const totalCount = normalized.messageCount ?? loadedCount
        const isWindowComplete =
          !options?.limit || loadedCount >= Math.min(options.limit, totalCount) || totalCount === 0
        if (isWindowComplete) {
          markLoaded(id)
        }
        setSessions((prev) => prev.map((session) => (session.id === id ? normalized : session)))
        pruneLoadedSessions(id)
        return normalized
      } catch (error) {
        console.error('Failed to load session:', error)
        return null
      }
    },
    [currentSessionId, markLoaded, pruneLoadedSessions]
  )

  const loadSessions = useCallback(async () => {
    try {
      if (isElectron) {
        let metadata = await window.ipcRenderer.invoke('chat-store:get-metadata')

        if (metadata.length === 0) {
          const localData = localStorage.getItem(LOCAL_CHAT_HISTORY_KEY)
          if (localData) {
            const parsed = JSON.parse(localData)
            if (Array.isArray(parsed) && parsed.length > 0) {
              await window.ipcRenderer.invoke('chat-store:migrate', parsed)
              localStorage.removeItem(LOCAL_CHAT_HISTORY_KEY)
              metadata = await window.ipcRenderer.invoke('chat-store:get-metadata')
            }
          }
        }

        setSessions(metadata.map((entry) => metadataToSession(entry)))
        setFolders(await window.ipcRenderer.invoke('chat-store:get-all-folders'))
      } else {
        const localState = readLocalChatIndex()
        localState.sessions.forEach((session) => markLoaded(session.id))
        setSessions(localState.sessions)
        setFolders(localState.folders)
      }
    } catch (error) {
      console.error('Failed to load chat history:', error)
      const saved = localStorage.getItem(LOCAL_CHAT_HISTORY_KEY)
      const parsed = saved ? (JSON.parse(saved) as ChatSession[]) : []
      setSessions(parsed.map(normalizeSession))
    } finally {
      savedSessionRevisionRef.current = localSessionRevisionRef.current
      setIsLoading(false)
      setIsInitialized(true)
    }
  }, [markLoaded])

  const reloadFromExternalStore = useCallback(async () => {
    try {
      if (isElectron) {
        const metadata = await window.ipcRenderer.invoke('chat-store:get-metadata')
        const nextFolders = await window.ipcRenderer.invoke('chat-store:get-all-folders')
        loadedSessionIdsRef.current.clear()
        recentLoadedSessionIdsRef.current = []
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

      savedSessionRevisionRef.current = localSessionRevisionRef.current
      setHasExternalStoreChanges(false)
    } catch (error) {
      console.error('Failed to reload chat history from external store:', error)
    }
  }, [markLoaded])

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
      const keep = new Set(recentLoadedSessionIdsRef.current.slice(0, MAX_LOADED_SESSIONS))
      if (activeId) keep.add(activeId)
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
      if (expectedSelfSessionStoreChangeRef.current) {
        expectedSelfSessionStoreChangeRef.current = false
        return
      }
      setHasExternalStoreChanges(true)
    }

    window.ipcRenderer.on('chat-store:changed', handleChatStoreChanged)
    return () => {
      window.ipcRenderer.off('chat-store:changed', handleChatStoreChanged)
    }
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

  useEffect(() => {
    return () => {
      if (indexSaveTimerRef.current) clearTimeout(indexSaveTimerRef.current)
      for (const timer of sessionSaveTimersRef.current.values()) {
        clearTimeout(timer)
      }
      sessionSaveTimersRef.current.clear()
    }
  }, [])

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
          const fullSession = await window.ipcRenderer.invoke('chat-store:get-session', sessionId)
          if (!fullSession) return

          const latestExisting = sessionsRef.current.find((session) => session.id === sessionId)
          const mergedBase = mergeLoadedSessionWithLiveShell(fullSession, latestExisting)
          const nextSession = withArtifactSummaries(normalizeSession(updater(mergedBase)))

          expectedSelfSessionStoreChangeRef.current = true
          await window.ipcRenderer.invoke('chat-store:save-session', nextSession)
        } catch (error) {
          expectedSelfSessionStoreChangeRef.current = false
          console.error(`Failed to persist artifact mutation for session ${sessionId}:`, error)
        }
      })()
    },
    []
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
      loadedSessionIdsRef.current.delete(id)
      recentLoadedSessionIdsRef.current = recentLoadedSessionIdsRef.current.filter(
        (entry) => entry !== id
      )
      setSessions((prev) => prev.filter((session) => session.id !== id))
      setCurrentSessionId((prev) => (prev === id ? null : prev))
      if (isElectron) {
        expectedSelfSessionStoreChangeRef.current = true
        void window.ipcRenderer.invoke('chat-store:delete-session', id)
      } else {
        scheduleIndexSave()
      }
    },
    [markSessionsDirty, scheduleIndexSave]
  )

  const clearAllSessions = useCallback(() => {
    markSessionsDirty()
    const ids = sessionsRef.current.map((session) => session.id)
    loadedSessionIdsRef.current.clear()
    recentLoadedSessionIdsRef.current = []
    setSessions([])
    setCurrentSessionId(null)
    if (isElectron) {
      expectedSelfSessionStoreChangeRef.current = true
      void Promise.all(
        ids.map((id) => window.ipcRenderer.invoke('chat-store:delete-session', id))
      ).then(() =>
        window.ipcRenderer.invoke('chat-store:save-index', {
          sessions: [],
          folders: foldersRef.current,
          version: INDEX_VERSION,
        })
      )
    } else {
      localStorage.setItem(LOCAL_CHAT_HISTORY_KEY, '[]')
      localStorage.setItem(
        LOCAL_CHAT_INDEX_KEY,
        JSON.stringify({ sessions: [], folders: foldersRef.current, version: INDEX_VERSION })
      )
    }
  }, [markSessionsDirty])

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
      updateOneSession(id, (session) => ({ ...session, pinned: true, updatedAt: Date.now() }))
    },
    [updateOneSession]
  )

  const unpinSession = useCallback(
    (id: string) => {
      updateOneSession(id, (session) => ({ ...session, pinned: false, updatedAt: Date.now() }))
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
      updateOneSession(sessionId, (session) => ({ ...session, folderId, updatedAt: Date.now() }))
    },
    [updateOneSession]
  )

  const removeFromFolder = useCallback(
    (sessionId: string) => {
      updateOneSession(sessionId, (session) => ({
        ...session,
        folderId: null,
        updatedAt: Date.now(),
      }))
    },
    [updateOneSession]
  )

  const addTag = useCallback(
    (sessionId: string, tag: string) => {
      updateOneSession(sessionId, (session) => {
        const currentTags = session.tags || []
        if (currentTags.includes(tag)) return session
        return { ...session, tags: [...currentTags, tag], updatedAt: Date.now() }
      })
    },
    [updateOneSession]
  )

  const removeTag = useCallback(
    (sessionId: string, tag: string) => {
      updateOneSession(sessionId, (session) => {
        const currentTags = session.tags || []
        return {
          ...session,
          tags: currentTags.filter((entry) => entry !== tag),
          updatedAt: Date.now(),
        }
      })
    },
    [updateOneSession]
  )

  const saveFoldersAndIndex = useCallback(
    (nextFolders: Folder[]) => {
      foldersRef.current = nextFolders
      setFolders(nextFolders)
      markSessionsDirty()
      if (indexSaveTimerRef.current) {
        clearTimeout(indexSaveTimerRef.current)
        indexSaveTimerRef.current = null
      }
      void flushIndexSave()
    },
    [flushIndexSave, markSessionsDirty]
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
      const nextFolders = foldersRef.current.filter((folder) => folder.id !== id)
      const nextSessions = sessionsRef.current.map((session) =>
        session.folderId === id ? { ...session, folderId: null, updatedAt: now } : session
      )

      foldersRef.current = nextFolders
      sessionsRef.current = nextSessions
      setFolders(nextFolders)
      setSessions(nextSessions)
      markSessionsDirty()
      if (indexSaveTimerRef.current) {
        clearTimeout(indexSaveTimerRef.current)
        indexSaveTimerRef.current = null
      }
      void flushIndexSave()
    },
    [flushIndexSave, markSessionsDirty]
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
