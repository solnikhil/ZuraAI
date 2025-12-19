// Secure storage for sensitive data like API keys
// Uses Electron's safeStorage API which encrypts data using OS keychain
// Falls back to plaintext storage if encryption is unavailable

import { safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

const STORAGE_FILE = path.join(app.getPath('userData'), 'secure-storage.json')

interface SecureData {
    openRouterApiKey?: string
    perplexityApiKey?: string
    geminiApiKey?: string
    groqApiKey?: string
}

interface StorageStatus {
    encryptionAvailable: boolean
    storageFileExists: boolean
    storagePath: string
    keyCount: number
    lastError: string | null
}

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

function readSecureData(): SecureData {
    try {
        if (!fs.existsSync(STORAGE_FILE)) {
            console.log('[SecureStorage] No storage file exists yet')
            return {}
        }

        const data = fs.readFileSync(STORAGE_FILE, 'utf-8')
        const parsed = JSON.parse(data)

        // Check if encryption is available
        const encryptionAvailable = isEncryptionAvailable()

        // Decrypt all values
        const decrypted: SecureData = {}
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string' && value) {
                try {
                    if (encryptionAvailable) {
                        // Try to decrypt
                        decrypted[key as keyof SecureData] = safeStorage.decryptString(Buffer.from(value, 'base64'))
                    } else {
                        // No encryption - read as plain text
                        decrypted[key as keyof SecureData] = value
                    }
                } catch (decryptError) {
                    // Decryption failed - this might be plaintext data from before encryption was available
                    // Or data encrypted with a different key (reinstalled OS, etc.)
                    console.warn(`[SecureStorage] Failed to decrypt ${key}, trying as plaintext:`, decryptError)

                    // Check if it looks like a valid API key (not base64 garbage)
                    if (value.startsWith('sk-') || value.startsWith('pplx-') || value.length < 100) {
                        decrypted[key as keyof SecureData] = value
                    } else {
                        console.error(`[SecureStorage] ${key} appears corrupted, skipping`)
                        lastStorageError = `Failed to decrypt ${key}`
                    }
                }
            }
        }

        console.log('[SecureStorage] Read', Object.keys(decrypted).length, 'keys')
        return decrypted
    } catch (error) {
        console.error('[SecureStorage] Failed to read secure storage:', error)
        lastStorageError = String(error)
        return {}
    }
}

function writeSecureData(data: SecureData): boolean {
    try {
        const dir = path.dirname(STORAGE_FILE)
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
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
                        // Fall back to plaintext for this key
                        toWrite[key] = value
                        lastStorageError = `Failed to encrypt ${key}`
                    }
                } else {
                    // No encryption available - store plaintext
                    console.warn(`[SecureStorage] Storing ${key} as plaintext (encryption unavailable)`)
                    toWrite[key] = value
                }
            }
        }

        fs.writeFileSync(STORAGE_FILE, JSON.stringify(toWrite, null, 2), 'utf-8')
        console.log('[SecureStorage] Wrote', Object.keys(toWrite).length, 'keys')
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
        if (fs.existsSync(STORAGE_FILE)) {
            fs.unlinkSync(STORAGE_FILE)
            console.log('[SecureStorage] Cleared storage file')
        }
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
        storageFileExists: fs.existsSync(STORAGE_FILE),
        storagePath: STORAGE_FILE,
        keyCount,
        lastError: lastStorageError
    }
}

