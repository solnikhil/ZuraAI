import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'

export interface Message {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    image?: string
    timestamp: number
    tokenCount?: number
    model?: string
    latency?: number
    usage?: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
    }
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
    addMessageToSession: (sessionId: string, message: Omit<Message, 'id' | 'timestamp'>) => void
    deleteSession: (id: string) => void
    clearAllSessions: () => void
    updateSessionTitle: (id: string, title: string) => void
    refreshSessions: () => Promise<void>
    clearCurrentSession: () => void
}

const ChatHistoryContext = createContext<ChatHistoryContextType | undefined>(undefined)

// Check if we're in Electron environment
const isElectron = typeof window !== 'undefined' && window.ipcRenderer

export function ChatHistoryProvider({ children }: { children: React.ReactNode }) {
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
                                console.log('Migrated chat history from localStorage to electron-store')
                                // Clear localStorage after successful migration
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
    useEffect(() => {
        if (!isInitialized) return

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

        saveSessions()
    }, [sessions, isInitialized])

    const refreshSessions = useCallback(async () => {
        await loadSessions()
    }, [loadSessions])

    const createSession = (firstMessage?: string) => {
        const initialMessages: Message[] = firstMessage ? [{
            id: uuidv4(),
            role: 'user',
            content: firstMessage,
            timestamp: Date.now()
        }] : []

        const newSession: ChatSession = {
            id: uuidv4(),
            title: firstMessage ? (firstMessage.slice(0, 30) + (firstMessage.length > 30 ? '...' : '')) : 'New Chat',
            messages: initialMessages,
            createdAt: Date.now(),
            updatedAt: Date.now()
        }
        setSessions(prev => [newSession, ...prev])
        setCurrentSessionId(newSession.id)
        return newSession.id
    }

    const switchSession = (id: string) => {
        if (sessions.find(s => s.id === id)) {
            setCurrentSessionId(id)
        }
    }

    const addMessageToSession = (sessionId: string, message: Omit<Message, 'id' | 'timestamp'>) => {
        const newMessage: Message = {
            ...message,
            id: uuidv4(),
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
    }

    const deleteSession = (id: string) => {
        setSessions(prev => prev.filter(s => s.id !== id))
        if (currentSessionId === id) {
            setCurrentSessionId(null)
        }
    }

    const clearAllSessions = () => {
        setSessions([])
        setCurrentSessionId(null)
    }

    const updateSessionTitle = (id: string, title: string) => {
        setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s))
    }

    const clearCurrentSession = () => {
        setCurrentSessionId(null)
    }

    return (
        <ChatHistoryContext.Provider value={{
            sessions,
            currentSessionId,
            isLoading,
            createSession,
            switchSession,
            addMessageToSession,
            deleteSession,
            clearAllSessions,
            updateSessionTitle,
            refreshSessions,
            clearCurrentSession
        }}>
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
