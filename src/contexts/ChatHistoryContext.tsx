/**
 * ChatHistoryContext - Chat session management with selector-based subscriptions
 * 
 * This module provides chat history management with optimized re-rendering through
 * a selector-based subscription pattern. Components can subscribe to specific parts
 * of the chat state to prevent unnecessary re-renders.
 * 
 * **Validates: Requirements 8.2**
 * - THE ChatHistoryContext SHALL implement a selector pattern to allow components
 *   to subscribe to specific session data
 * 
 * Available hooks:
 * - useChatHistory() - Full context access (backward compatible)
 * - useChatHistorySelector(selector) - Subscribe to specific state slice
 * - useSessionsList() - Get sessions list only
 * - useCurrentSession() - Get current session only
 * - useCurrentSessionId() - Get current session ID only
 * - useIsLoading() - Get loading state only
 * - useSessionById(id) - Get a specific session by ID
 * 
 * @module ChatHistoryContext
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSettings } from './SettingsContext'
import { ChatSessionManager, type SessionMetadata } from './ChatSessionManager'
import { createSelectableContext, shallowEqual, type Selector } from './createSelectableContext'

// Re-export SessionMetadata for consumers
export type { SessionMetadata } from './ChatSessionManager'

export interface ToolCallResult {
    toolCall: {
        id: string
        name: string
        arguments: Record<string, unknown>
    }
    result: {
        success: boolean
        data?: unknown
        error?: string
        executionTime?: number
    }
}

export interface FileAttachment {
    id: string
    name: string
    type: string
    size: number
    data: string // base64 encoded data
    mimeType: string
}

export interface ThinkingBlock {
    type: 'thinking' | 'searching'
    content?: string // For thinking blocks
    query?: string // For searching blocks
    duration?: number // Duration in milliseconds (for thinking)
    timestamp: number // When this block was created
    /** Tool call arguments (for searching blocks - JSON input) */
    toolInput?: Record<string, unknown>
    /** Tool call result (for searching blocks - JSON output) */
    toolOutput?: { success: boolean; data?: unknown; error?: string; executionTime?: number }
}

export interface ResponseVersion {
    id: string
    content: string
    timestamp: number
    instruction?: string // e.g., "more concise", "add details"
    model?: string
}

export interface Message {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    image?: string // Legacy field for backward compatibility
    files?: FileAttachment[] // New field for multiple file attachments
    timestamp: number
    tokenCount?: number
    model?: string
    latency?: number
    thinking?: string
    thinkingDuration?: number
    thinkingBlocks?: ThinkingBlock[] // Array of completed thinking/search blocks
    toolResults?: ToolCallResult[]
    researchStatus?: {
        currentRound: number
        maxRounds: number
        currentSearch?: string // The search query being executed
        isSearching: boolean
    }
    /** Structured research plan (step-by-step mode) */
    researchPlan?: { topic: string; steps: Array<{ stepNumber: number; query: string; rationale?: string }> }
    /** Progress during structured research execution */
    researchProgress?: { currentStep: number; totalSteps: number; currentQuery?: string }
    usage?: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
        thinkingTokens?: number // Reasoning/thinking tokens used
        tps?: number // Tokens per second
        ttft?: number // Time to first token (ms)
        cachedInputTokens?: number
        cachedOutputTokens?: number
    }
    finishReason?: string
    requestedMaxTokens?: number
    responseVersions?: ResponseVersion[] // Previous response versions
    currentVersionIndex?: number // Which version is currently displayed
}

export interface ChatSession {
    id: string
    title: string
    messages: Message[]
    createdAt: number
    updatedAt: number
    totalTokens?: number
    // Sidebar redesign fields (Requirements 11.1, 11.2, 11.3, 11.4)
    pinned?: boolean          // default: false
    folderId?: string | null  // default: null
    tags?: string[]           // default: []
}

/**
 * Folder definition for organizing chat sessions.
 * Validates: Requirement 11.6
 */
export interface Folder {
    id: string
    name: string
    order: number    // for display ordering
    createdAt: number
}

