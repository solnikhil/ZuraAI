import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useSettings } from './SettingsContext'

export interface ToolCallResult {
    toolCall: {
        id: string
        name: string
        arguments: Record<string, any>
    }
    result: {
        success: boolean
        data?: any
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
}

interface ChatHistoryContextType {
    sessions: ChatSession[]
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
}

const ChatHistoryContext = createContext<ChatHistoryContextType | undefined>(undefined)

// Check if we're in Electron environment
const isElectron = typeof window !== 'undefined' && Boolean(window.ipcRenderer)
const LAST_SESSION_ID_KEY = 'zura-ui:lastChatSessionId'

export function ChatHistoryProvider({ children }: { children: React.ReactNode }) {
    const { settings } = useSettings()
    const [sessions, setSessions] = useState<ChatSession[]>([])
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isInitialized, setIsInitialized] = useState(false)

    // Load sessions from electron-store or localStorage
    const loadSessions = useCallback(async () => {
        try {
            if (isElectron) {
                const storedSessions = await window.ipcRenderer.invoke('chat-store:get-all')
                setSessions(storedSessions || [])
            } else {
                // Fallback to localStorage for non-Electron environments
                const saved = localStorage.getItem('zura-chat-history')
                setSessions(saved ? JSON.parse(saved) : [])
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
    }, [])

    // Initialize and migrate from localStorage if needed
    useEffect(() => {
        const initializeStore = async () => {
            if (isElectron) {
                try {
                    // Check if electron-store has data
                    const storedSessions = await window.ipcRenderer.invoke('chat-store:get-all')

                    // If empty, try to migrate from localStorage
                    if (!storedSessions || storedSessions.length === 0) {
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

    // Save sessions whenever they change (after initialization)
    // Debounced to avoid excessive IPC/disk writes during streaming.
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
        }, 750)

        return () => clearTimeout(timeoutId)
    }, [sessions, isInitialized])

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
        const initialMessages: Message[] = firstMessage ? [{
            id: crypto.randomUUID(),
            role: 'user',
            content: firstMessage,
            timestamp: Date.now()
        }] : []

        const newSession: ChatSession = {
            id: crypto.randomUUID(),
            title: firstMessage ? (firstMessage.slice(0, 30) + (firstMessage.length > 30 ? '...' : '')) : 'New Chat',
            messages: initialMessages,
            createdAt: Date.now(),
            updatedAt: Date.now()
        }
        setSessions(prev => [newSession, ...prev])
        setCurrentSessionId(newSession.id)
        return newSession.id
    }, [])

    const switchSession = useCallback((id: string) => {
        setSessions(prev => {
            if (prev.find(s => s.id === id)) {
                setCurrentSessionId(id)
            }
            return prev
        })
    }, [])

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

                return {
                    ...session,
                    title: newTitle,
                    messages: [...session.messages, newMessage],
                    updatedAt: Date.now()
                }
            }
            return session
        }))
        
        return newMessage.id
    }, [])

    const updateStreamingMessage = useCallback((sessionId: string, messageId: string, updates: Partial<Message>) => {
        setSessions(prev => prev.map(session => {
            if (session.id === sessionId) {
                return {
                    ...session,
                    messages: session.messages.map(msg =>
                        msg.id === messageId ? { ...msg, ...updates } : msg
                    ),
                    updatedAt: Date.now()
                }
            }
            return session
        }))
    }, [])

    const deleteSession = useCallback((id: string) => {
        setSessions(prev => prev.filter(s => s.id !== id))
        setCurrentSessionId(prev => prev === id ? null : prev)
    }, [])

    const clearAllSessions = useCallback(() => {
        setSessions([])
        setCurrentSessionId(null)
    }, [])

    const updateSessionTitle = useCallback((id: string, title: string) => {
        setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s))
    }, [])

    const clearCurrentSession = useCallback(() => {
        // Clear the remembered session so it doesn't auto-restore
        localStorage.removeItem(LAST_SESSION_ID_KEY)
        setCurrentSessionId(null)
    }, [])

    const deleteMessageFromSession = useCallback((sessionId: string, messageId: string) => {
        setSessions(prev => prev.map(session => {
            if (session.id === sessionId) {
                return {
                    ...session,
                    messages: session.messages.filter(msg => msg.id !== messageId),
                    updatedAt: Date.now()
                }
            }
            return session
        }))
    }, [])

    const contextValue = useMemo(() => ({
        sessions,
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
        clearCurrentSession
    }), [
        sessions,
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
        clearCurrentSession
    ])

    return (
        <ChatHistoryContext.Provider value={contextValue}>
            {children}
        </ChatHistoryContext.Provider>
    )
}

export function useChatHistory() {
    const context = useContext(ChatHistoryContext)
    if (context === undefined) {
        throw new Error('useChatHistory must be used within a ChatHistoryProvider')
    }
    return context
}
