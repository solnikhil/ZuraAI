// Chat History Storage using simple JSON file
// This runs in the main process - uses async I/O to avoid blocking

import { app } from 'electron'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
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

// In-memory cache to reduce disk reads
let cachedData: ChatHistoryData | null = null
let cacheTimestamp = 0
const CACHE_TTL = 1000 // 1 second cache

// Get the storage file path
function getStorePath(): string {
    const userDataPath = app.getPath('userData')
    return path.join(userDataPath, 'chat-history.json')
}

// Read data from file (async)
async function readStoreAsync(): Promise<ChatHistoryData> {
    // Return cached data if fresh
    if (cachedData && Date.now() - cacheTimestamp < CACHE_TTL) {
        return cachedData
    }

    const filePath = getStorePath()
    try {
        const exists = fsSync.existsSync(filePath)
        if (exists) {
            const data = await fs.readFile(filePath, 'utf-8')
            cachedData = JSON.parse(data)
            cacheTimestamp = Date.now()
            return cachedData!
        }
    } catch (error) {
        console.error('Failed to read chat history:', error)
    }
    return { sessions: [], version: 1 }
}

// Write data to file (async)
async function writeStoreAsync(data: ChatHistoryData): Promise<void> {
    const filePath = getStorePath()
    try {
        const dir = path.dirname(filePath)
        if (!fsSync.existsSync(dir)) {
            await fs.mkdir(dir, { recursive: true })
        }
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
        // Update cache
        cachedData = data
        cacheTimestamp = Date.now()
    } catch (error) {
        console.error('Failed to write chat history:', error)
    }
}

// Sync versions for backward compatibility (uses cache when possible)
function readStore(): ChatHistoryData {
    if (cachedData && Date.now() - cacheTimestamp < CACHE_TTL) {
        return cachedData
    }
    const filePath = getStorePath()
    try {
        if (fsSync.existsSync(filePath)) {
            const data = fsSync.readFileSync(filePath, 'utf-8')
            cachedData = JSON.parse(data)
            cacheTimestamp = Date.now()
            return cachedData!
        }
    } catch (error) {
        console.error('Failed to read chat history:', error)
    }
    return { sessions: [], version: 1 }
}

function writeStore(data: ChatHistoryData): void {
    // Update cache immediately, write async
    cachedData = data
    cacheTimestamp = Date.now()
    writeStoreAsync(data).catch(err => console.error('Async write failed:', err))
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
        }
    }
}

export function getStoreFilePath(): string {
    return getStorePath()
}

// Async API for better performance
export async function getAllSessionsAsync(): Promise<ChatSession[]> {
    const data = await readStoreAsync()
    return data.sessions
}

export async function saveAllSessionsAsync(sessions: ChatSession[]): Promise<void> {
    await writeStoreAsync({ sessions, version: 1 })
}
