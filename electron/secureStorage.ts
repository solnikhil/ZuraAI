// Secure storage for sensitive data like API keys
// Uses Electron's safeStorage API which encrypts data using OS keychain
// Falls back to plaintext storage if encryption is unavailable

import { safeStorage } from 'electron'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { app } from 'electron'

const STORAGE_FILE = path.join(app.getPath('userData'), 'secure-storage.json')

interface SecureData {
    openRouterApiKey?: string
    perplexityApiKey?: string
    geminiApiKey?: string
    groqApiKey?: string
    tavilyApiKey?: string
}

interface StorageStatus {
    encryptionAvailable: boolean
    storageFileExists: boolean
    storagePath: string
    keyCount: number
    lastError: string | null
}

// In-memory cache to reduce disk reads
let cachedData: SecureData | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5000 // 5 second cache for secure data

// Track last error for diagnostics
let lastStorageError: string | null = null

function isEncryptionAvailable(): boolean {
    try {
        const available = safeStorage.isEncryptionAvailable()
        console.log('[SecureStorage] Encryption available:', available)
        return available
    } catch (error) {
        console.error('[SecureStorage] Error checking encryption:', error)
        lastStorageError = String(error)
        return false
    }
}

// Async read with caching
async function readSecureDataAsync(): Promise<SecureData> {
    // Return cached data if fresh
    if (cachedData && Date.now() - cacheTimestamp < CACHE_TTL) {
        return cachedData
    }

    try {
        const exists = fsSync.existsSync(STORAGE_FILE)
        if (!exists) {
            console.log('[SecureStorage] No storage file exists yet')
            return {}
        }

        const data = await fs.readFile(STORAGE_FILE, 'utf-8')
        const parsed = JSON.parse(data)
        const encryptionAvailable = isEncryptionAvailable()

        const decrypted: SecureData = {}
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string' && value) {
                try {
                    if (encryptionAvailable) {
                        decrypted[key as keyof SecureData] = safeStorage.decryptString(Buffer.from(value, 'base64'))
                    } else {
                        decrypted[key as keyof SecureData] = value
                    }
                } catch (decryptError) {
                    console.warn(`[SecureStorage] Failed to decrypt ${key}, trying as plaintext:`, decryptError)
                    if (value.startsWith('sk-') || value.startsWith('pplx-') || value.startsWith('tvly-') || value.length < 100) {
                        decrypted[key as keyof SecureData] = value
                    } else {
                        console.error(`[SecureStorage] ${key} appears corrupted, skipping`)
                        lastStorageError = `Failed to decrypt ${key}`
                    }
                }
            }
        }

        cachedData = decrypted
        cacheTimestamp = Date.now()
        console.log('[SecureStorage] Read', Object.keys(decrypted).length, 'keys')
        return decrypted
    } catch (error) {
        console.error('[SecureStorage] Failed to read secure storage:', error)
        lastStorageError = String(error)
        return {}
    }
}

// Sync read with caching (for backward compatibility)
function readSecureData(): SecureData {
    if (cachedData && Date.now() - cacheTimestamp < CACHE_TTL) {
        return cachedData
    }

    try {
        if (!fsSync.existsSync(STORAGE_FILE)) {
            console.log('[SecureStorage] No storage file exists yet')
            return {}
        }

        const data = fsSync.readFileSync(STORAGE_FILE, 'utf-8')
        const parsed = JSON.parse(data)
        const encryptionAvailable = isEncryptionAvailable()

        const decrypted: SecureData = {}
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string' && value) {
                try {
                    if (encryptionAvailable) {
                        decrypted[key as keyof SecureData] = safeStorage.decryptString(Buffer.from(value, 'base64'))
                    } else {
                        decrypted[key as keyof SecureData] = value
                    }
                } catch (decryptError) {
                    console.warn(`[SecureStorage] Failed to decrypt ${key}, trying as plaintext:`, decryptError)
                    if (value.startsWith('sk-') || value.startsWith('pplx-') || value.startsWith('tvly-') || value.length < 100) {
                        decrypted[key as keyof SecureData] = value
                    } else {
                        console.error(`[SecureStorage] ${key} appears corrupted, skipping`)
                        lastStorageError = `Failed to decrypt ${key}`
                    }
                }
            }
        }

        cachedData = decrypted
        cacheTimestamp = Date.now()
        console.log('[SecureStorage] Read', Object.keys(decrypted).length, 'keys')
        return decrypted
    } catch (error) {
        console.error('[SecureStorage] Failed to read secure storage:', error)
        lastStorageError = String(error)
        return {}
    }
}