interface ChatHistoryContextType {
    sessions: ChatSession[]
    folders: Folder[]
    currentSessionId: string | null
    isLoading: boolean
    createSession: (firstMessage?: string) => string
    switchSession: (id: string) => void
    addMessageToSession: (sessionId: string, message: Omit<Message, 'id' | 'timestamp'>) => string
    updateStreamingMessage: (sessionId: string, messageId: string, updates: Partial<Message>) => void
    deleteMessageFromSession: (sessionId: string, messageId: string) => void
    deleteSession: (id: string) => void
    clearAllSessions: () => void
    updateSessionTitle: (id: string, title: string) => void
    refreshSessions: () => Promise<void>
    clearCurrentSession: () => void
    /** Load full session content on demand. Returns the loaded session or null if not found.
     * Validates: Requirement 4.2 - Load full message content on demand */
    loadFullSession: (id: string) => Promise<ChatSession | null>
    /** Get session metadata without loading full content */
    getSessionMetadata: () => SessionMetadata[]
    /** Check if a session's full content is currently loaded in memory */
    isSessionLoaded: (id: string) => boolean

    // Sidebar redesign: Pin operations (Requirements 5.4, 5.5)
    pinSession: (id: string) => void
    unpinSession: (id: string) => void

    // Sidebar redesign: Duplicate operation (Requirement 7.8)
    duplicateSession: (id: string) => void

    // Sidebar redesign: Folder assignment (Requirements 8.3, 8.4)
    assignFolder: (sessionId: string, folderId: string) => void
    removeFromFolder: (sessionId: string) => void

    // Sidebar redesign: Tag operations (Requirements 8.5, 8.6)
    addTag: (sessionId: string, tag: string) => void
    removeTag: (sessionId: string, tag: string) => void

    // Sidebar redesign: Folder CRUD (Requirements 8.1, 8.2)
    createFolder: (name: string) => string
    deleteFolder: (id: string) => void
    renameFolder: (id: string, name: string) => void
    reorderFolder: (id: string, order: number) => void
}

/**
 * State interface for the selectable context
 * This represents the state that can be selected from
 * 
 * **Validates: Requirements 8.2**
 */
interface ChatHistoryState {
    sessions: ChatSession[]
    folders: Folder[]
    currentSessionId: string | null
    isLoading: boolean
}

/**
 * Create the selectable context for optimized subscriptions
 * Components can use useSelector to subscribe to specific state slices
 * 
 * **Validates: Requirements 8.2**
 */
const {
    Provider: SelectableChatHistoryProvider,
    useSelector: useChatHistoryStateSelector,
    useStore: _useChatHistoryStore,
} = createSelectableContext<ChatHistoryState>()

const ChatHistoryContext = createContext<ChatHistoryContextType | undefined>(undefined)

// Check if we're in Electron environment
const isElectron = typeof window !== 'undefined' && Boolean(window.ipcRenderer)
const LAST_SESSION_ID_KEY = 'zura-ui:lastChatSessionId'

