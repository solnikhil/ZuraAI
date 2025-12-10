// Chat History Storage using simple JSON file
// This runs in the main process - no external dependencies needed

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export interface Message {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    image?: string
    timestamp: number
    tokenCount?: number
}

export interface ChatSession {
    id: string
    title: string
    messages: Message[]
    createdAt: number
    updatedAt: number
    totalTokens?: number
}

interface ChatHistoryData {
    sessions: ChatSession[]
    version: number
}

// Get the storage file path
function getStorePath(): string {
    const userDataPath = app.getPath('userData')
    return path.join(userDataPath, 'chat-history.json')
}

// Read data from file
function readStore(): ChatHistoryData {
    const filePath = getStorePath()
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8')
            return JSON.parse(data)
        }
    } catch (error) {
        console.error('Failed to read chat history:', error)
    }
    return { sessions: [], version: 1 }
}

// Write data to file
function writeStore(data: ChatHistoryData): void {
    const filePath = getStorePath()
    try {
        const dir = path.dirname(filePath)
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (error) {
        console.error('Failed to write chat history:', error)
    }
}

export function getAllSessions(): ChatSession[] {
    return readStore().sessions
}

export function saveAllSessions(sessions: ChatSession[]): void {
    writeStore({ sessions, version: 1 })
}

export function getSession(id: string): ChatSession | undefined {
    const sessions = getAllSessions()
    return sessions.find(s => s.id === id)
}

export function createSession(session: ChatSession): void {
    const sessions = getAllSessions()
    sessions.unshift(session)
    saveAllSessions(sessions)
}

export function updateSession(id: string, updates: Partial<ChatSession>): void {
    const sessions = getAllSessions()
    const index = sessions.findIndex(s => s.id === id)
    if (index !== -1) {
        sessions[index] = { ...sessions[index], ...updates }
        saveAllSessions(sessions)
    }
}

export function addMessageToSession(sessionId: string, message: Message): void {
    const sessions = getAllSessions()
    const session = sessions.find(s => s.id === sessionId)
    if (session) {
        session.messages.push(message)
        session.updatedAt = Date.now()

        if (message.tokenCount) {
            session.totalTokens = (session.totalTokens || 0) + message.tokenCount
        }

        saveAllSessions(sessions)
    }
}

export function deleteSession(id: string): void {
    const sessions = getAllSessions().filter(s => s.id !== id)
    saveAllSessions(sessions)
}

export function clearAllSessions(): void {
    saveAllSessions([])
}

export function migrateFromLocalStorage(localStorageData: ChatSession[]): void {
    if (localStorageData && localStorageData.length > 0) {
        const existingSessions = getAllSessions()
        if (existingSessions.length === 0) {
            saveAllSessions(localStorageData)
            console.log(`Migrated ${localStorageData.length} sessions from localStorage`)
        }
    }
}

export function getStoreFilePath(): string {
    return getStorePath()
}