// Async write
async function writeSecureDataAsync(data: SecureData): Promise<boolean> {
    try {
        const dir = path.dirname(STORAGE_FILE)
        if (!fsSync.existsSync(dir)) {
            await fs.mkdir(dir, { recursive: true })
        }

        const encryptionAvailable = isEncryptionAvailable()
        const toWrite: Record<string, string> = {}

        for (const [key, value] of Object.entries(data)) {
            if (value && typeof value === 'string') {
                if (encryptionAvailable) {
                    try {
                        toWrite[key] = safeStorage.encryptString(value).toString('base64')
                    } catch (encryptError) {
                        console.error(`[SecureStorage] Failed to encrypt ${key}:`, encryptError)
                        toWrite[key] = value
                        lastStorageError = `Failed to encrypt ${key}`
                    }
                } else {
                    console.warn(`[SecureStorage] Storing ${key} as plaintext (encryption unavailable)`)
                    toWrite[key] = value
                }
            }
        }

        await fs.writeFile(STORAGE_FILE, JSON.stringify(toWrite, null, 2), 'utf-8')
        
        // Update cache
        cachedData = data
        cacheTimestamp = Date.now()
        
        console.log('[SecureStorage] Wrote', Object.keys(toWrite).length, 'keys')
        return true
    } catch (error) {
        console.error('[SecureStorage] Failed to write secure storage:', error)
        lastStorageError = String(error)
        return false
    }
}

// Sync write - writes synchronously to ensure data is persisted immediately
function writeSecureData(data: SecureData): boolean {
    try {
        const dir = path.dirname(STORAGE_FILE)
        if (!fsSync.existsSync(dir)) {
            fsSync.mkdirSync(dir, { recursive: true })
        }

        const encryptionAvailable = isEncryptionAvailable()
        const toWrite: Record<string, string> = {}

        for (const [key, value] of Object.entries(data)) {
            if (value && typeof value === 'string') {
                if (encryptionAvailable) {
                    try {
                        toWrite[key] = safeStorage.encryptString(value).toString('base64')
                    } catch (encryptError) {
                        console.error(`[SecureStorage] Failed to encrypt ${key}:`, encryptError)
                        toWrite[key] = value
                        lastStorageError = `Failed to encrypt ${key}`
                    }
                } else {
                    console.warn(`[SecureStorage] Storing ${key} as plaintext (encryption unavailable)`)
                    toWrite[key] = value
                }
            }
        }

        // Write synchronously to ensure data is persisted before returning
        fsSync.writeFileSync(STORAGE_FILE, JSON.stringify(toWrite, null, 2), 'utf-8')
        
        // Update cache
        cachedData = data
        cacheTimestamp = Date.now()
        
        console.log('[SecureStorage] Wrote', Object.keys(toWrite).length, 'keys (sync)')
        return true
    } catch (error) {
        console.error('[SecureStorage] Failed to write secure storage:', error)
        lastStorageError = String(error)
        return false
    }
}

export function getSecureValue(key: keyof SecureData): string {
    const data = readSecureData()
    const value = data[key] || ''
    console.log(`[SecureStorage] Get ${key}:`, value ? '(has value)' : '(empty)')
    return value
}

export function setSecureValue(key: keyof SecureData, value: string): boolean {
    console.log(`[SecureStorage] Set ${key}:`, value ? '(has value)' : '(clearing)')
    const data = readSecureData()
    if (value && value.trim()) {
        data[key] = value.trim()
    } else {
        delete data[key]
    }
    return writeSecureData(data)
}

export function getAllSecureValues(): SecureData {
    return readSecureData()
}

export function clearSecureStorage(): boolean {
    try {
        if (fsSync.existsSync(STORAGE_FILE)) {
            fsSync.unlinkSync(STORAGE_FILE)
            console.log('[SecureStorage] Cleared storage file')
        }
        cachedData = null
        cacheTimestamp = 0
        return true
    } catch (error) {
        console.error('[SecureStorage] Failed to clear secure storage:', error)
        lastStorageError = String(error)
        return false
    }
}

// Diagnostic function to check storage status
export function getStorageStatus(): StorageStatus {
    let keyCount = 0
    try {
        const data = readSecureData()
        keyCount = Object.keys(data).filter(k => data[k as keyof SecureData]).length
    } catch {
        // Ignore
    }

    return {
        encryptionAvailable: isEncryptionAvailable(),
        storageFileExists: fsSync.existsSync(STORAGE_FILE),
        storagePath: STORAGE_FILE,
        keyCount,
        lastError: lastStorageError
    }
}

// Async API for better performance
export async function getSecureValueAsync(key: keyof SecureData): Promise<string> {
    const data = await readSecureDataAsync()
    return data[key] || ''
}

export async function setSecureValueAsync(key: keyof SecureData, value: string): Promise<boolean> {
    const data = await readSecureDataAsync()
    if (value && value.trim()) {
        data[key] = value.trim()
    } else {
        delete data[key]
    }
    return writeSecureDataAsync(data)
}

export async function getAllSecureValuesAsync(): Promise<SecureData> {
    return readSecureDataAsync()
}
