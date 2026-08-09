// Secure storage for sensitive data like API keys
// Uses Electron's safeStorage API which encrypts data using OS keychain

import { safeStorage, app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { writeFileAtomic } from './utils/atomicFile'
import { RecoverableSerializedTaskQueue } from './utils/serializedTaskQueue'
import { log } from './startup/logger'

const storageLog = log.withTag('storage')

const STORAGE_FILE = path.join(app.getPath('userData'), 'secure-storage.json')

interface SecureData {
  openRouterApiKey?: string
  groqApiKey?: string
  tavilyApiKey?: string
  alibabaApiKey?: string
  deepseekApiKey?: string
  opencodeGoApiKey?: string
  fireworksApiKey?: string
  nvidiaApiKey?: string
  brevoApiKey?: string
  [key: string]: string | undefined
}

let cachedData: SecureData | null = null
let cacheTimestamp = 0
// Keep decrypted values in memory briefly to reduce repeated disk reads and decrypt work.
const CACHE_TTL = 30000
const secureOperations = new RecoverableSerializedTaskQueue()

function cloneSecureData(data: SecureData): SecureData {
  return { ...data }
}

function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    storageLog.warn('unable to determine safeStorage encryption availability')
    return false
  }
}

const VERSION_TAG = 'v1:'

const KNOWN_API_KEY_PREFIXES = ['sk-', 'tvly-', 'dashscope-', 'fw-', 'nvapi-', 'xkeysib-']

function isLikelyLegacyPlaintextSecret(value: string): boolean {
  return KNOWN_API_KEY_PREFIXES.some((prefix) => value.startsWith(prefix))
}

async function readSecureDataAsync(): Promise<SecureData> {
  if (cachedData && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cloneSecureData(cachedData)
  }

  try {
    const data = await fs.readFile(STORAGE_FILE, 'utf-8')
    const parsed = JSON.parse(data) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SyntaxError('Secure storage root must be an object.')
    }
    const encryptionAvailable = isEncryptionAvailable()

    if (!encryptionAvailable) {
      storageLog.error('secure storage unavailable: OS-backed encryption is required')
      throw new Error('OS-backed secure storage encryption is unavailable.')
    }

    const decrypted: SecureData = {}
    let migratedLegacyPlaintext = false
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value) {
        if (value.startsWith(VERSION_TAG)) {
          // Tagged encrypted value - strip prefix and decrypt
          const base64Payload = value.slice(VERSION_TAG.length)
          try {
            decrypted[key as keyof SecureData] = safeStorage.decryptString(
              Buffer.from(base64Payload, 'base64')
            )
          } catch {
            // Corrupt v1: tagged value - do not treat as legacy plaintext
            storageLog.warn(`corrupt v1-tagged secure storage entry for key "${key}" - skipping`)
          }
        } else {
          // No version tag - attempt decryption (pre-v1 encrypted format)
          try {
            decrypted[key as keyof SecureData] = safeStorage.decryptString(
              Buffer.from(value, 'base64')
            )
            migratedLegacyPlaintext = true // re-write with v1: tag
          } catch {
            // Decryption failed - check if it matches known API key prefixes
            if (isLikelyLegacyPlaintextSecret(value)) {
              decrypted[key as keyof SecureData] = value
              migratedLegacyPlaintext = true
            } else {
              storageLog.warn(`failed to decrypt secure storage entry for key "${key}" - skipping`)
            }
          }
        }
      }
    }

    if (migratedLegacyPlaintext) {
      const migrated = await writeSecureDataAsync(decrypted)
      if (!migrated) {
        storageLog.error('failed to migrate legacy plaintext secure storage entries')
        throw new Error(
          'Secure storage migration failed: legacy plaintext entries could not be re-encrypted. Refusing to return unencrypted credentials.'
        )
      }
    }

    cachedData = decrypted
    cacheTimestamp = Date.now()
    return cloneSecureData(decrypted)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    if (error instanceof SyntaxError) {
      storageLog.error('secure storage file is corrupt and requires recovery')
      throw new Error('Secure storage contains invalid JSON.', { cause: error })
    }
    storageLog.error('failed to read secure storage data')
    throw error
  }
}

export async function getSecureValuePresenceAsync(
  keys: readonly string[]
): Promise<Record<string, boolean>> {
  return secureOperations.run(async () => {
    const presence: Record<string, boolean> = {}
    for (const key of keys) {
      presence[key] = false
    }

    try {
      const data = await fs.readFile(STORAGE_FILE, 'utf-8')
      const parsed = JSON.parse(data) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new SyntaxError('Secure storage root must be an object.')
      }
      for (const key of keys) {
        const value = (parsed as Record<string, unknown>)[key]
        presence[key] = typeof value === 'string' && value.trim().length > 0
      }
      return presence
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return presence
      storageLog.error('failed to read secure storage key presence')
      throw error
    }
  })
}

async function writeSecureDataAsync(data: SecureData): Promise<boolean> {
  try {
    if (!isEncryptionAvailable()) {
      storageLog.error('secure storage unavailable: refusing to persist secrets without encryption')
      return false
    }

    const toWrite: Record<string, string> = {}

    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'string') {
        toWrite[key] = VERSION_TAG + safeStorage.encryptString(value).toString('base64')
      }
    }

    await writeFileAtomic(STORAGE_FILE, JSON.stringify(toWrite, null, 2))
    cachedData = cloneSecureData(data)
    cacheTimestamp = Date.now()
    return true
  } catch {
    storageLog.error('failed to write secure storage data')
    return false
  }
}

export async function getSecureValueAsync(key: string): Promise<string> {
  return secureOperations.run(async () => {
    const data = await readSecureDataAsync()
    return data[key] || ''
  })
}

export async function setSecureValueAsync(key: string, value: string): Promise<boolean> {
  return secureOperations.run(async () => {
    const data = await readSecureDataAsync()
    const nextData = cloneSecureData(data)
    if (value && value.trim()) {
      nextData[key] = value.trim()
    } else {
      delete nextData[key]
    }
    return writeSecureDataAsync(nextData)
  })
}
