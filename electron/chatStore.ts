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

export interface ChatHistoryData {
    sessions: ChatSession[]
    folders: Folder[]  // Sidebar redesign: folder persistence (Requirement 11.6)
    version: number    // bumped to 2 for sidebar redesign migration
}

// In-memory cache to reduce disk reads
let cachedData: ChatHistoryData | null = null
let cacheTimestamp = 0
const CACHE_TTL = 1000 // 1 second cache

// Write serialization: prevents out-of-order async writes from corrupting
// the on-disk file and reverting the in-memory cache to stale data.
// Each write increments writeVersion; the async callback only updates the
// cache when its captured version still matches the latest.
// pendingWrite chains writes so they hit disk in order.
let writeVersion = 0
let pendingWrite: Promise<void> = Promise.resolve()

// Get the storage file path
function getStorePath(): string {
    const userDataPath = app.getPath('userData')
    return path.join(userDataPath, 'chat-history.json')
}

/**
 * Apply default values for sidebar redesign fields to a single session.
 * Used during v1→v2 migration to ensure backward compatibility.
 * Validates: Requirement 11.5 (backward compatibility — existing sessions load without data loss)
 * Exported for testing (Property 7).
 */
export function migrateSession(session: ChatSession): ChatSession {
    const rest = { ...(session as ChatSession & { archived?: boolean }) }
    delete rest.archived
    return {
        ...rest,
        pinned: session.pinned ?? false,
        folderId: session.folderId ?? null,
        tags: Array.isArray(session.tags) ? session.tags : [],
    }
}

// Migrate v1 data to v2 format (add folders array and default new session fields)
// Validates: Requirements 11.5, 11.6
// Exported for testing.
export function migrateData(data: ChatHistoryData): ChatHistoryData {
    if (data.version < 2) {
        return {
            sessions: data.sessions.map(migrateSession),
            folders: (data as any).folders ?? [],
            version: 2,
        }
    }
    // Ensure folders field exists even for v2+ data
    if (!data.folders) {
        data.folders = []
    }
    return data
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
            const parsed = migrateData(JSON.parse(data))
            cachedData = parsed
            cacheTimestamp = Date.now()
            return cachedData!
        }
    } catch (error) {
        console.error('Failed to read chat history:', error)
    }
    return { sessions: [], folders: [], version: 2 }
}

// Write data to file (async, serialized)
// Writes are chained via pendingWrite so they reach disk in order.
// The cache is only updated by the async callback when its version is
// still the latest, preventing a slow earlier write from reverting a
// newer cache entry.
async function writeStoreAsync(data: ChatHistoryData): Promise<void> {
    const myVersion = ++writeVersion

    const doWrite = async () => {
        const filePath = getStorePath()
        try {
            const dir = path.dirname(filePath)
            if (!fsSync.existsSync(dir)) {
                await fs.mkdir(dir, { recursive: true })
            }
            await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
            // Only update cache if no newer write has been queued
            if (myVersion === writeVersion) {
                cachedData = data
                cacheTimestamp = Date.now()
            }
        } catch (error) {
            console.error('Failed to write chat history:', error)
        }
    }

    // Chain after any in-flight write to serialize disk I/O
    pendingWrite = pendingWrite.then(doWrite)
    await pendingWrite
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
            const parsed = migrateData(JSON.parse(data))
            cachedData = parsed
            cacheTimestamp = Date.now()
            return cachedData!
        }
    } catch (error) {
        console.error('Failed to read chat history:', error)
    }
    return { sessions: [], folders: [], version: 2 }
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
    const currentData = readStore()
    writeStore({ sessions, folders: currentData.folders, version: 2 })
}

/**
 * Get all folders from the store.
 * Validates: Requirement 11.6 (persist Folder definitions alongside chat history data)
 */
export function getAllFolders(): Folder[] {
    return readStore().folders
}

/**
 * Save folders to the store, preserving existing sessions.
 * Validates: Requirement 11.6 (persist Folder definitions alongside chat history data)
 */
export function saveFolders(folders: Folder[]): void {
    const currentData = readStore()
    writeStore({ sessions: currentData.sessions, folders, version: 2 })
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
    const currentData = await readStoreAsync()
    await writeStoreAsync({ sessions, folders: currentData.folders, version: 2 })
}

/**
 * Get all folders from the store (async version).
 * Validates: Requirement 11.6
 */
export async function getAllFoldersAsync(): Promise<Folder[]> {
    const data = await readStoreAsync()
    return data.folders
}

/**
 * Save folders to the store, preserving existing sessions (async version).
 * Validates: Requirement 11.6
 */
export async function saveFoldersAsync(folders: Folder[]): Promise<void> {
    const currentData = await readStoreAsync()
    await writeStoreAsync({ sessions: currentData.sessions, folders, version: 2 })
}