export function ChatHistoryProvider({ children }: { children: React.ReactNode }) {
    const { settings } = useSettings()
    const [sessions, setSessions] = useState<ChatSession[]>([])
    const [folders, setFolders] = useState<Folder[]>([])
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isInitialized, setIsInitialized] = useState(false)

    // ChatSessionManager instance for lazy loading
    // Validates: Requirements 4.1, 4.2, 4.4, 4.5
    const sessionManagerRef = useRef<ChatSessionManager | null>(null)

    // Initialize the session manager with loader functions
    const getSessionManager = useCallback(() => {
        if (!sessionManagerRef.current) {
            // Session loader - loads a single session by ID
            const sessionLoader = async (id: string): Promise<ChatSession | null> => {
                try {
                    if (isElectron) {
                        const allSessions = await window.ipcRenderer.invoke('chat-store:get-all') as ChatSession[] | undefined
                        return allSessions?.find((s: ChatSession) => s.id === id) ?? null
                    } else {
                        const saved = localStorage.getItem('zura-chat-history')
                        const parsed = saved ? JSON.parse(saved) : []
                        return parsed.find((s: ChatSession) => s.id === id) ?? null
                    }
                } catch (error) {
                    console.error('Failed to load session:', error)
                    return null
                }
            }

            // All sessions loader - loads all sessions (used for metadata extraction)
            const allSessionsLoader = async (): Promise<ChatSession[]> => {
                try {
                    if (isElectron) {
                        const storedSessions = await window.ipcRenderer.invoke('chat-store:get-all') as ChatSession[] | undefined
                        return storedSessions || []
                    } else {
                        const saved = localStorage.getItem('zura-chat-history')
                        return saved ? JSON.parse(saved) : []
                    }
                } catch (error) {
                    console.error('Failed to load all sessions:', error)
                    const saved = localStorage.getItem('zura-chat-history')
                    return saved ? JSON.parse(saved) : []
                }
            }

            sessionManagerRef.current = new ChatSessionManager(
                sessionLoader,
                allSessionsLoader,
                {
                    maxLoadedSessions: 3,
                    unloadAfterMs: 300000, // 5 minutes
                    preloadMessageCount: 20,
                }
            )
        }
        return sessionManagerRef.current
    }, [])

    // Load sessions - now loads metadata only initially
    // Validates: Requirement 4.1 - Load only session metadata initially
    const loadSessions = useCallback(async () => {
        try {
            const manager = getSessionManager()
            
            // Initialize the manager (loads metadata for all sessions)
            await manager.initialize()
            
            // Get metadata and create lightweight session objects for backward compatibility
            // Sessions without full messages loaded will have empty messages array
            manager.getSessionMetadata()
            
            // For backward compatibility, we need to provide sessions with messages
            // Load full data for all sessions initially (will be optimized in future)
            // This maintains backward compatibility while setting up the infrastructure
            let fullSessions: ChatSession[] = []
            
            if (isElectron) {
                const storedSessions = await window.ipcRenderer.invoke('chat-store:get-all') as ChatSession[] | undefined
                fullSessions = storedSessions || []
            } else {
                const saved = localStorage.getItem('zura-chat-history')
                fullSessions = saved ? JSON.parse(saved) : []
            }
            
            // Update the manager with full session data
            for (const session of fullSessions) {
                manager.addSession(session)
            }
            
            setSessions(fullSessions)

            // Load folders from IPC (sidebar redesign)
            // Validates: Requirements 8.1, 8.2
            if (isElectron) {
                try {
                    const storedFolders = await window.ipcRenderer.invoke('chat-store:get-all-folders') as Folder[] | undefined
                    setFolders(storedFolders || [])
                } catch (folderError) {
                    console.error('Failed to load folders:', folderError)
                    setFolders([])
                }
            }
        } catch (error) {
            console.error('Failed to load chat history:', error)
            // Fallback to localStorage
            const saved = localStorage.getItem('zura-chat-history')
            setSessions(saved ? JSON.parse(saved) : [])
        } finally {
            setIsLoading(false)
            setIsInitialized(true)
        }
    }, [getSessionManager])

    // Initialize and migrate from localStorage if needed
    useEffect(() => {
        const initializeStore = async () => {
            if (isElectron) {
                try {
                    // Check if electron-store has data
                    const storedSessions = await window.ipcRenderer.invoke('chat-store:get-all') as ChatSession[] | undefined

                    // If empty, try to migrate from localStorage
                    if (!storedSessions || (storedSessions as ChatSession[]).length === 0) {
                        const localData = localStorage.getItem('zura-chat-history')
                        if (localData) {
                            const parsed = JSON.parse(localData)
                            if (parsed && parsed.length > 0) {
                                await window.ipcRenderer.invoke('chat-store:migrate', parsed)
                                localStorage.removeItem('zura-chat-history')
                            }
                        }
                    }
                } catch (error) {
                    console.error('Migration failed:', error)
                }
            }

            await loadSessions()
        }

        initializeStore()
    }, [loadSessions])

    // Start auto-cleanup when initialized
    useEffect(() => {
        if (!isInitialized) return
        
        const manager = getSessionManager()
        manager.startAutoCleanup()
        
        return () => {
            manager.stopAutoCleanup()
        }
    }, [isInitialized, getSessionManager])

    // Save sessions whenever they change (after initialization)
    // Debounced to avoid excessive IPC/disk writes during streaming.
    // Requirements: 3.5 - Debounce writes with a minimum delay of 1 second
    useEffect(() => {
        if (!isInitialized) return

        const timeoutId = setTimeout(() => {
            const saveSessions = async () => {
                try {
                    if (isElectron) {
                        await window.ipcRenderer.invoke('chat-store:save-all', sessions)
                    } else {
                        localStorage.setItem('zura-chat-history', JSON.stringify(sessions))
                    }
                } catch (error) {
                    console.error('Failed to save chat history:', error)
                    // Fallback to localStorage
                    localStorage.setItem('zura-chat-history', JSON.stringify(sessions))
                }
            }

            void saveSessions()
        }, 1000)

        return () => clearTimeout(timeoutId)
    }, [sessions, isInitialized])

    // Save folders whenever they change (after initialization)
    // Debounced to avoid excessive IPC/disk writes.
    // Validates: Requirements 8.1, 8.2 (folder persistence)
    useEffect(() => {
        if (!isInitialized) return

        const timeoutId = setTimeout(() => {
            const saveFolders = async () => {
                try {
                    if (isElectron) {
                        await window.ipcRenderer.invoke('chat-store:save-folders', folders)
                    }
                } catch (error) {
                    console.error('Failed to save folders:', error)
                }
            }

            void saveFolders()
        }, 1000)

        return () => clearTimeout(timeoutId)
    }, [folders, isInitialized])

    // Restore last active chat session (optional)
    useEffect(() => {
        if (!isInitialized) return
        if (currentSessionId) return
        if (!settings.rememberLastChatSession) return

        const rememberedId = localStorage.getItem(LAST_SESSION_ID_KEY)
        if (!rememberedId) return
        if (sessions.some(s => s.id === rememberedId)) {
            setCurrentSessionId(rememberedId)
        }
    }, [currentSessionId, isInitialized, sessions, settings.rememberLastChatSession])

    // Persist last active chat session (optional)
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
        await loadSessions()
    }, [loadSessions])

    const createSession = useCallback((firstMessage?: string) => {
        const now = Date.now()
        const normalizedFirstMessage = typeof firstMessage === 'string' ? firstMessage.trim() : ''

        let nextSessionId = ''

        setSessions(prev => {
            // If no first message is provided, try to reuse an existing empty "New Chat"
            // session instead of creating a pile of empty chats.
            if (!normalizedFirstMessage) {
                const existingIndex = prev.findIndex(s => s.title === 'New Chat' && (!s.messages || s.messages.length === 0))
                if (existingIndex >= 0) {
                    const existing = prev[existingIndex]
                    nextSessionId = existing.id

                    const updatedExisting: ChatSession = {
                        ...existing,
                        updatedAt: now,
                    }

                    // Update the session manager
                    const manager = getSessionManager()
                    manager.updateMetadata(existing.id, { updatedAt: now })

                    // Move the reused empty session to the top for a consistent UX.
                    return [updatedExisting, ...prev.slice(0, existingIndex), ...prev.slice(existingIndex + 1)]
                }
            }

            const initialMessages: Message[] = normalizedFirstMessage ? [{
                id: crypto.randomUUID(),
                role: 'user',
                content: normalizedFirstMessage,
                timestamp: now
            }] : []

            const newSession: ChatSession = {
                id: crypto.randomUUID(),
                title: normalizedFirstMessage
                    ? (normalizedFirstMessage.slice(0, 30) + (normalizedFirstMessage.length > 30 ? '...' : ''))
                    : 'New Chat',
                messages: initialMessages,
                createdAt: now,
                updatedAt: now
            }

            // Add to session manager
            const manager = getSessionManager()
            manager.addSession(newSession)

            nextSessionId = newSession.id
            return [newSession, ...prev]
        })

        setCurrentSessionId(nextSessionId)
        return nextSessionId
    }, [getSessionManager])

    // Load full session content on demand
    // Validates: Requirement 4.2 - Load full message content on demand
    const loadFullSession = useCallback(async (id: string): Promise<ChatSession | null> => {
        const manager = getSessionManager()
        const loadedSession = await manager.loadSession(id)
        
        if (!loadedSession) {
            return null
        }

        // Convert LoadedSession to ChatSession format
        const chatSession: ChatSession = {
            id: loadedSession.metadata.id,
            title: loadedSession.metadata.title,
            messages: loadedSession.messages,
            createdAt: loadedSession.metadata.createdAt,
            updatedAt: loadedSession.metadata.updatedAt,
        }

        // Update the sessions state to include the full messages
        setSessions(prev => prev.map(s => 
            s.id === id ? chatSession : s
        ))

        return chatSession
    }, [getSessionManager])

    // Get session metadata without loading full content
    const getSessionMetadata = useCallback((): SessionMetadata[] => {
        const manager = getSessionManager()
        return manager.getSessionMetadata()
    }, [getSessionManager])

    // Check if a session is currently loaded in memory
    const isSessionLoaded = useCallback((id: string): boolean => {
        const manager = getSessionManager()
        return manager.isSessionLoaded(id)
    }, [getSessionManager])

    const switchSession = useCallback((id: string) => {
        setSessions(prev => {
            if (prev.find(s => s.id === id)) {
                setCurrentSessionId(id)
                
                // Load full session content on demand when switching
                // Validates: Requirement 4.2 - Load full message content on demand
                const manager = getSessionManager()
                if (!manager.isSessionLoaded(id)) {
                    // Load asynchronously - the session will be updated when loaded
                    manager.loadSession(id).then(loadedSession => {
                        if (loadedSession) {
                            setSessions(current => current.map(s => 
                                s.id === id ? {
                                    ...s,
                                    messages: loadedSession.messages,
                                    updatedAt: loadedSession.metadata.updatedAt,
                                } : s
                            ))
                        }
                    }).catch(error => {
                        console.error('Failed to load session on switch:', error)
                    })
                }
            }
            return prev
        })
    }, [getSessionManager])

    const addMessageToSession = useCallback((sessionId: string, message: Omit<Message, 'id' | 'timestamp'>): string => {
        const newMessage: Message = {
            ...message,
            id: crypto.randomUUID(),
            timestamp: Date.now()
        }

        setSessions(prev => prev.map(session => {
            if (session.id === sessionId) {
                // If this is the first user message and title is generic, update title
                let newTitle = session.title
                if (session.messages.length === 0 && message.role === 'user') {
                    newTitle = message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '')
                }

                const updatedSession = {
                    ...session,
                    title: newTitle,
                    messages: [...session.messages, newMessage],
                    updatedAt: Date.now()
                }

                // Update the session manager
                const manager = getSessionManager()
                manager.updateLoadedSessionMessages(sessionId, updatedSession.messages)
                manager.updateMetadata(sessionId, { 
                    title: newTitle, 
                    updatedAt: updatedSession.updatedAt,
                    messageCount: updatedSession.messages.length 
                })

                return updatedSession
            }
            return session
        }))
        
        return newMessage.id
    }, [getSessionManager])

    const updateStreamingMessage = useCallback((sessionId: string, messageId: string, updates: Partial<Message>) => {
        setSessions(prev => prev.map(session => {
            if (session.id === sessionId) {
                const updatedMessages = session.messages.map(msg =>
                    msg.id === messageId ? { ...msg, ...updates } : msg
                )
                
                const updatedSession = {
                    ...session,
                    messages: updatedMessages,
                    updatedAt: Date.now()
                }

                // Update the session manager with the new messages
                const manager = getSessionManager()
                manager.updateLoadedSessionMessages(sessionId, updatedMessages)

                return updatedSession
            }
            return session
        }))
    }, [getSessionManager])

    const deleteSession = useCallback((id: string) => {
        // Remove from session manager
        const manager = getSessionManager()
        manager.removeSession(id)

        setSessions(prev => prev.filter(s => s.id !== id))
        setCurrentSessionId(prev => prev === id ? null : prev)
    }, [getSessionManager])

    const clearAllSessions = useCallback(() => {
        // Clear the session manager
        const manager = getSessionManager()
        manager.clear()

        setSessions([])
        setCurrentSessionId(null)
    }, [getSessionManager])

    const updateSessionTitle = useCallback((id: string, title: string) => {
        // Update in session manager
        const manager = getSessionManager()
        manager.updateMetadata(id, { title })

        setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s))
    }, [getSessionManager])

    const clearCurrentSession = useCallback(() => {
        // Clear the remembered session so it doesn't auto-restore
        localStorage.removeItem(LAST_SESSION_ID_KEY)
        setCurrentSessionId(null)
    }, [])

    const deleteMessageFromSession = useCallback((sessionId: string, messageId: string) => {
        setSessions(prev => prev.map(session => {
            if (session.id === sessionId) {
                const updatedMessages = session.messages.filter(msg => msg.id !== messageId)
                
                const updatedSession = {
                    ...session,
                    messages: updatedMessages,
                    updatedAt: Date.now()
                }

                // Update the session manager
                const manager = getSessionManager()
                manager.updateLoadedSessionMessages(sessionId, updatedMessages)
                manager.updateMetadata(sessionId, { 
                    updatedAt: updatedSession.updatedAt,
                    messageCount: updatedMessages.length 
                })

                return updatedSession
            }
            return session
        }))
    }, [getSessionManager])

    // =========================================================================
    // Sidebar redesign: Pin operations (Requirements 5.4, 5.5)
    // =========================================================================

    const pinSession = useCallback((id: string) => {
        setSessions(prev => prev.map(s =>
            s.id === id ? { ...s, pinned: true, updatedAt: Date.now() } : s
        ))
    }, [])

    const unpinSession = useCallback((id: string) => {
        setSessions(prev => prev.map(s =>
            s.id === id ? { ...s, pinned: false, updatedAt: Date.now() } : s
        ))
    }, [])

    // =========================================================================
    // Sidebar redesign: Duplicate operation (Requirement 7.8)
    // =========================================================================

    const duplicateSession = useCallback((id: string) => {
        setSessions(prev => {
            const original = prev.find(s => s.id === id)
            if (!original) return prev

            const now = Date.now()
            const newSession: ChatSession = {
                id: crypto.randomUUID(),
                title: `Copy of ${original.title}`,
                messages: original.messages.map(msg => ({
                    ...msg,
                    id: crypto.randomUUID(),
                    timestamp: msg.timestamp,
                })),
                createdAt: now,
                updatedAt: now,
                totalTokens: original.totalTokens,
                pinned: false,
                folderId: original.folderId,
                tags: [...(original.tags || [])],
            }

            // Add to session manager
            const manager = getSessionManager()
            manager.addSession(newSession)

            return [newSession, ...prev]
        })
    }, [getSessionManager])

    // =========================================================================
    // Sidebar redesign: Folder assignment (Requirements 8.3, 8.4)
    // =========================================================================

    const assignFolder = useCallback((sessionId: string, folderId: string) => {
        setSessions(prev => prev.map(s =>
            s.id === sessionId ? { ...s, folderId, updatedAt: Date.now() } : s
        ))
    }, [])

    const removeFromFolder = useCallback((sessionId: string) => {
        setSessions(prev => prev.map(s =>
            s.id === sessionId ? { ...s, folderId: null, updatedAt: Date.now() } : s
        ))
    }, [])

    // =========================================================================
    // Sidebar redesign: Tag operations (Requirements 8.5, 8.6)
    // =========================================================================

    const addTag = useCallback((sessionId: string, tag: string) => {
        setSessions(prev => prev.map(s => {
            if (s.id !== sessionId) return s
            const currentTags = s.tags || []
            // Avoid duplicate tags
            if (currentTags.includes(tag)) return s
            return { ...s, tags: [...currentTags, tag], updatedAt: Date.now() }
        }))
    }, [])

    const removeTag = useCallback((sessionId: string, tag: string) => {
        setSessions(prev => prev.map(s => {
            if (s.id !== sessionId) return s
            const currentTags = s.tags || []
            return { ...s, tags: currentTags.filter(t => t !== tag), updatedAt: Date.now() }
        }))
    }, [])

    // =========================================================================
    // Sidebar redesign: Folder CRUD (Requirements 8.1, 8.2)
    // =========================================================================

    const createFolder = useCallback((name: string): string => {
        const newFolder: Folder = {
            id: crypto.randomUUID(),
            name,
            order: 0,
            createdAt: Date.now(),
        }

        setFolders(prev => {
            // New folder gets order = max existing order + 1
            const maxOrder = prev.reduce((max, f) => Math.max(max, f.order), -1)
            newFolder.order = maxOrder + 1
            return [...prev, newFolder]
        })

        return newFolder.id
    }, [])

    const deleteFolder = useCallback((id: string) => {
        // Remove folder and unassign all sessions from it
        setFolders(prev => prev.filter(f => f.id !== id))
        setSessions(prev => prev.map(s =>
            s.folderId === id ? { ...s, folderId: null, updatedAt: Date.now() } : s
        ))
    }, [])

    const renameFolder = useCallback((id: string, name: string) => {
        setFolders(prev => prev.map(f =>
            f.id === id ? { ...f, name } : f
        ))
    }, [])

    const reorderFolder = useCallback((id: string, order: number) => {
        setFolders(prev => prev.map(f =>
            f.id === id ? { ...f, order } : f
        ))
    }, [])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (sessionManagerRef.current) {
                sessionManagerRef.current.dispose()
            }
        }
    }, [])

    const contextValue = useMemo(() => ({
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
        // Sidebar redesign actions
        pinSession,
        unpinSession,
        duplicateSession,
        assignFolder,
        removeFromFolder,
        addTag,
        removeTag,
        createFolder,
        deleteFolder,
        renameFolder,
        reorderFolder,
    }), [
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
        // Sidebar redesign actions
        pinSession,
        unpinSession,
        duplicateSession,
        assignFolder,
        removeFromFolder,
        addTag,
        removeTag,
        createFolder,
        deleteFolder,
        renameFolder,
        reorderFolder,
    ])

    // Memoized state for the selectable context
    // This allows components to subscribe to specific state slices
    // **Validates: Requirements 8.2**
    const selectableState = useMemo<ChatHistoryState>(() => ({
        sessions,
        folders,
        currentSessionId,
        isLoading,
    }), [sessions, folders, currentSessionId, isLoading])

    return (
        <SelectableChatHistoryProvider value={selectableState}>
            <ChatHistoryContext.Provider value={contextValue}>
                {children}
            </ChatHistoryContext.Provider>
        </SelectableChatHistoryProvider>
    )
}

