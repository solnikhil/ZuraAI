// Secure storage for sensitive data like API keys
// Uses Electron's safeStorage API which encrypts data using OS keychain

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
    minimaxApiKey?: string
    voyageApiKey?: string
}

interface StorageStatus {
    encryptionAvailable: boolean
    storageFileExists: boolean
    storagePath: string
    keyCount: number
    lastError: string | null
}

let cachedData: SecureData | null = null
let cacheTimestamp = 0
// Requirements: 3.4 - Secure storage cache TTL of 30 seconds minimum
const CACHE_TTL = 30000
let lastStorageError: string | null = null

function isEncryptionAvailable(): boolean {
    try {
        return safeStorage.isEncryptionAvailable()
    } catch (error) {
        lastStorageError = String(error)
        return false
    }
}

async function readSecureDataAsync(): Promise<SecureData> {
    if (cachedData && Date.now() - cacheTimestamp < CACHE_TTL) {
        return cachedData
    }

    try {
        if (!fsSync.existsSync(STORAGE_FILE)) {
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
                } catch {
                    if (value.startsWith('sk-') || value.startsWith('pplx-') || value.startsWith('tvly-') || value.length < 100) {
                        decrypted[key as keyof SecureData] = value
                    }
                }
            }
        }

        cachedData = decrypted
        cacheTimestamp = Date.now()
        return decrypted
    } catch (error) {
        lastStorageError = String(error)
        return {}
    }
}

function readSecureData(): SecureData {
    if (cachedData && Date.now() - cacheTimestamp < CACHE_TTL) {
        return cachedData
    }

    try {
        if (!fsSync.existsSync(STORAGE_FILE)) {
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
                } catch {
                    if (value.startsWith('sk-') || value.startsWith('pplx-') || value.startsWith('tvly-') || value.length < 100) {
                        decrypted[key as keyof SecureData] = value
                    }
                }
            }
        }

        cachedData = decrypted
        cacheTimestamp = Date.now()
        return decrypted
    } catch (error) {
        lastStorageError = String(error)
        return {}
    }
}

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
                    } catch {
                        toWrite[key] = value
                    }
                } else {
                    toWrite[key] = value
                }
            }
        }

        await fs.writeFile(STORAGE_FILE, JSON.stringify(toWrite, null, 2), 'utf-8')
        cachedData = data
        cacheTimestamp = Date.now()
        return true
    } catch (error) {
        lastStorageError = String(error)
        return false
    }
}

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
                    } catch {
                        toWrite[key] = value
                    }
                } else {
                    toWrite[key] = value
                }
            }
        }

        fsSync.writeFileSync(STORAGE_FILE, JSON.stringify(toWrite, null, 2), 'utf-8')
        cachedData = data
        cacheTimestamp = Date.now()
        return true
    } catch (error) {
        lastStorageError = String(error)
        return false
    }
}

export function getSecureValue(key: keyof SecureData): string {
    const data = readSecureData()
    return data[key] || ''
}

export function setSecureValue(key: keyof SecureData, value: string): boolean {
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
        }
        cachedData = null
        cacheTimestamp = 0
        return true
    } catch (error) {
        lastStorageError = String(error)
        return false
    }
}

export function getStorageStatus(): StorageStatus {
    let keyCount = 0
    try {
        const data = readSecureData()
        keyCount = Object.keys(data).filter(k => data[k as keyof SecureData]).length
    } catch { /* ignore */ }

    return {
        encryptionAvailable: isEncryptionAvailable(),
        storageFileExists: fsSync.existsSync(STORAGE_FILE),
        storagePath: STORAGE_FILE,
        keyCount,
        lastError: lastStorageError
    }
}

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