export function useChatHistory() {
    const context = useContext(ChatHistoryContext)
    if (context === undefined) {
        throw new Error('useChatHistory must be used within a ChatHistoryProvider')
    }
    return context
}

// ============================================================================
// Selector-based hooks for optimized re-rendering
// **Validates: Requirements 8.2 - Property 29: Chat History Selector Pattern**
// ============================================================================

/**
 * Generic selector hook for ChatHistoryContext state
 * Use this to subscribe to specific parts of the state
 * 
 * @example
 * ```tsx
 * // Only re-renders when sessions array changes
 * const sessions = useChatHistorySelector(state => state.sessions)
 * 
 * // Only re-renders when currentSessionId changes
 * const currentId = useChatHistorySelector(state => state.currentSessionId)
 * ```
 * 
 * **Validates: Requirements 8.2**
 */
export function useChatHistorySelector<R>(
    selector: Selector<ChatHistoryState, R>,
    equalityFn?: (a: R, b: R) => boolean
): R {
    return useChatHistoryStateSelector(selector, equalityFn)
}

/**
 * Get the sessions list only
 * Only re-renders when the sessions array changes
 * 
 * **Validates: Requirements 8.2**
 */
export function useSessionsList(): ChatSession[] {
    return useChatHistoryStateSelector(state => state.sessions)
}

/**
 * Get the current session ID only
 * Only re-renders when the current session ID changes
 * 
 * **Validates: Requirements 8.2**
 */
export function useCurrentSessionId(): string | null {
    return useChatHistoryStateSelector(state => state.currentSessionId)
}

/**
 * Get the current session object
 * Only re-renders when the current session changes
 * Uses shallow equality to prevent re-renders when session content is the same
 * 
 * **Validates: Requirements 8.2**
 */
export function useCurrentSession(): ChatSession | null {
    return useChatHistoryStateSelector(
        state => {
            if (!state.currentSessionId) return null
            return state.sessions.find(s => s.id === state.currentSessionId) ?? null
        },
        // Use reference equality - the session object reference changes when updated
        (a, b) => a === b
    )
}

/**
 * Get the loading state only
 * Only re-renders when the loading state changes
 * 
 * **Validates: Requirements 8.2**
 */
export function useIsLoading(): boolean {
    return useChatHistoryStateSelector(state => state.isLoading)
}

/**
 * Get a specific session by ID
 * Only re-renders when that specific session changes
 * 
 * @param id - The session ID to get
 * @returns The session or null if not found
 * 
 * **Validates: Requirements 8.2**
 */
export function useSessionById(id: string | null): ChatSession | null {
    return useChatHistoryStateSelector(
        state => {
            if (!id) return null
            return state.sessions.find(s => s.id === id) ?? null
        },
        // Use reference equality
        (a, b) => a === b
    )
}

/**
 * Get the total number of sessions
 * Only re-renders when the count changes
 * 
 * **Validates: Requirements 8.2**
 */
export function useSessionsCount(): number {
    return useChatHistoryStateSelector(state => state.sessions.length)
}

/**
 * Get the messages for the current session
 * Only re-renders when the current session's messages change
 * 
 * **Validates: Requirements 8.2**
 */
export function useCurrentSessionMessages(): Message[] {
    return useChatHistoryStateSelector(
        state => {
            if (!state.currentSessionId) return []
            const session = state.sessions.find(s => s.id === state.currentSessionId)
            return session?.messages ?? []
        },
        // Use shallow equality to compare message arrays
        shallowEqual
    )
}

/**
 * Get the chat history actions (methods) without subscribing to state changes
 * This hook never causes re-renders due to state changes
 * 
 * Use this when you only need to call actions like createSession, switchSession, etc.
 * 
 * @example
 * ```tsx
 * const { createSession, switchSession } = useChatHistoryActions()
 * // This component won't re-render when sessions change
 * ```
 * 
 * **Validates: Requirements 8.2**
 */
export function useChatHistoryActions() {
    const context = useContext(ChatHistoryContext)
    if (context === undefined) {
        throw new Error('useChatHistoryActions must be used within a ChatHistoryProvider')
    }
    
    // Return only the action methods, not the state
    return useMemo(() => ({
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
        // Sidebar redesign actions
        pinSession: context.pinSession,
        unpinSession: context.unpinSession,
        duplicateSession: context.duplicateSession,
        assignFolder: context.assignFolder,
        removeFromFolder: context.removeFromFolder,
        addTag: context.addTag,
        removeTag: context.removeTag,
        createFolder: context.createFolder,
        deleteFolder: context.deleteFolder,
        renameFolder: context.renameFolder,
        reorderFolder: context.reorderFolder,
    }), [
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
        // Sidebar redesign actions
        context.pinSession,
        context.unpinSession,
        context.duplicateSession,
        context.assignFolder,
        context.removeFromFolder,
        context.addTag,
        context.removeTag,
        context.createFolder,
        context.deleteFolder,
        context.renameFolder,
        context.reorderFolder,
    ])
}

/**
 * Get the folders list only
 * Only re-renders when the folders array changes
 * 
 * **Validates: Requirements 8.1, 8.2**
 */
export function useFolders(): Folder[] {
    return useChatHistoryStateSelector(state => state.folders)
}
